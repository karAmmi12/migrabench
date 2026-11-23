// Exécution complète de l'oracle (spec de l'étape 2, « Modules ») : un seul
// point d'entrée, réutilisé par `npm run oracle` et par le runner de l'étape 3.
// Trois temps : préparer (sel, pile recréée, environnement), lancer
// (Playwright), collecter (empreintes, statuts, sel, résultat versionné).
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import type { JSONReport } from "@playwright/test/reporter";
import { browserVersions } from "./browser-versions.ts";
import { type CiRun, ciRunOf, resultFileName, timestamp } from "./ci-run.ts";
import { artifactPaths, collect, type OracleSummary } from "./collect.ts";
import { DEFAULT_BASE_URL, ORACLE_ENV } from "./env.ts";
import { GIT_STATUS_ARGS, RESULTS_DIR_FROM_ROOT, worktreeState, type WorktreeState } from "./worktree.ts";

export { DEFAULT_BASE_URL };

// Sans barre finale : la collecte rapporte les chemins à cette racine.
const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const RESULTS_DIR = join(ROOT, RESULTS_DIR_FROM_ROOT);
const CONFIG = join(ROOT, "oracle", "playwright.config.ts");
// Bruts (traces, HAR), un dossier par exécution, ignoré par Git (ADR 0005).
const ARTIFACTS_DIR_FROM_ROOT = ".oracle-artifacts";
// Services recréés à chaque exécution : le legacy recharge son jeu de données au démarrage.
const SERVICES = ["legacy", "archive"] as const;

export interface ExecuteOracleOptions {
  baseUrl?: string;
  // Imposé : diagnostic seulement, jamais pour une mesure.
  salt?: string;
  // Rappel du runner de l'étape 3 : appelé chaque fois que le legacy et le
  // service d'archivage viennent d'être recréés et sont sains, avant
  // Playwright. Le runner y recrée le service `candidate`. Une erreur du rappel
  // arrête l'exécution avant Playwright.
  onStackReady?: () => Promise<void>;
  // Dossier des bruts, depuis la racine du dépôt ; défaut : un dossier propre
  // à l'exécution sous .oracle-artifacts/.
  artifactsDir?: string;
  // Fichier du résultat, chemin absolu ; défaut : results/oracle/<nom du résultat>.
  resultFile?: string;
}

export interface ExecuteOracleResult {
  resultFile: string;
  // Environnement relevé, écrit dans les métadonnées du résultat.
  metadata: OracleEnvironment;
  summary: OracleSummary;
  // Erreurs de Playwright hors scénarios (configuration, chargement des fichiers).
  errors: number;
}

export async function executeOracle({ baseUrl = DEFAULT_BASE_URL, salt, ...options }: ExecuteOracleOptions = {}): Promise<ExecuteOracleResult> {
  const prepared = await prepare(baseUrl, salt ?? randomBytes(32).toString("hex"), salt !== undefined, options);
  const report = await launch(prepared);
  return collectAndWrite(prepared, report);
}

// Environnement relevé avant Playwright : métadonnées du résultat.
export interface OracleEnvironment {
  benchCommit: string;
  worktree: WorktreeState;
  node: string;
  // Chromium lancé par l'oracle et @playwright/test qui le pilote.
  chromium: string;
  playwright: string;
  images: Record<string, string>;
  frozenDate: string | null;
  baseUrl: string;
  // Dossier des bruts de l'exécution, depuis la racine du dépôt ; les pièces
  // jointes du résultat sont citées relativement à lui.
  artifacts: string;
  // Exécution de CI et rang de l'exécution complète dans le job, en CI seulement.
  ciRun?: CiRun;
}

// Ce que le premier temps transmet aux deux suivants.
interface PreparedExecution {
  baseUrl: string;
  salt: string;
  saltImposed: boolean;
  metadata: OracleEnvironment;
  outputDir: string;
  resultFile: string | undefined;
  reportFile: string;
  startedAt: Date;
}

