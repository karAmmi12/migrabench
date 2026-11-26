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
// La mesure interrompue vient de #71 (runner/interruption.ts).
// Les portes, leur registre et leur contexte viennent de #124 (gates/) : les
// portes tournent dans la phase `gates`, candidat en marche, sauf la porte du
// relais, lancée dans la clôture après la requête témoin `end` et le contrôle
// du journal d'accès.
import { randomBytes } from "node:crypto";
import { renameSync } from "node:fs";
import { mkdir, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { type GateContext, StackIncident } from "../gates/context.ts";
import { GATES, GATES_PHASE_TIMEOUT_MS, gatesOf, runGates } from "../gates/registry.ts";
import { beforeCandidateEvidence, type GateResult } from "../gates/result.ts";
import { executeOracle, type ExecuteOracleResult, listOracle, OracleError, StackFailed } from "../oracle/execute.ts";
import { SERVICES, stackContextDigests, StackNotFromCopy, verifyBuiltImages } from "../oracle/stack-images.ts";
import { saveServiceLogs, type StackDown, stackDown, stackStates } from "../oracle/stack-state.ts";
import { GIT_STATUS_ARGS, worktreeState } from "../oracle/worktree.ts";
import { ACCESS_LOG_FILE, closeAccessLog } from "./witness.ts";
import { readSeamAMarkers } from "../shared/seam-a-marker.ts";
import { fetchFromInternal, INTERNAL_API_URL } from "../shared/internal-api.ts";
import { contentDigest } from "./candidate-content.ts";
import { CandidateNotStarted, candidateStarter } from "./candidate-start.ts";
import { contractPhase, type ContractPhaseResult } from "./contract-phase.ts";
import { candidateName, measureId as measureIdOf } from "./measure-id.ts";
import { type AccessLogRecord, type CandidateRecord, measureRecord, type OracleRecord } from "./measure-record.ts";
import type { ExitCode, PhaseName, PhaseOutcome, PhaseRecord, RunnerErrorOutcome, Verdict } from "./verdict.ts";
import { citedFileSha256 as digestOf } from "../shared/digest.ts";
import { acquireBenchLock, type TakenOver } from "../shared/bench-lock.ts";
import { interruptibleCommands, spawnCommand, stdoutOf } from "../shared/process.ts";
import { ARTIFACTS_DIR_FROM_ROOT, COUNTED_DIR_FROM_ROOT, ROOT } from "../shared/root.ts";
import { type CountedRecord, countedPreconditions } from "./counted.ts";
import { countedGitFacts } from "./counted-facts.ts";
import { buildCandidate, removeBuildContainers } from "./build.ts";
import { type Interruption, interruptionDetail, watchInterruption } from "./interruption.ts";
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
  removeCandidate,
  RUNTIME_IMAGE,
  stopCandidate,
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
  // Dès le verrou du banc pris, SIGINT et SIGTERM interrompent la mesure au
  // lieu d'arrêter le processus (#71).
  const interruption = watchInterruption();
  try {
    return await measure({ candidate, candidateDir, salt, limits, limitsRecord, startedAt, benchCommit, id, lockRecord: lockRecord(lock.holder.takenAt, lock.takenOver), counted: countedRecord, interruption });
  } finally {
    interruption.dispose();
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
  interruption: Interruption;
}

// Ce que la clôture a relevé (#71).
interface ClosingResult {
  oracle: OracleRecord;
  outcome?: PhaseOutcome<"closing">;
  raw?: Record<string, string>;
  detail?: string | undefined;
  accessLog?: AccessLogRecord;
  // Résultats de la porte du relais.
  gates?: GateResult[];
}

// Résultat collecté de l'oracle, dans le dossier des bruts, avant sa
// promotion en oracle.json.
const COLLECTED_RESULT = "oracle-result.json";

// Délai laissé aux phases interrompues pour finir, leurs commandes arrêtées,
// avant la clôture : une part de l'échéance de measure.json
// (runner/interruption.ts), le reste allant à la clôture.
const INTERRUPTED_PHASES_GRACE_MS = 2_000;

// Phases 1 à 7, sous le verrou du banc.
//
// Erreurs imprévues du runner (#68) : une fois le dossier de la mesure créé,
// toute erreur est rangée dans la phase en cours, avec l'erreur en détail.
// Avant le lancement de `npm ci`, aucun code du candidat n'a tourné :
// `runner-error-before-candidate`, invalide. Ensuite,
// `stack-down-while-candidate`, comptée contre le candidat (règle 7). La clôture tourne toujours. Avant le dossier de la mesure, ou si
// measure.json ne peut pas être écrit, l'erreur reste un plantage (code 1).
//
// Mesure interrompue (#71) : la phase en cours est fermée `interrupted`, les
// commandes qu'elle a lancées reçoivent le signal et elle ne peut plus en
// lancer ; les conteneurs de la construction sont supprimés, puis la clôture
// tourne comme toujours et arrête le candidat. Un signal reçu entre les
// phases ou pendant la clôture est rangé dans la clôture.
async function measure({ candidate, candidateDir, salt, limits, limitsRecord, startedAt, benchCommit, id, lockRecord, counted, interruption }: MeasureContext): Promise<MeasureResult> {
  const phases: PhaseRecord[] = [];
  const tracker = startPhases(phases);
  const phase = tracker.open;
  // Erreur levée hors de toute phase ouverte : rangée dans la clôture.
  let unplaced: string | undefined;
  // Le conteneur de `npm ci` (`fetch`) a été lancé : une erreur imprévue est
  // ensuite comptée contre le candidat.
  let npmCiLaunched = false;

  // 1. Préparation. Un lien symbolique ou un fichier illisible du candidat
  // n'est pas copié : c'est un défaut de ses fichiers, cité par le contrat
  // (contract-failure), jamais une erreur du runner (#68).
  const closePreparation = phase("preparation");
  const worktree = worktreeState((await spawnCommand("git", [...GIT_STATUS_ARGS])).stdout);
  const { files, defects } = await candidateFiles(candidateDir);
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
  // Résultats des portes de la phase `gates`, et contexte donné aux portes,
  // repris par la porte du relais dans la clôture : défini si la phase
  // `gates` a été atteinte.
  const gateResults: GateResult[] = [];
  let gateContext: Omit<GateContext, "signal"> | undefined;

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
    const contract = await contractPhase(copyDir, defects);
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
    // Démarrage du candidat après chaque recréation de la pile, et
    // redémarrage du legacy demandé par une porte (runner/candidate-start.ts).
    // `stackBefore` : l'état de la pile saine, candidat arrêté, comparé à celui
    // de la fin de l'oracle, et de chaque porte, pour voir un service tombé
    // pendant que le candidat tournait.
    const { readyCandidate, restartLegacy, stackBefore } = candidateStarter({ service: described, salt: measureSalt, accessLogDir, marker, readyTimeoutMs: limits.readyTimeoutMs, startWitnesses });
    let result: ExecuteOracleResult;
    try {
      result = await executeOracle({
        baseUrl: CANDIDATE_BASE_URL,
        salt: measureSalt,
        // Tiré par la mesure, sauf ORACLE_SALT : oracle.json le dit comme measure.json.
        saltImposed: salt !== undefined,
        artifactsDir: `${ARTIFACTS_DIR_FROM_ROOT}/${id}/oracle`,
        // Écrit d'abord dans le dossier des bruts : seule la phase le promeut
        // en oracle.json, si la mesure n'est pas interrompue (#71).
        resultFile: join(rawDir, COLLECTED_RESULT),
        accessLogDir,
        onStackReady: async () => {
          await readyCandidate();
          closeStart();
          closeOracle = phase("oracle");
        },
      });
    } catch (error) {
      // Pile recréée sur des images d'une autre copie du dépôt (#102), ou qui
      // n'est pas devenue saine (#68) : candidat arrêté, un incident du banc.
      if (error instanceof StackNotFromCopy) return void closeStart("stack-not-from-this-copy", {}, error.message);
      if (error instanceof StackFailed) return void closeStart("stack-failed-before-candidate", await saveServiceLogs(rawDir, SERVICES), error.message);
      if (error instanceof CandidateNotStarted) return void closeStart(error.outcome, {}, error.detail);
      // Playwright n'a écrit aucun rapport (#68) : oracle non exécuté, sans
      // compte des scénarios, que la liste ne donnerait pas non plus.
      if (error instanceof OracleError && closeOracle !== undefined) {
        if (interruption.signal() === undefined) oracle = { executed: false };
        return void closeOracle("oracle-error", { [relative(rawDir, error.log)]: await digestOf(error.log) }, error.message);
      }
      throw error;
    }
    const resultDigest = await digestOf(result.resultFile);
    // Résultat de l'oracle figé dès le signal (#71) : la vérification et la
    // promotion sont synchrones, aucun signal ne s'intercale. Interrompue, la
    // phase garde le résultat collecté dans ses bruts, jamais dans la mesure.
    if (interruption.signal() !== undefined) return;
    renameSync(result.resultFile, join(measureDir, "oracle.json"));
    oracleMetadata = result.metadata;
    oracle = { executed: true, result: resultDigest, summary: result.summary };
    // Service tombé pendant que le candidat tournait : le résultat de
    // l'oracle est gardé. La panne passe devant une erreur de l'oracle de la
    // même exécution, que le candidat a pu provoquer en la faisant tomber :
    // invalider la mesure lui offrirait une seconde chance (règle 7).
    const down = stackDown(stackBefore(), await stackStates());
    // La mesure est alors décidée, et la pile n'est plus sûre : les portes ne
    // tournent pas (#124).
    if (down !== undefined) return void closeOracle?.("stack-down-while-candidate", await saveServiceLogs(rawDir, down.services), down.detail);
    if (result.errors > 0) return void closeOracle?.("oracle-error", {}, result.errorMessages.join("\n"));
    closeOracle?.();

    // 6. Portes, candidat en marche, dans l'ordre du registre (gates/). Une
    // panne de la pile pendant une porte est rangée comme ailleurs ; une
    // erreur de porte avant le candidat rend la mesure invalide. Aucun autre
    // résultat ne change le verdict (ADR 0008).
    const closeGates = phase("gates");
    gateContext = {
      candidateUrl: CANDIDATE_BASE_URL,
      candidateDir,
      builtCopyDir: copyDir,
      oracle: { resultFile: join(measureDir, "oracle.json"), harFiles: await harFiles(join(rawDir, "oracle")) },
      internalApi: { get: (path) => fetchFromInternal(`${INTERNAL_API_URL}${path}`, { method: "GET" }) },
      restartLegacy,
    };
    try {
      // Les résultats des portes passées restent dans gateResults si une
      // panne arrête les suivantes.
      await runGates(gatesOf(GATES, "gates"), gateContext, {
        deadline: Date.now() + GATES_PHASE_TIMEOUT_MS,
        afterEach: async () => {
          const fell = stackDown(stackBefore(), await stackStates());
          if (fell !== undefined) throw new StackDownDuringGates(fell);
        },
        results: gateResults,
      });
    } catch (error) {
      if (error instanceof StackIncident) return void closeGates(error.outcome, {}, error.detail ?? error.message);
      if (error instanceof StackDownDuringGates) return void closeGates("stack-down-while-candidate", await saveServiceLogs(rawDir, error.down.services), error.down.detail);
      throw error;
    }
    const gateError = beforeCandidateEvidence(gateResults);
    closeGates(gateError === undefined ? "ok" : "gate-error-before-candidate", {}, gateError);
  };
  const commands = interruptibleCommands(runPhases);
  // Une erreur levée après l'interruption en est la suite : elle n'est pas rangée.
  const phasesDone = commands.result.then(
    () => undefined,
    (error: unknown) => {
      if (interruption.signal() !== undefined) return;
      const current = tracker.current();
      if (current === undefined) unplaced = describeError(error);
      else current.close(runnerErrorOutcome(npmCiLaunched), {}, describeError(error));
    },
  );
  // Raison d'écrire measure.json sans attendre : second signal ou échéance.
  let cutShort: string | undefined;
  void interruption.cutShort.then((reason) => (cutShort = reason));
  const signal = await Promise.race([phasesDone, interruption.received]);
  // L'interruption a-t-elle été rangée dans une phase avant la clôture ?
  let interruptionPlaced = false;
  if (signal !== undefined) {
    commands.interrupt(signal);
    interruptionPlaced = tracker.interrupt(interruptionDetail(signal));
    let grace: NodeJS.Timeout | undefined;
    await Promise.race([phasesDone, interruption.cutShort, new Promise((resolve) => (grace = setTimeout(resolve, INTERRUPTED_PHASES_GRACE_MS)))]);
    clearTimeout(grace);
    // Ce qui tourne encore, Playwright et son groupe compris, est arrêté.
    commands.kill();
  }

  // 7. Clôture : arrêt du candidat, compte des scénarios si l'oracle n'a pas
  // été lancé ou a été interrompu, puis requête témoin de fin et contrôle du
  // journal d'accès si la pile a été recréée. Une erreur y est rangée comme
  // ailleurs. Mesure interrompue : les conteneurs de la construction sont
  // supprimés, le candidat est arrêté sans attendre, et la clôture est
  // abrégée au second signal ou à l'échéance (runner/interruption.ts).
  const openedClosing = phase("closing");
  // Un signal reçu sans phase où le ranger : la clôture est interrompue, et
  // garde son propre détail à la suite de la preuve.
  const closeClosing: ClosePhase<"closing"> = (outcome, raw, detail) => {
    const received = interruption.signal();
    if (received === undefined || interruptionPlaced) return openedClosing(outcome, raw, detail);
    openedClosing("interrupted", raw, [interruptionDetail(received), ...(detail === undefined ? [] : [detail])].join("\n"));
  };
  // La clôture rend ce qu'elle a relevé : abrégée, elle ne touche plus à la mesure.
  const closingWork = async (): Promise<ClosingResult> => {
    let closingOracle = oracle;
    try {
      const interrupted = interruption.signal() !== undefined;
      if (interrupted && npmCiLaunched) await removeBuildContainers(id);
      if (service !== undefined) await stopCandidate(service, { immediately: interrupted });
      // Oracle non lancé ou interrompu : le compte des scénarios, tous non
      // atteints. La liste a son propre dossier : celui d'un oracle lancé
      // garde ses bruts partiels tels quels (#71).
      closingOracle ??= { executed: false, summary: await listOracle(`${ARTIFACTS_DIR_FROM_ROOT}/${id}/oracle-list`) };
      if (unplaced !== undefined) return { oracle: closingOracle, outcome: runnerErrorOutcome(npmCiLaunched), detail: unplaced };
      if (startWitnesses.length === 0) return { oracle: closingOracle };
      const closed = await closeAccessLog({ accessLogDir, marker, rawDir, startWitnesses, seamAMarkers: readSeamAMarkers() });
      const checked = { oracle: closingOracle, outcome: closed.outcome, raw: closed.raw, detail: closed.detail, ...(closed.accessLog === undefined ? {} : { accessLog: closed.accessLog }) };
      // Porte du relais : après la requête témoin `end` et un journal
      // contrôlé `ok`, si la phase `gates` a été atteinte et que la mesure
      // n'est pas interrompue. Une erreur avant le candidat rend la mesure
      // invalide.
      if (closed.outcome !== "ok" || closed.accessLog === undefined || gateContext === undefined || interruption.signal() !== undefined) return checked;
      const accessLog = { file: join(rawDir, ACCESS_LOG_FILE), digest: closed.accessLog.log, witnesses: closed.accessLog.witnesses };
      let gates: GateResult[];
      try {
        gates = await runGates(gatesOf(GATES, "closing"), { ...gateContext, accessLog });
      } catch (error) {
        // Erreur du banc : rangée comme ailleurs, le relevé du journal gardé.
        return { ...checked, outcome: runnerErrorOutcome(npmCiLaunched), detail: describeError(error) };
      }
      const gateError = beforeCandidateEvidence(gates);
      return { ...checked, gates, ...(gateError === undefined ? {} : { outcome: "gate-error-before-candidate" as const, detail: gateError }) };
    } catch (error) {
      return { oracle: closingOracle ?? { executed: false }, outcome: runnerErrorOutcome(npmCiLaunched), detail: describeError(error) };
    }
  };
  const cut = (reason: string): ClosingResult => ({ oracle: oracle ?? { executed: false }, outcome: "interrupted", detail: reason });
  let closing: ClosingResult;
  if (cutShort === undefined) {
    const closingCommands = interruptibleCommands(closingWork);
    const done = await Promise.race([closingCommands.result, interruption.cutShort]);
    if (typeof done === "string") closingCommands.kill();
    closing = typeof done === "string" ? cut(done) : done;
  } else closing = cut(cutShort);
  closeClosing(closing.outcome, closing.raw, closing.detail);
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
    ...(closing.accessLog === undefined ? {} : { accessLog: closing.accessLog }),
    phases,
    oracle: closing.oracle,
    ...(counted === undefined ? {} : { counted }),
    gates: [...gateResults, ...(closing.gates ?? [])],
  });
  // Écriture atomique : un fichier temporaire, puis renommé. Un arrêt pendant
  // l'écriture ne laisse jamais un measure.json à moitié écrit (#71).
  const measureFile = join(measureDir, "measure.json");
  await writeFile(`${measureFile}.partial`, `${JSON.stringify(record, null, 2)}\n`);
  await rename(`${measureFile}.partial`, measureFile);
  // Clôture abrégée : le candidat et les conteneurs de la construction sont
  // supprimés une fois measure.json écrit.
  if (cutShort !== undefined) {
    if (npmCiLaunched) await removeBuildContainers(id);
    if (service !== undefined) await removeCandidate(service);
  }
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

