// Images de la pile construites depuis la copie du dépôt (#102). Les images du
// legacy et du service d'archivage sont communes à toute la machine (projet
// Compose `migrabench`) : la dernière copie du dépôt qui les a construites
// n'est pas forcément celle qui recrée la pile. Chaque image porte donc un
// label, l'empreinte du contexte de construction de son service, posé au
// build (docker-compose.yml) ; la pile recréée est refusée si le label d'une
// image en cours diffère de l'empreinte calculée sur la copie.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { cited, sha256 } from "../shared/digest.ts";
import { stdoutOf } from "../shared/process.ts";
import { ROOT } from "../shared/root.ts";

// Label de l'image : l'empreinte du contexte de construction de son service.
export const CONTEXT_LABEL = "org.migrabench.context-digest";

// Services recréés à chaque exécution complète, leur Dockerfile depuis la
// racine du dépôt (contexte de construction), et la variable de
// docker-compose.yml qui porte l'empreinte jusqu'au label.
export const STACK_SERVICES = {
  legacy: { dockerfile: "fixtures/legacy-app/Dockerfile", env: "MB_LEGACY_CONTEXT_DIGEST" },
  archive: { dockerfile: "fixtures/archive-service/Dockerfile", env: "MB_ARCHIVE_CONTEXT_DIGEST" },
} as const;
export type StackService = keyof typeof STACK_SERVICES;
export const SERVICES = Object.keys(STACK_SERVICES) as StackService[];

// Empreinte du contexte de construction d'un Dockerfile : le Dockerfile, le
// .dockerignore, et chaque fichier que ses COPY prennent dans le contexte
// (pas ceux `--from` d'une autre étape), hors ce que .dockerignore exclut.
// Liste triée de « chemin depuis la racine, empreinte », hachée. Une forme de
// COPY que la fonction ne sait pas lire est refusée plutôt qu'une source
// manquée.
export async function contextDigest(root: string, dockerfile: string): Promise<string> {
  const ignore = await dockerignore(root);
  const paths = new Set<string>([dockerfile, ".dockerignore"]);
  for (const source of copySources(await readFile(join(root, dockerfile), "utf8"), dockerfile)) {
    for (const path of await filesUnder(root, source, ignore)) paths.add(path);
  }
  const lines = [];
  for (const path of [...paths].sort()) lines.push(`${path}\0${sha256(await readFile(join(root, path)))}\n`);
  return cited(sha256(lines.join("")));
}

// Empreinte du contexte de chaque service de la pile, sur la copie du dépôt.
export async function stackContextDigests(root = ROOT): Promise<Record<StackService, string>> {
  const digests = {} as Record<StackService, string>;
  for (const service of SERVICES) digests[service] = await contextDigest(root, STACK_SERVICES[service].dockerfile);
  return digests;
}

// Variables de docker-compose.yml qui posent les labels au build.
export function contextDigestEnv(digests: Record<StackService, string>): Record<string, string> {
  return Object.fromEntries(SERVICES.map((service) => [STACK_SERVICES[service].env, digests[service]]));
}

// Pile recréée sur des images qui ne viennent pas de la copie : incident du
// banc, jamais imputable au candidat. Le message est la preuve.
export class StackNotFromCopy extends Error {
  constructor(mismatches: readonly string[]) {
    super(`Stack images not built from this copy of the repository: ${mismatches.join("; ")}`);
    this.name = "StackNotFromCopy";
  }
}

// Compare le label de l'image de chaque conteneur en cours, lu sur le conteneur, à l'empreinte
// attendue ; lève StackNotFromCopy en nommant chaque service qui diffère.
export async function verifyStackImages(expected: Record<StackService, string>): Promise<void> {
  const mismatches = [];
  for (const service of SERVICES) {
    const container = await stdoutOf("docker", ["compose", "ps", "--quiet", service]);
    if (container === "") throw new Error(`No running container for service ${service}`);
    // Labels du conteneur, qui reprennent ceux de son image : l'image d'un
    // conteneur en cours peut avoir perdu son tag, voire avoir été supprimée.
    const { image, labels } = JSON.parse(await stdoutOf("docker", ["inspect", "--format", '{"image":{{json .Image}},"labels":{{json .Config.Labels}}}', container])) as {
      image: string;
      labels: Record<string, string> | null;
    };
    const found = labels?.[CONTEXT_LABEL] || "no context label";
    if (found !== expected[service]) mismatches.push(`${service} image ${image} carries ${found}, this copy gives ${expected[service]}`);
  }
  if (mismatches.length > 0) throw new StackNotFromCopy(mismatches);
}

// Sources des COPY d'un Dockerfile lues dans le contexte, chemins depuis sa racine.
function copySources(text: string, dockerfile: string): string[] {
  const sources = [];
  const instructions = text
    .replace(/\\\r?\n/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  for (const instruction of instructions) {
    const [keyword = "", ...args] = instruction.split(/\s+/);
    const upper = keyword.toUpperCase();
    if (upper === "ADD") throw new Error(`${dockerfile}: ADD is not supported, use COPY: ${instruction}`);
    if (upper !== "COPY") continue;
    const flags = args.filter((arg) => arg.startsWith("--"));
    if (flags.some((flag) => flag.startsWith("--from="))) continue;
    const paths = args.filter((arg) => !arg.startsWith("--"));
    const unreadable = paths.length < 2 || paths.some((path) => /[[\]*?"]/.test(path));
    if (unreadable) throw new Error(`${dockerfile}: unsupported COPY form, sources must be plain paths: ${instruction}`);
    sources.push(...paths.slice(0, -1).map((path) => path.replace(/^\.\//, "").replace(/\/$/, "")));
  }
  return sources;
}

// Motifs de .dockerignore, en expressions régulières sur un chemin depuis la
// racine : `**/` pour toute profondeur, `*` dans un segment.
async function dockerignore(root: string): Promise<RegExp[]> {
  const text = await readFile(join(root, ".dockerignore"), "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((pattern) => {
      if (pattern.startsWith("!")) throw new Error(`.dockerignore: exception patterns are not supported: ${pattern}`);
      const body = pattern
        .replace(/^\/+|\/+$/g, "")
        .split("**/")
        .map((part) => part.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*/g, "[^/]*"))
        .join("(?:.*/)?");
      return new RegExp(`^${body}$`);
    });
}

async function filesUnder(root: string, source: string, ignore: readonly RegExp[]): Promise<string[]> {
  if (ignore.some((pattern) => pattern.test(source))) return [];
  const path = join(root, source);
  if (!(await stat(path)).isDirectory()) return [source];
  const files = [];
  for (const entry of await readdir(path)) files.push(...(await filesUnder(root, relative(root, join(path, entry)), ignore)));
  return files;
}
