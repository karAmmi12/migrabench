// Exécution complète de l'oracle (spec de l'étape 2, « Modules ») : un seul
// point d'entrée, réutilisé par `npm run oracle` et par le runner de l'étape 3.
// Trois temps : préparer (sel, pile recréée, environnement), lancer
// (Playwright), collecter (empreintes, statuts, sel, résultat versionné).
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import type { JSONReport } from "@playwright/test/reporter";
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
}

export interface ExecuteOracleResult {
  resultFile: string;
  summary: OracleSummary;
  // Erreurs de Playwright hors scénarios (configuration, chargement des fichiers).
  errors: number;
}

export async function executeOracle({ baseUrl = DEFAULT_BASE_URL, salt }: ExecuteOracleOptions = {}): Promise<ExecuteOracleResult> {
  const prepared = await prepare(baseUrl, salt ?? randomBytes(32).toString("hex"), salt !== undefined);
  const report = await launch(prepared);
  return collectAndWrite(prepared, report);
}

// Environnement relevé avant Playwright : métadonnées du résultat.
interface Environment {
  benchCommit: string;
  worktree: WorktreeState;
  node: string;
  images: Record<string, string>;
  frozenDate: string | null;
  baseUrl: string;
  // Dossier des bruts de l'exécution, depuis la racine du dépôt ; les pièces
  // jointes du résultat sont citées relativement à lui.
  artifacts: string;
}

// Ce que le premier temps transmet aux deux suivants.
interface PreparedExecution {
  baseUrl: string;
  salt: string;
  saltImposed: boolean;
  metadata: Environment;
  outputDir: string;
  reportFile: string;
  startedAt: Date;
}

async function prepare(baseUrl: string, salt: string, saltImposed: boolean): Promise<PreparedExecution> {
  const startedAt = new Date();
  // Le sel passe par l'environnement du shell, jamais par .env (que lit aussi le legacy).
  await spawnProcess("docker", ["compose", "up", "--detach", "--force-recreate", "--no-build", "--wait", ...SERVICES], {
    ARCHIVE_SALT: salt,
  });
  const benchCommit = (await captureStdout("git", ["rev-parse", "HEAD"])).trim();
  const worktree = worktreeState(await captureStdout("git", [...GIT_STATUS_ARGS]));
  const images: Record<string, string> = {};
  for (const service of SERVICES) images[service] = await imageOf(service);
  const env = parseEnv(await readFile(join(ROOT, ".env"), "utf8"));
  const executionId = `${timestamp(startedAt)}-${randomBytes(4).toString("hex")}`;
  const artifacts = `${ARTIFACTS_DIR_FROM_ROOT}/${executionId}`;
  return {
    baseUrl,
    salt,
    saltImposed,
    metadata: { benchCommit, worktree, node: process.version, images, frozenDate: env.FROZEN_DATE ?? null, baseUrl, artifacts },
    outputDir: join(ROOT, artifacts),
    reportFile: join(ROOT, artifacts, "report.json"),
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

async function collectAndWrite({ salt, saltImposed, startedAt, metadata, outputDir }: PreparedExecution, raw: string): Promise<ExecuteOracleResult> {
  // Le sel n'apparaît dans le résultat qu'une fois Playwright terminé.
  if (raw.includes(salt)) throw new Error("The Playwright report contains the salt before collection");
  const report = JSON.parse(raw) as JSONReport;
  const hashes: Record<string, string> = {};
  for (const path of artifactPaths(report)) hashes[path] = await sha256(path);
  const { report: result, summary } = collect(report, { hashes, salt, saltImposed, root: ROOT, artifactsDir: outputDir });
  await mkdir(RESULTS_DIR, { recursive: true });
  const resultFile = join(RESULTS_DIR, `${timestamp(startedAt)}-${metadata.benchCommit.slice(0, 7)}.json`);
  await writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`);
  return { resultFile, summary, errors: report.errors.length };
}

async function imageOf(service: string): Promise<string> {
  const container = (await captureStdout("docker", ["compose", "ps", "--quiet", service])).trim();
  if (container === "") throw new Error(`No running container for service ${service}`);
  return (await captureStdout("docker", ["inspect", "--format", "{{.Image}}", container])).trim();
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

// 2026-11-21T15:40:12.345Z → 20261121T154012Z
function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
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
