// Runner de mesure (spec de l'étape 3, « Modules ») : un seul point d'entrée,
// measureCandidate, sur lequel `migrabench measure` est une commande mince.
// Il enchaîne les phases d'une mesure, écrit le dossier de la mesure
// (measure.json, oracle.json) et rend l'issue.
//
// Fil traceur (#62) : mesure de diagnostic seulement, sans journal d'accès.
// Les tickets suivants de l'étape l'ajoutent. La construction, ses délais et
// ses limites viennent de #65 (runner/build.ts).
// Le contrat vient de #64 (runner/contract-phase.ts).
// Le verdict et les codes de sortie viennent de #63 (runner/verdict.ts).
// Le verrou du banc vient de #69 (shared/bench-lock.ts) : pris avant la
// préparation, libéré à la fin de la mesure, y compris sur erreur.
// Les délais et limites du dernier étalonnage de CI viennent de #72
// (runner/calibration-results.ts).
// Le journal d'accès, le marqueur et les requêtes témoins viennent de #67
// (runner/access-log.ts, runner/witness.ts).
// Les pannes de la pile et les erreurs imprévues du runner, rangées dans une
// mesure, viennent de #68 (oracle/stack-state.ts).
import { randomBytes } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { executeOracle, type ExecuteOracleResult, listOracle, OracleError, StackFailed } from "../oracle/execute.ts";
import { SERVICES, stackContextDigests, StackNotFromCopy, verifyBuiltImages } from "../oracle/stack-images.ts";
import { saveServiceLogs, type ServiceState, stackDown, stackStates } from "../oracle/stack-state.ts";
import { GIT_STATUS_ARGS, worktreeState } from "../oracle/worktree.ts";
import { checkAccessLog } from "./access-log.ts";
import { closeAccessLog, sendWitness, witnessEvidence } from "./witness.ts";
import { readSeamAMarkers } from "../shared/seam-a-marker.ts";
import { contentDigest } from "./candidate-content.ts";
import { contractPhase, type ContractPhaseResult } from "./contract-phase.ts";
import { candidateName, measureId as measureIdOf } from "./measure-id.ts";
import { type AccessLogRecord, type CandidateRecord, measureRecord, type OracleRecord } from "./measure-record.ts";
import type { ExitCode, PhaseName, PhaseOutcome, PhaseRecord, RunnerErrorOutcome, Verdict } from "./verdict.ts";
import { citedFileSha256 as digestOf } from "../shared/digest.ts";
import { acquireBenchLock, type TakenOver } from "../shared/bench-lock.ts";
import { spawnCommand, stdoutOf } from "../shared/process.ts";
import { ARTIFACTS_DIR_FROM_ROOT, COUNTED_DIR_FROM_ROOT, ROOT } from "../shared/root.ts";
import { type CountedRecord, countedPreconditions } from "./counted.ts";
import { countedGitFacts } from "./counted-facts.ts";
import { buildCandidate } from "./build.ts";
import { appliedCalibration } from "./calibration-results.ts";
import {
  buildRuntimeImage,
  CANDIDATE_BASE_URL,
  CANDIDATE_PORT,
  candidateFiles,
  candidateService,
  type CandidateService,
  copyCandidate,
  isDirectory,
  RUNTIME_IMAGE,
  startCandidate,
  stopCandidate,
  waitUntilReady,
} from "./candidate-runtime.ts";
import { type ContainerUser, containerUser } from "./container-user.ts";
import { cpuShortfall, type Limits, measureLimits, SAFETY_CAP } from "./limits.ts";
import { DIAGNOSTIC_DIR_FROM_ROOT } from "./paths.ts";

export interface MeasureOptions {
  // Dossier du candidat, relatif à la racine du dépôt.
  candidate: string;
  // Prévue pour compter (#73) : refusée hors d'un état publié, écrite sous
  // results/counted/, versionné.
  counted?: boolean;
  // Imposé : diagnostic seulement.
  salt?: string;
  // Plafond des délais imposé (`--timeout-cap-ms`) : diagnostic seulement.
  timeoutCapMs?: number;
}

// Une mesure écrite, valide (0) ou invalide (3), ou un refus préalable (4) :
// rien n'est écrit.
export type MeasureResult =
  | { written: true; measureDir: string; outcome: Verdict; exitCode: ExitCode }
  | { written: false; refusal: Refusal; message: string; exitCode: 4 };

