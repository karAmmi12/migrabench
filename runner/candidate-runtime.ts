// Exécution du candidat (spec de l'étape 3, « Exécution du candidat » ; ADR
// 0007), partagée par `migrabench measure` et `migrabench calibrate` : copie
// du candidat, image d'exécution du banc, service `candidate` démarré par une
// composition complémentaire, attente de sa disponibilité et arrêt.
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { citedFileSha256 as digestOf, fileSha256 } from "../shared/digest.ts";
import { spawnCommand, stdoutOf } from "../shared/process.ts";
import { readBenchEnv, ROOT } from "../shared/root.ts";
import { candidateCompose } from "./candidate-compose.ts";
import { type CandidateFile, isCopied } from "./candidate-content.ts";
import type { ContainerUser } from "./container-user.ts";
import { type Limits, startLimits } from "./limits.ts";
import type { PhaseOutcome } from "./verdict.ts";

// Port imposé au candidat, publié sur 127.0.0.1.
export const CANDIDATE_PORT = 8100;
export const CANDIDATE_BASE_URL = `http://127.0.0.1:${CANDIDATE_PORT}`;
export const RUNTIME_IMAGE = "migrabench-runtime";
const RUNTIME_IMAGE_CONTEXT = "fixtures/runtime-image";
const COMPOSE_FILE = "docker-compose.yml";

// Construit l'image d'exécution du banc et rend son empreinte.
export async function buildRuntimeImage(): Promise<string> {
  await spawnCommand("docker", ["build", "--quiet", "--tag", RUNTIME_IMAGE, RUNTIME_IMAGE_CONTEXT]);
  return stdoutOf("docker", ["image", "inspect", "--format", "{{.Id}}", RUNTIME_IMAGE]);
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

// Fichiers copiés du candidat, avec leur empreinte, et défauts de ses
// fichiers (#68). Un lien symbolique pourrait faire copier un fichier hors du
// candidat : il n'est ni suivi ni copié. Un fichier ou un dossier illisible
// n'est pas copié non plus. Chaque défaut est cité par la phase du contrat :
// une contract-failure, jamais une erreur du runner, que le candidat
// pourrait fabriquer pour échapper à la mesure (règle 7).
export async function candidateFiles(candidateDir: string): Promise<{ files: CandidateFile[]; defects: string[] }> {
  const files: CandidateFile[] = [];
  const defects: string[] = [];
  const unreadable = (path: string, error: unknown) => defects.push(`The candidate file cannot be read: ${path} (${(error as Error).message})`);
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      unreadable(relative(candidateDir, dir).split("\\").join("/") || ".", error);
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const path = relative(candidateDir, full).split("\\").join("/");
      if (!isCopied(path)) continue;
      if (entry.isSymbolicLink()) defects.push(`The candidate contains a symbolic link: ${path}`);
      else if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        try {
          files.push({ path, sha256: await fileSha256(full) });
        } catch (error) {
          unreadable(path, error);
        }
      }
    }
  };
  await walk(candidateDir);
  return { files, defects };
}

export async function copyCandidate(candidateDir: string, files: readonly CandidateFile[], copyDir: string): Promise<void> {
  for (const { path } of files) {
    await mkdir(dirname(join(copyDir, path)), { recursive: true });
    await copyFile(join(candidateDir, path), join(copyDir, path));
  }
}

// Service `candidate` d'une mesure : sa composition complémentaire, écrite
// dans le dossier des bruts, et les commandes qui le démarrent et l'arrêtent.
export interface CandidateService {
  compose: readonly string[];
  // Empreinte de la composition complémentaire (`environment.composeOverride`).
  composeOverride: string;
  startLog: string;
}

export async function candidateService({ rawDir, copyDir, user, start, limits }: { rawDir: string; copyDir: string; user: ContainerUser; start: string; limits: Limits }): Promise<CandidateService> {
  const overrideFile = join(rawDir, "compose.candidate.yml");
  const env = await readBenchEnv();
  await writeFile(
    overrideFile,
    `${JSON.stringify(candidateCompose({ image: RUNTIME_IMAGE, user, port: CANDIDATE_PORT, copyDir, usersFile: join(ROOT, "fixtures", "users.json"), start, archiveToken: env.ARCHIVE_TOKEN ?? "", limits: startLimits(limits) }), null, 2)}\n`,
  );
  return { compose: ["compose", "--file", COMPOSE_FILE, "--file", overrideFile], composeOverride: await digestOf(overrideFile), startLog: join(rawDir, "start.log") };
}

// Recrée le service `candidate`, sans toucher au reste de la pile.
export async function startCandidate({ compose }: CandidateService): Promise<void> {
  await spawnCommand("docker", [...compose, "up", "--detach", "--force-recreate", "--no-deps", "candidate"]);
}

// Disponible dès qu'une réponse HTTP arrive, quel que soit son statut.
export async function waitUntilReady({ compose }: CandidateService, readyTimeoutMs: number): Promise<PhaseOutcome<"start">> {
  const deadline = Date.now() + readyTimeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(CANDIDATE_BASE_URL, { signal: AbortSignal.timeout(2_000), redirect: "manual" });
      return "ok";
    } catch {
      const container = await candidateContainer({ compose });
      const running = container === "" ? "false" : await stdoutOf("docker", ["inspect", "--format", "{{.State.Running}}", container]);
      if (running !== "true") return "start-exited";
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return "start-not-ready";
}

// Identifiant du conteneur du service `candidate`, vide s'il n'existe pas.
export function candidateContainer({ compose }: Pick<CandidateService, "compose">): Promise<string> {
  return stdoutOf("docker", [...compose, "ps", "--all", "--quiet", "candidate"]);
}

// Ajoute les sorties du conteneur au brut de `start`, puis le supprime.
// `immediately` : mesure interrompue (#71), le conteneur est tué sans
// attendre son délai d'arrêt.
export async function stopCandidate({ compose, startLog }: CandidateService, { immediately = false } = {}): Promise<void> {
  await spawnCommand("docker", [...compose, "logs", "--no-color", "--timestamps", "candidate"], { logFile: startLog, allowFailure: true });
  if (immediately) return removeCandidate({ compose });
  await spawnCommand("docker", [...compose, "rm", "--stop", "--force", "candidate"]);
}

// Tue et supprime le conteneur du service `candidate`, sans relever ses
// sorties : après une clôture abrégée, le brut de `start` est déjà cité (#71).
export async function removeCandidate({ compose }: Pick<CandidateService, "compose">): Promise<void> {
  await spawnCommand("docker", [...compose, "kill", "candidate"], { allowFailure: true });
  await spawnCommand("docker", [...compose, "rm", "--stop", "--force", "candidate"]);
}