async function prepare(
  baseUrl: string,
  salt: string,
  saltImposed: boolean,
  { onStackReady, artifactsDir, resultFile }: Pick<ExecuteOracleOptions, "onStackReady" | "artifactsDir" | "resultFile">,
): Promise<PreparedExecution> {
  const startedAt = new Date();
  // Lu avant la pile : un rang invalide arrête l'exécution avant toute mesure.
  const ciRun = ciRunOf(process.env);
  // Le sel passe par l'environnement du shell, jamais par .env (que lit aussi le legacy).
  await spawnProcess("docker", ["compose", "up", "--detach", "--force-recreate", "--no-build", "--wait", ...SERVICES], {
    ARCHIVE_SALT: salt,
  });
  await onStackReady?.();
  const benchCommit = (await captureStdout("git", ["rev-parse", "HEAD"])).trim();
  const worktree = worktreeState(await captureStdout("git", [...GIT_STATUS_ARGS]));
  const images: Record<string, string> = {};
  for (const service of SERVICES) images[service] = await imageOf(service);
  const { chromium, playwright } = await browserVersions();
  const env = parseEnv(await readFile(join(ROOT, ".env"), "utf8"));
  const executionId = `${timestamp(startedAt)}-${randomBytes(4).toString("hex")}`;
  const artifacts = artifactsDir ?? `${ARTIFACTS_DIR_FROM_ROOT}/${executionId}`;
  return {
    baseUrl,
    salt,
    saltImposed,
    metadata: { benchCommit, worktree, node: process.version, chromium, playwright, images, frozenDate: env.FROZEN_DATE ?? null, baseUrl, artifacts, ...(ciRun === undefined ? {} : { ciRun }) },
    outputDir: join(ROOT, artifacts),
    reportFile: join(ROOT, artifacts, "report.json"),
    resultFile,
    startedAt,
  };
}

async function launch({ baseUrl, salt, metadata, outputDir, reportFile }: PreparedExecution): Promise<string> {
  // Code de sortie ignoré : un scénario échoué rend 1, et c'est la collecte qui juge.
  await spawnProcess("npx", ["playwright", "test", "--config", CONFIG], {
    BASE_URL: baseUrl,
    // Le sel n'est transmis qu'au processus Playwright, pour les scénarios de l'accusé.
    ARCHIVE_SALT: salt,
    [ORACLE_ENV.outputDir]: outputDir,
    [ORACLE_ENV.report]: reportFile,
    [ORACLE_ENV.metadata]: JSON.stringify(metadata),
  }, { allowFailure: true });
  return readFile(reportFile, "utf8");
}

async function collectAndWrite({ salt, saltImposed, startedAt, metadata, outputDir, resultFile: imposedResultFile }: PreparedExecution, raw: string): Promise<ExecuteOracleResult> {
  // Le sel n'apparaît dans le résultat qu'une fois Playwright terminé.
  if (raw.includes(salt)) throw new Error("The Playwright report contains the salt before collection");
  const report = JSON.parse(raw) as JSONReport;
  const hashes: Record<string, string> = {};
  for (const path of artifactPaths(report)) hashes[path] = await sha256(path);
  const { report: result, summary } = collect(report, { hashes, salt, saltImposed, root: ROOT, artifactsDir: outputDir });
  const resultFile = imposedResultFile ?? join(RESULTS_DIR, resultFileName(startedAt, metadata.benchCommit, metadata.ciRun));
  await mkdir(dirname(resultFile), { recursive: true });
  await writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`);
  return { resultFile, metadata, summary, errors: report.errors.length };
}

async function imageOf(service: string): Promise<string> {
  const container = (await captureStdout("docker", ["compose", "ps", "--quiet", service])).trim();
  if (container === "") throw new Error(`No running container for service ${service}`);
  return (await captureStdout("docker", ["inspect", "--format", "{{.Image}}", container])).trim();
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function captureStdout(command: string, args: string[]): Promise<string> {
  return spawnProcess(command, args, {}, { capture: true });
}

function spawnProcess(
  command: string,
  args: string[],
  env: Record<string, string>,
  { capture = false, allowFailure = false } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
    });
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || allowFailure) resolve(stdout);
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}
