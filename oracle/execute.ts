// Exécution complète de l'oracle (spec de l'étape 2, « Modules ») : un seul
// point d'entrée, réutilisé par `npm run oracle` et par le runner de l'étape 3.
// Trois temps : préparer (sel, pile recréée, environnement), lancer
// (Playwright), collecter (empreintes, statuts, sel, résultat versionné).
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { JSONReport } from "@playwright/test/reporter";
import { BROWSER_TOKEN_ENV, maskBrowserToken, newBrowserToken } from "../shared/browser-token.ts";
import { fileSha256 } from "../shared/digest.ts";
import { spawnCommand, stdoutOf } from "../shared/process.ts";
import { ARTIFACTS_DIR_FROM_ROOT, readBenchEnv, ROOT } from "../shared/root.ts";
import { type BrowserImage, browserVersions } from "./browser-versions.ts";
import { type CiRun, ciRunOf, resultFileName, timestamp } from "./ci-run.ts";
import { artifactPaths, collect, type OracleSummary, unreachedSummary } from "./collect.ts";
import { DEFAULT_BASE_URL, ORACLE_ENV } from "./env.ts";
import { SERVICES, type StackContextDigests, stackContextDigests, verifyStackImages } from "./stack-images.ts";
import { describeStack, isHealthy, stackStates } from "./stack-state.ts";
import { GIT_STATUS_ARGS, RESULTS_DIR_FROM_ROOT, worktreeState, type WorktreeState } from "./worktree.ts";

export { DEFAULT_BASE_URL };

// La collecte rapporte les chemins à la racine du dépôt (ROOT, sans barre finale).
const RESULTS_DIR = join(ROOT, RESULTS_DIR_FROM_ROOT);
const CONFIG = join(ROOT, "oracle", "playwright.config.ts");

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
  // Jeton du navigateur du banc (shared/browser-token.ts), passé au service
  // `browser` recréé et à Playwright : celui de la mesure, que ses portes
  // reçoivent (#134). Défaut : un jeton tiré pour l'exécution (#160).
  browserToken?: string;
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

export async function executeOracle({ baseUrl = DEFAULT_BASE_URL, salt, saltImposed, browserToken = newBrowserToken(), ...options }: ExecuteOracleOptions = {}): Promise<ExecuteOracleResult> {
  const prepared = await prepare(baseUrl, salt ?? randomBytes(32).toString("hex"), saltImposed ?? salt !== undefined, { ...options, browserToken });
  const report = await launch(prepared);
  return collectAndWrite(prepared, report);
}

// Environnement relevé avant Playwright : métadonnées du résultat.
export interface OracleEnvironment {
  benchCommit: string;
  worktree: WorktreeState;
  node: string;
  // Chromium du service `browser` et @playwright/test qui le pilote, puis
  // l'image du navigateur réellement utilisée, avec sa plateforme (#78).
  chromium: string;
  playwright: string;
  browserImage: BrowserImage;
  images: Record<string, string>;
  // Empreinte du contexte de construction de chaque image, calculée sur la
  // copie du dépôt et vérifiée sur le label de l'image en cours (#102) : elle
  // relie `images` aux fixtures de `benchCommit` quand l'arbre est propre.
  imageContexts: StackContextDigests;
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
  browserToken: string;
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
  { onStackReady, accessLogDir, browserToken, artifactsDir, resultFile }: Pick<ExecuteOracleOptions, "onStackReady" | "accessLogDir" | "artifactsDir" | "resultFile"> & { browserToken: string },
): Promise<PreparedExecution> {
  const startedAt = new Date();
  // Lu avant la pile : un rang invalide arrête l'exécution avant toute mesure.
  const ciRun = ciRunOf(process.env);
  const imageContexts = await recreateStack(salt, { accessLogDir, browserToken });
  await onStackReady?.();
  const benchCommit = await stdoutOf("git", ["rev-parse", "HEAD"]);
  // Sortie brute, sans trim : une entrée commence par un espace (` M chemin`).
  const worktree = worktreeState((await spawnCommand("git", [...GIT_STATUS_ARGS])).stdout);
  const images = await stackImages();
  const { chromium, playwright, browserImage } = await browserVersions(browserToken);
  const env = await readBenchEnv();
  const executionId = `${timestamp(startedAt)}-${randomBytes(4).toString("hex")}`;
  const artifacts = artifactsDir ?? `${ARTIFACTS_DIR_FROM_ROOT}/${executionId}`;
  return {
    baseUrl,
    salt,
    saltImposed,
    browserToken,
    metadata: { benchCommit, worktree, node: process.version, chromium, playwright, browserImage, images, imageContexts, frozenDate: env.FROZEN_DATE ?? null, baseUrl, artifacts, ...(ciRun === undefined ? {} : { ciRun }) },
    outputDir: join(ROOT, artifacts),
    reportFile: join(ROOT, artifacts, "report.json"),
    resultFile,
    startedAt,
  };
}

