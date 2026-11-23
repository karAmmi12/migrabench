// Runner de mesure (spec de l'étape 3, « Modules ») : un seul point d'entrée,
// measureCandidate, sur lequel `migrabench measure` est une commande mince.
// Il enchaîne les phases d'une mesure, écrit le dossier de la mesure
// (measure.json, oracle.json) et rend l'issue.
//
// Fil traceur (#62) : mesure de diagnostic seulement, contrat lu sans
// validation, construction réduite à `npm ci`, sans verrou du banc, journal
// d'accès, délais ni limites. Les tickets suivants de l'étape les ajoutent.
// Le verdict et les codes de sortie viennent de #63 (runner/verdict.ts).
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { executeOracle, type ExecuteOracleResult, listOracle } from "../oracle/execute.ts";
import { GIT_STATUS_ARGS, worktreeState } from "../oracle/worktree.ts";
import { candidateCompose } from "./candidate-compose.ts";
import { type CandidateFile, contentDigest, isCopied } from "./candidate-content.ts";
import { candidateName, measureId as measureIdOf } from "./measure-id.ts";
import { type CandidateRecord, measureRecord, type OracleRecord } from "./measure-record.ts";
import type { ExitCode, PhaseName, PhaseOutcome, PhaseRecord, Verdict } from "./verdict.ts";
import { cited, fileSha256 } from "../shared/digest.ts";
import { spawnCommand, stdoutOf } from "../shared/process.ts";
import { ARTIFACTS_DIR_FROM_ROOT, readBenchEnv, ROOT } from "../shared/root.ts";
import { containerUser, dockerUser } from "./container-user.ts";
import { DIAGNOSTIC_DIR_FROM_ROOT } from "./paths.ts";

export interface MeasureOptions {
  // Dossier du candidat, relatif à la racine du dépôt.
  candidate: string;
  // Prévue pour compter : pas encore prise en charge (#73).
  counted?: boolean;
  // Imposé : diagnostic seulement.
  salt?: string;
}

// Une mesure écrite, valide (0) ou invalide (3), ou un refus préalable (4) :
// rien n'est écrit.
export type MeasureResult =
  | { written: true; measureDir: string; outcome: Verdict; exitCode: ExitCode }
  | { written: false; refusal: "refused-usage"; message: string; exitCode: 4 };

// Port imposé au candidat, publié sur 127.0.0.1.
export const CANDIDATE_PORT = 8100;
const RUNTIME_IMAGE = "migrabench-runtime";
const RUNTIME_IMAGE_CONTEXT = "fixtures/runtime-image";
// Registre public npm imposé à la construction (variable de npm, qui prime sur un .npmrc du candidat).
const NPM_REGISTRY = "https://registry.npmjs.org/";
const COMPOSE_FILE = "docker-compose.yml";
// Plafond provisoire de l'attente de disponibilité : le délai sortira de l'étalonnage (#72).
const READY_CAP_MS = 60_000;

