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
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { executeOracle, type ExecuteOracleResult, listOracle } from "../oracle/execute.ts";
import { stackContextDigests, StackNotFromCopy, verifyBuiltImages } from "../oracle/stack-images.ts";
import { GIT_STATUS_ARGS, worktreeState } from "../oracle/worktree.ts";
import { checkAccessLog } from "./access-log.ts";
import { closeAccessLog, sendWitness, witnessEvidence } from "./witness.ts";
import { readSeamAMarkers } from "../shared/seam-a-marker.ts";
import { contentDigest } from "./candidate-content.ts";
import { contractPhase, type ContractPhaseResult } from "./contract-phase.ts";
import { candidateName, measureId as measureIdOf } from "./measure-id.ts";
import { type AccessLogRecord, type CandidateRecord, measureRecord, type OracleRecord } from "./measure-record.ts";
import type { ExitCode, PhaseName, PhaseOutcome, PhaseRecord, Verdict } from "./verdict.ts";
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
import { containerUser } from "./container-user.ts";
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
async function measure({ candidate, candidateDir, salt, limits, limitsRecord, startedAt, benchCommit, id, lockRecord, counted }: MeasureContext): Promise<MeasureResult> {
  const phases: PhaseRecord[] = [];
  const phase = startPhases(phases);

  // 1. Préparation.
  const closePreparation = phase("preparation");
  const worktree = worktreeState((await spawnCommand("git", [...GIT_STATUS_ARGS])).stdout);
  const measureDir = join(ROOT, counted === undefined ? DIAGNOSTIC_DIR_FROM_ROOT : COUNTED_DIR_FROM_ROOT, id);
  const rawDir = join(ROOT, ARTIFACTS_DIR_FROM_ROOT, id);
  await mkdir(dirname(measureDir), { recursive: true });
  // Sans `recursive` : un dossier de mesure existant n'est jamais réécrit.
  await mkdir(measureDir);
  await mkdir(rawDir, { recursive: true });
  const measureSalt = salt ?? randomBytes(32).toString("hex");
  // Marqueur de la mesure : jamais transmis au candidat, écrit dans
  // measure.json à la fin seulement. Le journal d'accès du legacy est écrit
  // dans le dossier des bruts, qui survit aux recréations de la pile.
  const marker = randomBytes(32).toString("hex");
  const accessLogDir = join(rawDir, "access-log");
  await mkdir(accessLogDir);
  // Requêtes témoins de début envoyées, une par recréation de la pile.
  const startWitnesses: string[] = [];
  const files = await candidateFiles(candidateDir);
  const candidateRecord: CandidateRecord = { path: candidate, contentDigest: contentDigest(files) };
  const copyDir = join(rawDir, "candidate");
  await copyCandidate(candidateDir, files, copyDir);
  const runtimeImage = await buildRuntimeImage();
  const user = containerUser(process.getuid?.(), process.getgid?.());
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
  if (notFromCopy !== undefined) closePreparation("stack-failed-before-candidate", {}, notFromCopy);
  else if (shortfall === undefined) closePreparation();
  else closePreparation("runner-error-before-candidate", {}, shortfall);

  // 2. Contrat : candidate.json, package.json et sources du package-lock.json,
  // lus dans la copie (runner/contract-phase.ts). Invalide, il arrête la
  // mesure avant tout code du candidat : ni construction, ni démarrage.
  let contract: ContractPhaseResult | undefined;
  if (notFromCopy === undefined && shortfall === undefined) {
    const closeContract = phase("contract");
    contract = await contractPhase(copyDir);
    Object.assign(candidateRecord, contract.candidate);
    if (contract.outcome === "ok") closeContract();
    else closeContract(contract.outcome, {}, contract.detail);
  }

  let service: CandidateService | undefined;
  let oracle: OracleRecord | undefined;
  let oracleMetadata: ExecuteOracleResult["metadata"] | undefined;
  if (contract?.outcome === "ok") {
    const { build: buildCommand, start } = contract.candidate;
    if (start === undefined) throw new Error("A valid contract declares start");

    // 3. Construction : `npm ci` puis `build`, sans mb-internal ni variable du
    // banc, sous le délai global et les limites (runner/build.ts).
    const closeBuild = phase("build");
    const build = await buildCandidate({ measureId: id, image: RUNTIME_IMAGE, user, rawDir, copyDir, build: buildCommand, limits });
    if (build.outcome.outcome === "ok") closeBuild("ok", build.raw);
    else closeBuild(build.outcome.outcome, build.raw, build.outcome.detail);

    // 4 et 5. Pile et démarrage, puis oracle. L'exécution complète de l'étape 2
    // recrée le legacy et le service d'archivage, puis rappelle le runner, qui
    // recrée le service `candidate` et attend sa disponibilité.
    const described = await candidateService({ rawDir, copyDir, user, start, limits });
    service = described;

    if (build.outcome.outcome === "ok") {
      const closeStart = phase("start");
      let closeOracle: ClosePhase<"oracle"> | undefined;
      let startOutcome: PhaseOutcome<"start"> = "ok";
      try {
        const result = await executeOracle({
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
            await startCandidate(described);
            startOutcome = await waitUntilReady(described, limits.readyTimeoutMs);
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
        // Pile recréée sur des images d'une autre copie du dépôt (#102) :
        // avant tout code du candidat, un incident du banc.
        if (error instanceof StackNotFromCopy) {
          closeStart("stack-failed-before-candidate", {}, error.message);
        } else if (error instanceof CandidateNotStarted) {
          closeStart(startOutcome, {}, error.detail);
        } else {
          await stopCandidate(described);
          throw error;
        }
      }
    }
  }

  // Oracle non lancé : le compte des scénarios, tous non atteints.
  oracle ??= { executed: false, summary: await listOracle(`${ARTIFACTS_DIR_FROM_ROOT}/${id}/oracle`) };

  // 7. Clôture : arrêt du candidat, measure.json écrit. Après un garde-fou ou
  // un contrat invalide, aucun service `candidate` n'a été décrit : rien à
  // arrêter.
  // Puis requête témoin de fin et contrôle du journal d'accès, si la pile a
  // été recréée.
  const closeClosing = phase("closing");
  if (service !== undefined) await stopCandidate(service);
  let accessLog: AccessLogRecord | undefined;
  if (startWitnesses.length === 0) closeClosing();
  else {
    const closed = await closeAccessLog({ accessLogDir, marker, rawDir, startWitnesses, seamAMarkers: readSeamAMarkers() });
    accessLog = closed.accessLog;
    closeClosing(closed.outcome, closed.raw, closed.detail);
  }
  const startPhase = phases.find(({ name }) => name === "start");
  if (startPhase !== undefined && service !== undefined) startPhase.raw["start.log"] = await digestOf(service.startLog);

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

function startPhases(phases: PhaseRecord[]) {
  return <N extends PhaseName>(name: N): ClosePhase<N> => {
    const startedAt = new Date();
    return (outcome = "ok", raw = {}, detail) => {
      phases.push({
        name,
        outcome,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        raw,
        ...(detail === undefined ? {} : { detail }),
      } as PhaseRecord);
    };
  };
}
