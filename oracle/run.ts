// Exécution complète de l'oracle (spec de l'étape 2, « Modules ») : un seul
// point d'entrée, réutilisé par `npm run oracle` et par le runner de l'étape 3.
// Trois temps : préparer (sel, pile recréée, environnement), lancer
// (Playwright), collecter (empreintes, statuts, sel, résultat versionné).
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import type { JSONReport } from "@playwright/test/reporter";
import { artifactPaths, collect, type OracleSummary } from "./collect.ts";

export const DEFAULT_BASE_URL = "http://localhost:8080";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RESULTS_DIR = join(ROOT, "results", "oracle");
const CONFIG = join(ROOT, "oracle", "playwright.config.ts");
// Services recréés à chaque exécution : le legacy recharge son jeu de données au démarrage.
const SERVICES = ["legacy", "archive"] as const;

export interface RunOracleOptions {
  baseUrl?: string;
  // Imposé : diagnostic seulement, jamais pour une mesure.
  salt?: string;
}

export interface RunOracleResult {
  resultFile: string;
  summary: OracleSummary;
  // Erreurs de Playwright hors scénarios (configuration, chargement des fichiers).
  errors: number;
}

export async function runOracle({ baseUrl = DEFAULT_BASE_URL, salt }: RunOracleOptions = {}): Promise<RunOracleResult> {
  const prepared = await prepare(baseUrl, salt ?? randomBytes(32).toString("hex"));
  const report = await launch(prepared);
  return collectAndWrite(prepared, report);
}

interface Prepared {
  baseUrl: string;
  salt: string;
  metadata: Record<string, unknown>;
  outputDir: string;
  reportFile: string;
  startedAt: Date;
}

async function prepare(baseUrl: string, salt: string): Promise<Prepared> {
  const startedAt = new Date();
  // Le sel passe par l'environnement du shell, jamais par .env (que lit aussi le legacy).
  await run("docker", ["compose", "up", "--detach", "--force-recreate", "--no-build", "--wait", ...SERVICES], {
    ARCHIVE_SALT: salt,
  });
  const benchCommit = (await output("git", ["rev-parse", "HEAD"])).trim();
  const worktree = (await output("git", ["status", "--porcelain"])).trim() === "" ? "clean" : "dirty";
  const images: Record<string, string> = {};
  for (const service of SERVICES) images[service] = await imageOf(service);
  const env = parseEnv(await readFile(join(ROOT, ".env"), "utf8"));
  const outputDir = join(tmpdir(), "migrabench-oracle", `${timestamp(startedAt)}-${randomBytes(4).toString("hex")}`);
  return {
    baseUrl,
    salt,
    metadata: { benchCommit, worktree, node: process.version, images, frozenDate: env.FROZEN_DATE ?? null, baseUrl },
    outputDir,
    reportFile: join(outputDir, "report.json"),
    startedAt,
  };
}

async function launch({ baseUrl, salt, metadata, outputDir, reportFile }: Prepared): Promise<string> {
  // Code de sortie ignoré : un scénario échoué rend 1, et c'est la collecte qui juge.
  await run("npx", ["playwright", "test", "--config", CONFIG], {
    BASE_URL: baseUrl,
    // Le sel n'est transmis qu'au processus Playwright, pour les scénarios de l'accusé.
    ARCHIVE_SALT: salt,
    MB_ORACLE_OUTPUT_DIR: outputDir,
    MB_ORACLE_REPORT: reportFile,
    MB_ORACLE_METADATA: JSON.stringify(metadata),
  }, { allowFailure: true });
  return readFile(reportFile, "utf8");
}

async function collectAndWrite({ salt, startedAt, metadata }: Prepared, raw: string): Promise<RunOracleResult> {
  // Le sel n'apparaît dans le résultat qu'une fois Playwright terminé.
  if (raw.includes(salt)) throw new Error("The Playwright report contains the salt before collection");
  const report = JSON.parse(raw) as JSONReport;
  const hashes: Record<string, string> = {};
  for (const path of artifactPaths(report)) hashes[path] = await sha256(path);
  const { report: result, summary } = collect(report, { hashes, salt });
  await mkdir(RESULTS_DIR, { recursive: true });
  const resultFile = join(RESULTS_DIR, `${timestamp(startedAt)}-${String(metadata.benchCommit).slice(0, 7)}.json`);
  await writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`);
  return { resultFile, summary, errors: report.errors.length };
}

async function imageOf(service: string): Promise<string> {
  const container = (await output("docker", ["compose", "ps", "--quiet", service])).trim();
  if (container === "") throw new Error(`No running container for service ${service}`);
  return (await output("docker", ["inspect", "--format", "{{.Image}}", container])).trim();
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

// 2026-11-21T15:40:12.345Z → 20261121T154012Z
function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function output(command: string, args: string[]): Promise<string> {
  return run(command, args, {}, { capture: true });
}

function run(
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