// Sorties de Playwright, à côté du dossier des bruts de l'exécution :
// Playwright vide ce dossier à son démarrage.
const PLAYWRIGHT_LOG_SUFFIX = "-playwright.log";
// Lignes de la fin des sorties de Playwright reprises dans la preuve d'une
// erreur de l'oracle.
const LOG_TAIL_LINES = 20;

// Playwright n'a écrit aucun rapport : il n'a pas pu charger sa configuration
// ou ses fichiers (#68). Une erreur de l'oracle, jamais un scénario échoué.
export class OracleError extends Error {
  readonly log: string;
  constructor(message: string, log: string) {
    super(message);
    this.name = "OracleError";
    this.log = log;
  }
}

async function launch({ baseUrl, salt, browserToken, metadata, outputDir, reportFile }: PreparedExecution): Promise<string> {
  await mkdir(dirname(outputDir), { recursive: true });
  const log = `${outputDir}${PLAYWRIGHT_LOG_SUFFIX}`;
  // Code de sortie ignoré : un scénario échoué rend 1, et c'est la collecte qui juge.
  const { code } = await spawnCommand("npx", ["playwright", "test", "--config", CONFIG], {
    env: {
      BASE_URL: baseUrl,
      // Le sel n'est transmis qu'au processus Playwright, pour les scénarios de l'accusé.
      ARCHIVE_SALT: salt,
      // Jeton du navigateur, lu par la fixture `connectOptions` des scénarios (#160).
      [BROWSER_TOKEN_ENV]: browserToken,
      [ORACLE_ENV.outputDir]: outputDir,
      [ORACLE_ENV.report]: reportFile,
      [ORACLE_ENV.metadata]: JSON.stringify(metadata),
    },
    inherit: true,
    logFile: log,
    allowFailure: true,
    // Lancé par le runner, Playwright a son propre groupe de processus, que
    // l'interruption de la mesure arrête en entier (#71).
    processGroup: true,
  });
  try {
    return await readFile(reportFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const tail = (await readFile(log, "utf8")).trimEnd().split("\n").slice(-LOG_TAIL_LINES).join("\n");
    throw new OracleError(`Playwright exited with code ${code} without writing its report:\n${tail}`, log);
  }
}

async function collectAndWrite({ salt, saltImposed, browserToken, startedAt, metadata, outputDir, resultFile: imposedResultFile }: PreparedExecution, raw: string): Promise<ExecuteOracleResult> {
  // Le sel n'apparaît dans le résultat qu'une fois Playwright terminé.
  if (raw.includes(salt)) throw new Error("The Playwright report contains the salt before collection");
  // Le jeton du navigateur n'apparaît jamais dans le résultat : un échec de
  // connexion le citerait dans son message (#160).
  const report = JSON.parse(maskBrowserToken(raw, browserToken)) as JSONReport;
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

// Recrée le legacy et le service d'archivage et attend qu'ils soient sains,
// sur les images déjà construites, puis vérifie qu'elles viennent de cette
// copie du dépôt : le label de chaque image en cours doit être l'empreinte du
// contexte de construction calculée sur la copie, sinon StackNotFromCopy
// (#102). Pas de reconstruction ici : elle changerait l'empreinte des images
// d'une exécution à l'autre. Rend les empreintes vérifiées. Le sel passe
// par l'environnement du shell, jamais par .env (que lit aussi le
// legacy). Partagé avec `migrabench calibrate`. Le journal d'accès du legacy va
// dans `accessLogDir` s'il est donné (MB_ACCESS_LOG_DIR de docker-compose.yml).
// Le jeton du navigateur va au service `browser` (MB_BROWSER_TOKEN, #134) :
// sans lui, ses passerelles refusent tout (#160).
// La pile qui ne devient pas saine lève StackFailed, avec l'état de ses
// services pour preuve (#68).
export async function recreateStack(salt: string, { accessLogDir, browserToken }: { accessLogDir?: string | undefined; browserToken: string }): Promise<StackContextDigests> {
  const digests = await stackContextDigests();
  try {
    // Le navigateur du banc (#78) est recréé avec la pile : même état initial.
    await spawnCommand("docker", ["compose", "up", "--detach", "--force-recreate", "--no-build", "--wait", ...SERVICES, "browser"], {
      env: { ARCHIVE_SALT: salt, ...(accessLogDir === undefined ? {} : { MB_ACCESS_LOG_DIR: accessLogDir }), [BROWSER_TOKEN_ENV]: browserToken },
      inherit: true,
    });
  } catch (error) {
    // Sans service malade relevé, ou si le relevé échoue lui aussi, l'erreur
    // reste imprévue : elle n'est pas une preuve.
    const states = await stackStates().catch((cause: unknown) => {
      throw new Error(`${(error as Error).message}; then the stack state could not be read: ${(cause as Error).message}`);
    });
    if (isHealthy(states)) throw error;
    throw new StackFailed(`${(error as Error).message}\n${describeStack(states)}`);
  }
  await verifyStackImages(digests);
  return digests;
}

// Le legacy ou le service d'archivage n'est pas devenu sain à la recréation de
// la pile (#68). Le message porte l'état des services : la preuve.
export class StackFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StackFailed";
  }
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
