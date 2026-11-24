// Exécution complète de l'oracle (spec de l'étape 2, « Modules ») : un seul
// point d'entrée, réutilisé par `npm run oracle` et par le runner de l'étape 3.
// Trois temps : préparer (sel, pile recréée, environnement), lancer
// (Playwright), collecter (empreintes, statuts, sel, résultat versionné).
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { JSONReport } from "@playwright/test/reporter";
import { fileSha256 } from "../shared/digest.ts";
import { spawnCommand, stdoutOf } from "../shared/process.ts";
import { ARTIFACTS_DIR_FROM_ROOT, readBenchEnv, ROOT } from "../shared/root.ts";
import { browserVersions } from "./browser-versions.ts";
import { type CiRun, ciRunOf, resultFileName, timestamp } from "./ci-run.ts";
import { artifactPaths, collect, type OracleSummary, unreachedSummary } from "./collect.ts";
import { DEFAULT_BASE_URL, ORACLE_ENV } from "./env.ts";
import { GIT_STATUS_ARGS, RESULTS_DIR_FROM_ROOT, worktreeState, type WorktreeState } from "./worktree.ts";

export { DEFAULT_BASE_URL };

// La collecte rapporte les chemins à la racine du dépôt (ROOT, sans barre finale).
const RESULTS_DIR = join(ROOT, RESULTS_DIR_FROM_ROOT);
const CONFIG = join(ROOT, "oracle", "playwright.config.ts");
// Services recréés à chaque exécution : le legacy recharge son jeu de données au démarrage.
const SERVICES = ["legacy", "archive"] as const;

export interface ExecuteOracleOptions {
  baseUrl?: string;
  // Imposé : diagnostic seulement, jamais pour une mesure.
  salt?: string;
  // Le sel a-t-il été imposé par l'opérateur ? Défaut : vrai dès qu'un sel est
  // donné. Le runner donne toujours le sel de sa mesure, tiré par elle quand
  // l'opérateur n'en impose pas : il le dit ici (#73).
  saltImposed?: boolean;
  // Rappel du runner de l'étape 3 : appelé chaque fois que le legacy et le
  // service d'archivage viennent d'être recréés et sont sains, avant
  // Playwright. Le runner y recrée le service `candidate`. Une erreur du rappel
  // arrête l'exécution avant Playwright.
  onStackReady?: () => Promise<void>;
  // Dossier du journal d'accès du legacy, chemin absolu sur l'hôte : celui des
  // bruts de la mesure (#67). Défaut : celui de docker-compose.yml.
  accessLogDir?: string;
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
  errorMessages: string[];
}

export async function executeOracle({ baseUrl = DEFAULT_BASE_URL, salt, saltImposed, ...options }: ExecuteOracleOptions = {}): Promise<ExecuteOracleResult> {
  const prepared = await prepare(baseUrl, salt ?? randomBytes(32).toString("hex"), saltImposed ?? salt !== undefined, options);
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
  { onStackReady, accessLogDir, artifactsDir, resultFile }: Pick<ExecuteOracleOptions, "onStackReady" | "accessLogDir" | "artifactsDir" | "resultFile">,
): Promise<PreparedExecution> {
  const startedAt = new Date();
  // Lu avant la pile : un rang invalide arrête l'exécution avant toute mesure.
  const ciRun = ciRunOf(process.env);
  await recreateStack(salt, accessLogDir);
  await onStackReady?.();
  const benchCommit = await stdoutOf("git", ["rev-parse", "HEAD"]);
  // Sortie brute, sans trim : une entrée commence par un espace (` M chemin`).
  const worktree = worktreeState((await spawnCommand("git", [...GIT_STATUS_ARGS])).stdout);
  const images = await stackImages();
  const { chromium, playwright } = await browserVersions();
  const env = await readBenchEnv();
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
  await spawnCommand("npx", ["playwright", "test", "--config", CONFIG], {
    env: {
      BASE_URL: baseUrl,
      // Le sel n'est transmis qu'au processus Playwright, pour les scénarios de l'accusé.
      ARCHIVE_SALT: salt,
      [ORACLE_ENV.outputDir]: outputDir,
      [ORACLE_ENV.report]: reportFile,
      [ORACLE_ENV.metadata]: JSON.stringify(metadata),
    },
    inherit: true,
    allowFailure: true,
  });
  return readFile(reportFile, "utf8");
}

