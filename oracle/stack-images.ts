// Images de la pile construites depuis la copie du dépôt (#102). Les images du
// legacy et du service d'archivage sont communes à toute la machine (projet
// Compose `migrabench`) : la dernière copie du dépôt qui les a construites
// n'est pas forcément celle qui recrée la pile. Chaque image porte donc un
// label, l'empreinte du contexte de construction de son service, posé au
// build (docker-compose.yml) ; une image dont le label diffère de l'empreinte
// calculée sur la copie est refusée.
//
// L'empreinte prend tout le contexte de construction, moins ce que
// .dockerignore exclut, avec la sémantique de Docker (@balena/dockerignore,
// portage de son implémentation). Les fichiers ne sont pas déduits des COPY :
// un contrôle plus large qui refuse parfois pour rien vaut mieux qu'un
// contrôle qui rate un fichier sans le dire.
import type { Dirent } from "node:fs";
import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import { join } from "node:path";
import dockerignoreModule from "@balena/dockerignore";
import { cited, sha256 } from "../shared/digest.ts";
import { spawnCommand, stdoutOf } from "../shared/process.ts";
import { ROOT } from "../shared/root.ts";

// Paquet CommonJS : sous NodeNext, ses types placent la fabrique sous
// `default`, où son module la remet aussi.
const ignore = dockerignoreModule.default;

// Label de l'image : l'empreinte du contexte de construction de son service.
export const CONTEXT_LABEL = "org.migrabench.context-digest";

// Services recréés à chaque exécution complète, leur contexte de construction
// depuis la racine du dépôt (celui de docker-compose.yml), et la variable de
// docker-compose.yml qui porte l'empreinte jusqu'au label.
export const STACK_SERVICES = {
  legacy: { context: ".", env: "MB_LEGACY_CONTEXT_DIGEST" },
  archive: { context: ".", env: "MB_ARCHIVE_CONTEXT_DIGEST" },
} as const;
export type StackService = keyof typeof STACK_SERVICES;
export const SERVICES = Object.keys(STACK_SERVICES) as StackService[];

// Remède à une pile construite depuis une autre copie du dépôt.
export const STACK_REMEDY = "run `npm run stack:up` from this copy of the repository";

// Empreinte d'un contexte de construction : chaque entrée que Docker enverrait
// (fichier, lien symbolique non suivi), hors .dockerignore, triée par chemin,
// avec l'empreinte de son contenu ou de sa cible ; la liste est hachée.
export async function contextDigest(contextDir: string): Promise<string> {
  const dockerignore = await readFile(join(contextDir, ".dockerignore"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const ignored = ignore().add(dockerignore);
  // Sans motif d'exception, un dossier exclu l'est avec tout son contenu :
  // inutile d'y descendre (node_modules, .git).
  const prune = !dockerignore.split(/\r?\n/).some((line) => line.trim().startsWith("!"));
  const lines: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries: Dirent[] = await readdir(join(contextDir, dir), { withFileTypes: true });
    for (const entry of entries) {
      const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
      const excluded = ignored.ignores(path);
      if (entry.isDirectory()) {
        if (!(excluded && prune)) await walk(path);
      } else if (excluded) {
        continue;
      } else if (entry.isSymbolicLink()) {
        lines.push(`${path}\0link\0${sha256(await readlink(join(contextDir, path)))}\n`);
      } else if (entry.isFile()) {
        lines.push(`${path}\0file\0${sha256(await readFile(join(contextDir, path)))}\n`);
      } else {
        throw new Error(`Unsupported entry in the build context: ${path} (${(await lstat(join(contextDir, path))).mode.toString(8)})`);
      }
    }
  };
  await walk("");
  return cited(sha256(lines.sort().join("")));
}

// Empreinte du contexte de construction de chaque service de la pile.
export type StackContextDigests = Record<StackService, string>;

// Empreinte du contexte de chaque service de la pile, sur la copie du dépôt.
export async function stackContextDigests(root = ROOT): Promise<StackContextDigests> {
  const digests = {} as StackContextDigests;
  for (const service of SERVICES) digests[service] = await contextDigest(join(root, STACK_SERVICES[service].context));
  return digests;
}

// Variables de docker-compose.yml qui posent les labels au build.
export function contextDigestEnv(digests: StackContextDigests): Record<string, string> {
  return Object.fromEntries(SERVICES.map((service) => [STACK_SERVICES[service].env, digests[service]]));
}

// Images de la pile construites depuis une autre copie du dépôt : incident du
// banc, jamais imputable au candidat (cause `stack-not-from-this-copy`). Le
// message est la preuve, et donne le remède.
export class StackNotFromCopy extends Error {
  constructor(mismatches: readonly string[]) {
    super(`Stack images not built from this copy of the repository: ${mismatches.join("; ")}. Remedy: ${STACK_REMEDY}.`);
    this.name = "StackNotFromCopy";
  }
}

// Image et labels relevés par `docker inspect`, sur une image ou un conteneur.
const IMAGE_INSPECTED = '{"image":{{json .Id}},"labels":{{json .Config.Labels}}}';
const CONTAINER_INSPECTED = '{"image":{{json .Image}},"labels":{{json .Config.Labels}}}';
interface Inspected {
  image: string;
  labels: Record<string, string> | null;
}

// Images construites pour la pile, celles que recréera `docker compose up
// --no-build` (projet Compose `migrabench`) : vérifiées à la préparation
// d'une mesure, avant tout code du candidat. Une image absente diffère.
export async function verifyBuiltImages(expected: StackContextDigests): Promise<void> {
  const inspected = {} as Record<StackService, Inspected | undefined>;
  for (const service of SERVICES) {
    const { code, stdout } = await spawnCommand("docker", ["image", "inspect", "--format", IMAGE_INSPECTED, `migrabench-${service}`], { allowFailure: true });
    inspected[service] = code === 0 ? (JSON.parse(stdout) as Inspected) : undefined;
  }
  check(expected, inspected);
}

// Images des conteneurs en cours, après la recréation de la pile. Les labels
// sont lus sur le conteneur, qui reprend ceux de son image : l'image d'un
// conteneur en cours peut avoir perdu son tag, voire avoir été supprimée.
export async function verifyStackImages(expected: StackContextDigests): Promise<void> {
  const inspected = {} as Record<StackService, Inspected | undefined>;
  for (const service of SERVICES) {
    const container = await stdoutOf("docker", ["compose", "ps", "--quiet", service]);
    inspected[service] = container === "" ? undefined : (JSON.parse(await stdoutOf("docker", ["inspect", "--format", CONTAINER_INSPECTED, container])) as Inspected);
  }
  check(expected, inspected);
}

// Lève StackNotFromCopy en nommant chaque service dont l'image manque, n'a
// pas de label, ou porte une autre empreinte que celle de la copie.
function check(expected: StackContextDigests, inspected: Record<StackService, Inspected | undefined>): void {
  const mismatches = [];
  for (const service of SERVICES) {
    const found = inspected[service];
    const label = found?.labels?.[CONTEXT_LABEL];
    if (found === undefined) mismatches.push(`no ${service} image, this copy gives ${expected[service]}`);
    else if (label === undefined || label === "") mismatches.push(`${service} image ${found.image} carries no context label, this copy gives ${expected[service]}`);
    else if (label !== expected[service]) mismatches.push(`${service} image ${found.image} carries ${label}, this copy gives ${expected[service]}`);
  }
  if (mismatches.length > 0) throw new StackNotFromCopy(mismatches);
}