type Refusal = "refused-usage" | "refused-counted" | "refused-lock";

export async function measureCandidate({ candidate, counted = false, salt, timeoutCapMs }: MeasureOptions): Promise<MeasureResult> {
  // 0. Refus préalables, avant toute écriture.
  const refused = (message: string, refusal: Refusal = "refused-usage"): MeasureResult => ({
    written: false,
    refusal,
    message,
    exitCode: 4,
  });
  // Délais et limites du dernier étalonnage de CI ; sans lui, le plafond de
  // sécurité, marqué provisoire.
  const calibration = await appliedCalibration();
  let limits: Limits;
  let limitsRecord: ReturnType<typeof measureLimits>["record"];
  try {
    ({ limits, record: limitsRecord } = measureLimits({ safetyCap: SAFETY_CAP, calibration, timeoutCapMs }));
  } catch (error) {
    return refused((error as Error).message);
  }
  try {
    candidateName(candidate);
  } catch (error) {
    return refused((error as Error).message);
  }
  const candidateDir = join(ROOT, candidate);
  if (!(await isDirectory(candidateDir))) return refused(`The candidate directory does not exist: ${candidate}`);
  // Prévue pour compter : un état publié, après les refus d'options et avant
  // le verrou du banc. Le sel et le plafond des délais imposés restent permis
  // en diagnostic.
  let countedRecord: CountedRecord | undefined;
  if (counted) {
    const preconditions = countedPreconditions({
      ...(await countedGitFacts(ROOT)),
      saltImposed: salt !== undefined,
      timeoutCapImposed: timeoutCapMs !== undefined,
      calibrationVersioned: calibration !== undefined,
    });
    if (!preconditions.ok) return refused(preconditions.message, "refused-counted");
    countedRecord = { originMain: preconditions.originMain };
  }
  // Verrou du banc, au nom de la mesure : son identifiant est tiré avant.
  const startedAt = new Date();
  const benchCommit = await stdoutOf("git", ["rev-parse", "HEAD"]);
  const id = measureIdOf(startedAt, benchCommit, candidate);
  const lock = acquireBenchLock({ tool: "measure", measureId: id });
  if (!lock.ok) return refused(lock.message, "refused-lock");
  try {
    return await measure({ candidate, candidateDir, salt, limits, limitsRecord, startedAt, benchCommit, id, lockRecord: lockRecord(lock.holder.takenAt, lock.takenOver), counted: countedRecord });
  } finally {
    lock.release();
  }
}

// `environment.lock` : prise du verrou du banc, et reprise d'un verrou du banc
// orphelin s'il y en a eu une.
function lockRecord(takenAt: string, takenOver: TakenOver | undefined) {
  return { takenAt, ...(takenOver === undefined ? {} : { takenOver }) };
}

interface MeasureContext {
  candidate: string;
  candidateDir: string;
  salt: string | undefined;
  limits: Limits;
  limitsRecord: ReturnType<typeof measureLimits>["record"];
  startedAt: Date;
  benchCommit: string;
  id: string;
  lockRecord: ReturnType<typeof lockRecord>;
  // Prévue pour compter : le commit de origin/main vérifié.
  counted: CountedRecord | undefined;
}