export async function measureCandidate({ candidate, counted = false, salt }: MeasureOptions): Promise<MeasureResult> {
  if (counted) throw new Error("A counted measure is not supported yet: run a diagnostic measure");
  // 0. Refus préalables, avant toute écriture.
  try {
    candidateName(candidate);
  } catch (error) {
    return { written: false, refusal: "refused-usage", message: (error as Error).message, exitCode: 4 };
  }
  const candidateDir = join(ROOT, candidate);
  if (!(await isDirectory(candidateDir))) {
    return { written: false, refusal: "refused-usage", message: `The candidate directory does not exist: ${candidate}`, exitCode: 4 };
  }
  const phases: PhaseRecord[] = [];
  const phase = startPhases(phases);

  // 1. Préparation.
  const closePreparation = phase("preparation");
  const startedAt = new Date();
  const benchCommit = await stdoutOf("git", ["rev-parse", "HEAD"]);
  const worktree = worktreeState((await spawnCommand("git", [...GIT_STATUS_ARGS])).stdout);
  const id = measureIdOf(startedAt, benchCommit, candidate);
  const measureDir = join(ROOT, DIAGNOSTIC_DIR_FROM_ROOT, id);
  const rawDir = join(ROOT, ARTIFACTS_DIR_FROM_ROOT, id);
  await mkdir(dirname(measureDir), { recursive: true });
  // Sans `recursive` : un dossier de mesure existant n'est jamais réécrit.
  await mkdir(measureDir);
  await mkdir(rawDir, { recursive: true });
  const measureSalt = salt ?? randomBytes(32).toString("hex");
  const files = await candidateFiles(candidateDir);
  const candidateRecord: CandidateRecord = { path: candidate, contentDigest: contentDigest(files) };
  const copyDir = join(rawDir, "candidate");
  for (const { path } of files) {
    await mkdir(dirname(join(copyDir, path)), { recursive: true });
    await copyFile(join(candidateDir, path), join(copyDir, path));
  }
  await spawnCommand("docker", ["build", "--quiet", "--tag", RUNTIME_IMAGE, RUNTIME_IMAGE_CONTEXT]);
  const runtimeImage = await stdoutOf("docker", ["image", "inspect", "--format", "{{.Id}}", RUNTIME_IMAGE]);
  const user = containerUser(process.getuid?.(), process.getgid?.());
  closePreparation();

  // 2. Contrat : lu sans validation, le schéma arrive avec #64.
  const closeContract = phase("contract");
  const declared = JSON.parse(await readFile(join(copyDir, "candidate.json"), "utf8")) as { contract: number; build?: string; start: string };
  Object.assign(candidateRecord, { contract: declared.contract, start: declared.start }, declared.build === undefined ? {} : { build: declared.build });
  if (declared.build !== undefined) throw new Error("A build command is not supported yet (#65)");
  closeContract();

  // 3. Construction : `npm ci` dans un conteneur de l'image d'exécution, sans
  // mb-internal ni variable du banc, copie montée en écriture.
  const closeBuild = phase("build");
  const npmLog = join(rawDir, "npm-ci.log");
  const build = await spawnCommand(
    "docker",
    ["run", "--rm", "--user", dockerUser(user), "--network", "bridge", "--env", "HOME=/tmp", "--env", `npm_config_registry=${NPM_REGISTRY}`,
      "--env", "npm_config_update_notifier=false", "--volume", `${copyDir}:/candidate`, "--workdir", "/candidate", RUNTIME_IMAGE, "sh", "-c", "npm ci"],
    { logFile: npmLog, allowFailure: true },
  );
  closeBuild(build.code === 0 ? "ok" : "build-failed", { "npm-ci.log": await digestOf(npmLog) });

  // 4 et 5. Pile et démarrage, puis oracle. L'exécution complète de l'étape 2
  // recrée le legacy et le service d'archivage, puis rappelle le runner, qui
  // recrée le service `candidate` et attend sa disponibilité.
  const overrideFile = join(rawDir, "compose.candidate.yml");
  const compose = ["compose", "--file", COMPOSE_FILE, "--file", overrideFile];
  const startLog = join(rawDir, "start.log");
  const baseUrl = `http://127.0.0.1:${CANDIDATE_PORT}`;
  const env = await readBenchEnv();
  await writeFile(
    overrideFile,
    `${JSON.stringify(candidateCompose({ image: RUNTIME_IMAGE, user, port: CANDIDATE_PORT, copyDir, usersFile: join(ROOT, "fixtures", "users.json"), start: declared.start, archiveToken: env.ARCHIVE_TOKEN ?? "" }), null, 2)}\n`,
  );
  const composeOverride = await digestOf(overrideFile);

  let oracle: OracleRecord | undefined;
  let oracleMetadata: ExecuteOracleResult["metadata"] | undefined;
  if (build.code === 0) {
    const closeStart = phase("start");
    let closeOracle: ClosePhase<"oracle"> | undefined;
    let startOutcome: PhaseOutcome<"start"> = "ok";
    try {
      const result = await executeOracle({
        baseUrl,
        salt: measureSalt,
        artifactsDir: `${ARTIFACTS_DIR_FROM_ROOT}/${id}/oracle`,
        resultFile: join(measureDir, "oracle.json"),
        onStackReady: async () => {
          await stopCandidate(compose, startLog);
          await spawnCommand("docker", [...compose, "up", "--detach", "--force-recreate", "--no-deps", "candidate"]);
          startOutcome = await waitUntilReady(compose, baseUrl);
          if (startOutcome !== "ok") throw new CandidateNotStarted(startOutcome);
          closeStart();
          closeOracle = phase("oracle");
        },
      });
      oracleMetadata = result.metadata;
      oracle = { executed: true, result: await digestOf(result.resultFile), summary: result.summary };
      if (result.errors === 0) closeOracle?.();
      else closeOracle?.("oracle-error", {}, result.errorMessages.join("\n"));
      const closeGates = phase("gates");
      closeGates();
    } catch (error) {
      if (!(error instanceof CandidateNotStarted)) {
        await stopCandidate(compose, startLog);
        throw error;
      }
      closeStart(startOutcome);
    }
  }

  // Oracle non lancé : le compte des scénarios, tous non atteints.
  oracle ??= { executed: false, summary: await listOracle(`${ARTIFACTS_DIR_FROM_ROOT}/${id}/oracle`) };

  // 7. Clôture : arrêt du candidat, measure.json écrit.
  const closeClosing = phase("closing");
  await stopCandidate(compose, startLog);
  closeClosing();
  const startPhase = phases.find(({ name }) => name === "start");
  if (startPhase !== undefined) startPhase.raw["start.log"] = await digestOf(startLog);

  const { record, exitCode } = measureRecord({
    measureId: id,
    candidate: candidateRecord,
    environment: {
      benchCommit,
      worktree,
      node: process.version,
      ...oracleMetadata,
      runtimeImage,
      containerUser: user,
      composeOverride,
      port: CANDIDATE_PORT,
    },
    salt: measureSalt,
    saltImposed: salt !== undefined,
    phases,
    oracle,
  });
  await writeFile(join(measureDir, "measure.json"), `${JSON.stringify(record, null, 2)}\n`);
  return { written: true, measureDir, outcome: record.verdict, exitCode };
}