async function collectAndWrite({ salt, saltImposed, startedAt, metadata, outputDir, resultFile: imposedResultFile }: PreparedExecution, raw: string): Promise<ExecuteOracleResult> {
  // Le sel n'apparaît dans le résultat qu'une fois Playwright terminé.
  if (raw.includes(salt)) throw new Error("The Playwright report contains the salt before collection");
  const report = JSON.parse(raw) as JSONReport;
  const hashes: Record<string, string> = {};
  for (const path of artifactPaths(report)) hashes[path] = await fileSha256(path);
  const { report: result, summary } = collect(report, { hashes, salt, saltImposed, root: ROOT, artifactsDir: outputDir });
  const resultFile = imposedResultFile ?? join(RESULTS_DIR, resultFileName(startedAt, metadata.benchCommit, metadata.ciRun));
  await mkdir(dirname(resultFile), { recursive: true });
  await writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`);
  return { resultFile, metadata, summary, errors: report.errors.length, errorMessages: report.errors.map((error) => error.message ?? error.value ?? "Playwright error without message") };
}

// Résumé d'un oracle non lancé (spec de l'étape 3) : les scénarios listés par
// Playwright, sans les exécuter ni toucher à la pile, tous non atteints.
// `artifactsDir` reçoit le rapport de la liste, depuis la racine du dépôt.
export async function listOracle(artifactsDir: string): Promise<OracleSummary> {
  const outputDir = join(ROOT, artifactsDir);
  const reportFile = join(outputDir, "list.json");
  await mkdir(outputDir, { recursive: true });
  await spawnCommand("npx", ["playwright", "test", "--config", CONFIG, "--list"], {
    env: { [ORACLE_ENV.outputDir]: outputDir, [ORACLE_ENV.report]: reportFile },
  });
  const listed = JSON.parse(await readFile(reportFile, "utf8")) as JSONReport;
  if (listed.errors.length > 0) throw new Error(`Playwright could not list the oracle scenarios: ${listed.errors.map((error) => error.message ?? error.value).join("; ")}`);
  return unreachedSummary(listed);
}

// Recrée le legacy et le service d'archivage et attend qu'ils soient sains.
// Le sel passe par l'environnement du shell, jamais par .env (que lit aussi le
// legacy). Partagé avec `migrabench calibrate`. Le journal d'accès du legacy va
// dans `accessLogDir` s'il est donné (MB_ACCESS_LOG_DIR de docker-compose.yml).
export async function recreateStack(salt: string, accessLogDir?: string): Promise<void> {
  await spawnCommand("docker", ["compose", "up", "--detach", "--force-recreate", "--no-build", "--wait", ...SERVICES], {
    env: { ARCHIVE_SALT: salt, ...(accessLogDir === undefined ? {} : { MB_ACCESS_LOG_DIR: accessLogDir }) },
    inherit: true,
  });
}

// Empreinte de l'image de chaque service recréé (`images`).
export async function stackImages(): Promise<Record<string, string>> {
  const images: Record<string, string> = {};
  for (const service of SERVICES) images[service] = await imageOf(service);
  return images;
}

async function imageOf(service: string): Promise<string> {
  const container = await stdoutOf("docker", ["compose", "ps", "--quiet", service]);
  if (container === "") throw new Error(`No running container for service ${service}`);
  return stdoutOf("docker", ["inspect", "--format", "{{.Image}}", container]);
}