// Phases 1 à 7, sous le verrou du banc.
//
// Erreurs imprévues du runner (#68) : une fois le dossier de la mesure créé,
// toute erreur est rangée dans la phase en cours, avec l'erreur en détail.
// Avant le lancement de `npm ci`, aucun code du candidat n'a tourné :
// `runner-error-before-candidate`, invalide. Ensuite,
// `stack-down-while-candidate`, comptée contre le candidat (règle 7). La clôture tourne toujours. Avant le dossier de la mesure, ou si
// measure.json ne peut pas être écrit, l'erreur reste un plantage (code 1).
async function measure({ candidate, candidateDir, salt, limits, limitsRecord, startedAt, benchCommit, id, lockRecord, counted }: MeasureContext): Promise<MeasureResult> {
  const phases: PhaseRecord[] = [];
  const tracker = startPhases(phases);
  const phase = tracker.open;
  // Erreur levée hors de toute phase ouverte : rangée dans la clôture.
  let unplaced: string | undefined;
  // Le conteneur de `npm ci` (`fetch`) a été lancé : une erreur imprévue est
  // ensuite comptée contre le candidat.
  let npmCiLaunched = false;

  // 1. Préparation. Les fichiers du candidat sont relevés avant le dossier de
  // la mesure : un lien symbolique, ou un fichier illisible, vient du
  // candidat, et ne doit jamais devenir une erreur du runner, invalide.
  const closePreparation = phase("preparation");
  const worktree = worktreeState((await spawnCommand("git", [...GIT_STATUS_ARGS])).stdout);
  const files = await candidateFiles(candidateDir);
  const candidateRecord: CandidateRecord = { path: candidate, contentDigest: contentDigest(files) };
  const measureDir = join(ROOT, counted === undefined ? DIAGNOSTIC_DIR_FROM_ROOT : COUNTED_DIR_FROM_ROOT, id);
  const rawDir = join(ROOT, ARTIFACTS_DIR_FROM_ROOT, id);
  await mkdir(dirname(measureDir), { recursive: true });
  // Sans `recursive` : un dossier de mesure existant n'est jamais réécrit.
  await mkdir(measureDir);
  const measureSalt = salt ?? randomBytes(32).toString("hex");
  // Marqueur de la mesure : jamais transmis au candidat, écrit dans
  // measure.json à la fin seulement. Le journal d'accès du legacy est écrit
  // dans le dossier des bruts, qui survit aux recréations de la pile.
  const marker = randomBytes(32).toString("hex");
  const accessLogDir = join(rawDir, "access-log");
  // Requêtes témoins de début envoyées, une par recréation de la pile.
  const startWitnesses: string[] = [];
  const copyDir = join(rawDir, "candidate");
  let runtimeImage: string | undefined;
  let user: ContainerUser | undefined;
  let service: CandidateService | undefined;
  let oracle: OracleRecord | undefined;
  let oracleMetadata: ExecuteOracleResult["metadata"] | undefined;

  // Phases 1 à 6 : un `return` arrête la mesure, la clôture tourne toujours.
  const runPhases = async (): Promise<void> => {
    await mkdir(rawDir, { recursive: true });
    await mkdir(accessLogDir);
    await copyCandidate(candidateDir, files, copyDir);
    runtimeImage = await buildRuntimeImage();
    const containerUserOfRunner = containerUser(process.getuid?.(), process.getgid?.());
    user = containerUserOfRunner;
    // Garde-fou : une limite de CPU que Docker refuserait sur cette machine
    // arrête la mesure avant tout code du candidat (runner/limits.ts).
    const shortfall = cpuShortfall(limits, Number(await stdoutOf("docker", ["info", "--format", "{{.NCPU}}"])));
    // Images de la pile construites depuis cette copie du dépôt (#102),
    // vérifiées avant tout code du candidat ; puis de nouveau sur les
    // conteneurs, à chaque recréation de la pile (oracle/execute.ts).
    const notFromCopy = await verifyBuiltImages(await stackContextDigests()).then(
      () => undefined,
      (error: unknown) => {
        if (error instanceof StackNotFromCopy) return error.message;
        throw error;
      },
    );
    if (notFromCopy !== undefined) return void closePreparation("stack-not-from-this-copy", {}, notFromCopy);
    if (shortfall !== undefined) return void closePreparation("runner-error-before-candidate", {}, shortfall);
    closePreparation();

    // 2. Contrat : candidate.json, package.json et sources du package-lock.json,
    // lus dans la copie (runner/contract-phase.ts). Invalide, il arrête la
    // mesure avant tout code du candidat : ni construction, ni démarrage.
    const closeContract = phase("contract");
    const contract = await contractPhase(copyDir);
    Object.assign(candidateRecord, contract.candidate);
    if (contract.outcome !== "ok") return void closeContract(contract.outcome, {}, contract.detail);
    const { build: buildCommand, start } = contract.candidate;
    if (start === undefined) throw new Error("A valid contract declares start");
    closeContract();

    // 3. Construction : `npm ci` puis `build`, sans mb-internal ni variable du
    // banc, sous le délai global et les limites (runner/build.ts).
    const closeBuild = phase("build");
    const build = await buildCandidate({ measureId: id, image: RUNTIME_IMAGE, user: containerUserOfRunner, rawDir, copyDir, build: buildCommand, limits, onNpmCiLaunch: () => (npmCiLaunched = true) });
    if (build.outcome.outcome !== "ok") return void closeBuild(build.outcome.outcome, build.raw, build.outcome.detail);
    closeBuild("ok", build.raw);

    // 4 et 5. Pile et démarrage, puis oracle. L'exécution complète de l'étape 2
    // recrée le legacy et le service d'archivage, puis rappelle le runner, qui
    // recrée le service `candidate` et attend sa disponibilité.
    const closeStart = phase("start");
    const described = await candidateService({ rawDir, copyDir, user: containerUserOfRunner, start, limits });
    service = described;
    let closeOracle: ClosePhase<"oracle"> | undefined;
    let startOutcome: PhaseOutcome<"start"> = "ok";
    // État de la pile saine, candidat arrêté : comparé à celui de la fin de
    // l'oracle pour voir un service tombé pendant que le candidat tournait.
    let stackBefore: ServiceState[] = [];
    let result: ExecuteOracleResult;
    try {
      result = await executeOracle({
        baseUrl: CANDIDATE_BASE_URL,
        salt: measureSalt,
        // Tiré par la mesure, sauf ORACLE_SALT : oracle.json le dit comme measure.json.
        saltImposed: salt !== undefined,
        artifactsDir: `${ARTIFACTS_DIR_FROM_ROOT}/${id}/oracle`,
        resultFile: join(measureDir, "oracle.json"),
        accessLogDir,
        onStackReady: async () => {
          await stopCandidate(described);
          // Requête témoin de début, pile saine et candidat arrêté.
          const name = `start-${startWitnesses.length + 1}`;
          startWitnesses.push(name);
          const witness = await sendWitness(name, { accessLogDir, marker });
          const check = checkAccessLog({ log: witness.log, marker, expected: startWitnesses, seamAMarkers: [] });
          if (check.outcome === "access-log-inactive") {
            startOutcome = check.outcome;
            throw new CandidateNotStarted(check.outcome, witnessEvidence(witness, check));
          }
          stackBefore = await stackStates();
          await startCandidate(described);
          startOutcome = await waitUntilReady(described, limits.readyTimeoutMs);
          if (startOutcome !== "ok") throw new CandidateNotStarted(startOutcome);
          closeStart();
          closeOracle = phase("oracle");
        },
      });
    } catch (error) {
      // Pile recréée sur des images d'une autre copie du dépôt (#102), ou qui
      // n'est pas devenue saine (#68) : candidat arrêté, un incident du banc.
      if (error instanceof StackNotFromCopy) return void closeStart("stack-not-from-this-copy", {}, error.message);
      if (error instanceof StackFailed) return void closeStart("stack-failed-before-candidate", await saveServiceLogs(rawDir, SERVICES), error.message);
      if (error instanceof CandidateNotStarted) return void closeStart(startOutcome, {}, error.detail);
      // Playwright n'a écrit aucun rapport (#68) : oracle non exécuté, sans
      // compte des scénarios, que la liste ne donnerait pas non plus.
      if (error instanceof OracleError && closeOracle !== undefined) {
        oracle = { executed: false };
        return void closeOracle("oracle-error", { [relative(rawDir, error.log)]: await digestOf(error.log) }, error.message);
      }
      throw error;
    }
    oracleMetadata = result.metadata;
    oracle = { executed: true, result: await digestOf(result.resultFile), summary: result.summary };
    // Service tombé pendant que le candidat tournait : le résultat de
    // l'oracle est gardé. La panne passe devant une erreur de l'oracle de la
    // même exécution, que le candidat a pu provoquer en la faisant tomber :
    // invalider la mesure lui offrirait une seconde chance (règle 7).
    const down = stackDown(stackBefore, await stackStates());
    if (down !== undefined) closeOracle?.("stack-down-while-candidate", await saveServiceLogs(rawDir, down.services), down.detail);
    else if (result.errors > 0) closeOracle?.("oracle-error", {}, result.errorMessages.join("\n"));
    else closeOracle?.();
    const closeGates = phase("gates");
    closeGates();
  };
  try {
    await runPhases();
  } catch (error) {
    const current = tracker.current();
    if (current === undefined) unplaced = describeError(error);
    else current.close(runnerErrorOutcome(npmCiLaunched), {}, describeError(error));
  }

  // 7. Clôture : arrêt du candidat, compte des scénarios si l'oracle n'a pas
  // été lancé, puis requête témoin de fin et contrôle du journal d'accès si
  // la pile a été recréée. Une erreur y est rangée comme ailleurs.
  const closeClosing = phase("closing");
  let accessLog: AccessLogRecord | undefined;
  try {
    if (service !== undefined) await stopCandidate(service);
    // Oracle non lancé : le compte des scénarios, tous non atteints.
    oracle ??= { executed: false, summary: await listOracle(`${ARTIFACTS_DIR_FROM_ROOT}/${id}/oracle`) };
    if (unplaced !== undefined) closeClosing(runnerErrorOutcome(npmCiLaunched), {}, unplaced);
    else if (startWitnesses.length === 0) closeClosing();
    else {
      const closed = await closeAccessLog({ accessLogDir, marker, rawDir, startWitnesses, seamAMarkers: readSeamAMarkers() });
      accessLog = closed.accessLog;
      closeClosing(closed.outcome, closed.raw, closed.detail);
    }
  } catch (error) {
    oracle ??= { executed: false };
    closeClosing(runnerErrorOutcome(npmCiLaunched), {}, describeError(error));
  }
  const startPhase = phases.find(({ name }) => name === "start");
  if (startPhase !== undefined && service !== undefined && (await isFile(service.startLog))) startPhase.raw["start.log"] = await digestOf(service.startLog);

  const { record, exitCode } = measureRecord({
    measureId: id,
    candidate: candidateRecord,
    environment: {
      benchCommit,
      worktree,
      node: process.version,
      ...oracleMetadata,
      ...(runtimeImage === undefined ? {} : { runtimeImage }),
      ...(user === undefined ? {} : { containerUser: user }),
      ...(service === undefined ? {} : { composeOverride: service.composeOverride }),
      port: CANDIDATE_PORT,
      limits: limitsRecord,
      lock: lockRecord,
    },
    salt: measureSalt,
    saltImposed: salt !== undefined,
    marker,
    ...(accessLog === undefined ? {} : { accessLog }),
    phases,
    oracle,
    ...(counted === undefined ? {} : { counted }),
  });
  await writeFile(join(measureDir, "measure.json"), `${JSON.stringify(record, null, 2)}\n`);
  return { written: true, measureDir, outcome: record.verdict, exitCode };
}