// Levée par le rappel pour arrêter l'exécution de l'oracle avant Playwright.
class CandidateNotStarted extends Error {
  constructor(outcome: PhaseOutcome<"start">) {
    super(`The candidate did not start: ${outcome}`);
  }
}

// Chaque appel ouvre une phase et rend la fonction qui la ferme, avec son
// issue (`ok` par défaut), les empreintes de ses bruts et, pour une issue qui
// rend la mesure invalide, sa preuve.
type ClosePhase<N extends PhaseName> = (outcome?: PhaseOutcome<N>, raw?: Record<string, string>, evidence?: string) => void;

function startPhases(phases: PhaseRecord[]) {
  return <N extends PhaseName>(name: N): ClosePhase<N> => {
    const startedAt = new Date();
    return (outcome = "ok", raw: Record<string, string> = {}, evidence?: string) => {
      phases.push({
        name,
        outcome,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        raw,
        ...(evidence === undefined ? {} : { evidence }),
      } as PhaseRecord);
    };
  };
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

// Fichiers copiés du candidat, avec leur empreinte. Un lien symbolique pourrait
// faire copier un fichier hors du candidat : il est refusé.
async function candidateFiles(candidateDir: string): Promise<CandidateFile[]> {
  const files: CandidateFile[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const path = relative(candidateDir, full).split("\\").join("/");
      if (!isCopied(path)) continue;
      if (entry.isSymbolicLink()) throw new Error(`The candidate contains a symbolic link: ${path}`);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) files.push({ path, sha256: await fileSha256(full) });
    }
  };
  await walk(candidateDir);
  return files;
}

// Disponible dès qu'une réponse HTTP arrive, quel que soit son statut.
async function waitUntilReady(compose: readonly string[], baseUrl: string): Promise<PhaseOutcome<"start">> {
  const deadline = Date.now() + READY_CAP_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(baseUrl, { signal: AbortSignal.timeout(2_000), redirect: "manual" });
      return "ok";
    } catch {
      const container = await stdoutOf("docker", [...compose, "ps", "--all", "--quiet", "candidate"]);
      const running = container === "" ? "false" : await stdoutOf("docker", ["inspect", "--format", "{{.State.Running}}", container]);
      if (running !== "true") return "start-exited";
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return "start-not-ready";
}

// Ajoute les sorties du conteneur au brut de `start`, puis le supprime.
async function stopCandidate(compose: readonly string[], startLog: string): Promise<void> {
  await spawnCommand("docker", [...compose, "logs", "--no-color", "--timestamps", "candidate"], { logFile: startLog, allowFailure: true });
  await spawnCommand("docker", [...compose, "rm", "--stop", "--force", "candidate"]);
}

// Empreinte d'un brut, sous sa forme citée.
async function digestOf(path: string): Promise<string> {
  return cited(await fileSha256(path));
}