// Levée après une porte quand un service de la pile est tombé pendant
// qu'elle examinait le candidat (spec de l'étape 3, « stack-down-while-candidate »).
class StackDownDuringGates extends Error {
  readonly down: StackDown;
  constructor(down: StackDown) {
    super(down.detail);
    this.down = down;
  }
}

// HAR des scénarios de l'oracle (oracle/support.ts), sous son dossier des bruts.
async function harFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".har")).map((entry) => join(entry.parentPath, entry.name)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

// Chaque appel ouvre une phase et rend la fonction qui la ferme, avec son
// issue (`ok` par défaut), les empreintes de ses bruts et son détail (pour une
// issue qui rend la mesure invalide, sa preuve).
type ClosePhase<N extends PhaseName> = (outcome?: PhaseOutcome<N>, raw?: Record<string, string>, detail?: string) => void;

// Phases ouvertes par `open` ; `current` rend la phase ouverte et pas encore
// fermée, pour y ranger une erreur imprévue (#68). `interrupt` ferme la phase
// en cours `interrupted` et rend vrai s'il y en avait une (#71) : ensuite, les
// phases interrompues ne peuvent plus ni se fermer ni en ouvrir une autre.
// Seule la clôture s'ouvre encore.
function startPhases(phases: PhaseRecord[]) {
  let current: { name: PhaseName; close: ClosePhase<PhaseName> } | undefined;
  let interrupted = false;
  const open = <N extends PhaseName>(name: N): ClosePhase<N> => {
    if (interrupted && name !== "closing") throw new Error(`Phase ${name} not opened: the measure is interrupted`);
    const startedAt = new Date();
    const entry = { name, close: undefined as unknown as ClosePhase<PhaseName> };
    const closing = interrupted;
    const close: ClosePhase<N> = (outcome = "ok", raw = {}, detail) => {
      if (interrupted && !closing) return;
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
  const interrupt = (detail: string): boolean => {
    const entry = current;
    entry?.close("interrupted", {}, detail);
    interrupted = true;
    return entry !== undefined;
  };
  return { open, current: () => current, interrupt };
}