// Issue d'une erreur imprévue du runner (#68) : avant le lancement de
// `npm ci`, aucun code du candidat n'a tourné ; ensuite, une panne pendant
// que le candidat tourne.
function runnerErrorOutcome(npmCiLaunched: boolean): RunnerErrorOutcome {
  return npmCiLaunched ? "stack-down-while-candidate" : "runner-error-before-candidate";
}

// L'erreur en détail : sa pile d'appels, qui commence par son message.
function describeError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// Levée par le rappel pour arrêter l'exécution de l'oracle avant Playwright.
// `detail` : la preuve d'une issue qui rend la mesure invalide.
class CandidateNotStarted extends Error {
  readonly detail: string | undefined;
  constructor(outcome: PhaseOutcome<"start">, detail?: string) {
    super(`The candidate did not start: ${outcome}`);
    this.detail = detail;
  }
}

// Chaque appel ouvre une phase et rend la fonction qui la ferme, avec son
// issue (`ok` par défaut), les empreintes de ses bruts et son détail (pour une
// issue qui rend la mesure invalide, sa preuve).
type ClosePhase<N extends PhaseName> = (outcome?: PhaseOutcome<N>, raw?: Record<string, string>, detail?: string) => void;

// Phases ouvertes par `open` ; `current` rend la phase ouverte et pas encore
// fermée, pour y ranger une erreur imprévue (#68).
function startPhases(phases: PhaseRecord[]) {
  let current: { name: PhaseName; close: ClosePhase<PhaseName> } | undefined;
  const open = <N extends PhaseName>(name: N): ClosePhase<N> => {
    const startedAt = new Date();
    const entry = { name, close: undefined as unknown as ClosePhase<PhaseName> };
    const close: ClosePhase<N> = (outcome = "ok", raw = {}, detail) => {
      phases.push({
        name,
        outcome,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        raw,
        ...(detail === undefined ? {} : { detail }),
      } as PhaseRecord);
      if (current === entry) current = undefined;
    };
    entry.close = close as ClosePhase<PhaseName>;
    current = entry;
    return close;
  };
  return { open, current: () => current };
}
