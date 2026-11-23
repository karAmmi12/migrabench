// Runner de mesure (spec de l'étape 3, « Modules ») : un seul point d'entrée,
// measureCandidate, sur lequel `migrabench measure` est une commande mince.
// Il enchaîne les phases d'une mesure, écrit le dossier de la mesure
// (measure.json, oracle.json) et rend l'issue.
//
// Fil traceur (#62) : mesure de diagnostic seulement, sans verrou du banc ni
// journal d'accès. Les tickets suivants de l'étape les ajoutent. La
// construction, ses délais et ses limites viennent de #65 (runner/build.ts).
// Le contrat vient de #64 (runner/contract-phase.ts).
// Le verdict et les codes de sortie viennent de #63 (runner/verdict.ts).
// Les délais et limites du dernier étalonnage de CI viennent de #72
// (runner/calibration-results.ts).
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { executeOracle, type ExecuteOracleResult, listOracle } from "../oracle/execute.ts";
import { GIT_STATUS_ARGS, worktreeState } from "../oracle/worktree.ts";
import { contentDigest } from "./candidate-content.ts";
import { contractPhase } from "./contract-phase.ts";
import { candidateName, measureId as measureIdOf } from "./measure-id.ts";
import { type CandidateRecord, measureRecord, type OracleRecord } from "./measure-record.ts";
import type { ExitCode, PhaseName, PhaseOutcome, PhaseRecord, Verdict } from "./verdict.ts";
import { citedFileSha256 as digestOf } from "../shared/digest.ts";
import { spawnCommand, stdoutOf } from "../shared/process.ts";
import { ARTIFACTS_DIR_FROM_ROOT, ROOT } from "../shared/root.ts";
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
import { type Limits, measureLimits, SAFETY_CAP } from "./limits.ts";
import { DIAGNOSTIC_DIR_FROM_ROOT } from "./paths.ts";

export interface MeasureOptions {
  // Dossier du candidat, relatif à la racine du dépôt.
  candidate: string;
  // Prévue pour compter : pas encore prise en charge (#73).
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
  | { written: false; refusal: "refused-usage" | "refused-counted"; message: string; exitCode: 4 };

export async function measureCandidate({ candidate, counted = false, salt, timeoutCapMs }: MeasureOptions): Promise<MeasureResult> {
  // 0. Refus préalables, avant toute écriture.
  const refused = (message: string, refusal: "refused-usage" | "refused-counted" = "refused-usage"): MeasureResult => ({
    written: false,
    refusal,
    message,
    exitCode: 4,
  });
  // Une valeur imposée n'est permise qu'en diagnostic. Les autres conditions
  // de `--counted` viennent avec #73.
  if (counted && timeoutCapMs !== undefined) {
    return refused("a measure planned to count refuses an imposed --timeout-cap-ms", "refused-counted");
  }
  if (counted) throw new Error("A counted measure is not supported yet: run a diagnostic measure");
  // Délais et limites du dernier étalonnage de CI ; sans lui, le plafond de
  // sécurité, marqué provisoire.
  let limits: Limits;
  let limitsRecord: ReturnType<typeof measureLimits>["record"];
  try {
    ({ limits, record: limitsRecord } = measureLimits({ safetyCap: SAFETY_CAP, calibration: await appliedCalibration(), timeoutCapMs }));
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
  await copyCandidate(candidateDir, files, copyDir);
  const runtimeImage = await buildRuntimeImage();
  const user = containerUser(process.getuid?.(), process.getgid?.());
  closePreparation();

  // 2. Contrat : candidate.json, package.json et sources du package-lock.json,
  // lus dans la copie (runner/contract-phase.ts). Invalide, il arrête la
  // mesure avant tout code du candidat : ni construction, ni démarrage.
  const closeContract = phase("contract");
  const contract = await contractPhase(copyDir);
  Object.assign(candidateRecord, contract.candidate);
  if (contract.outcome === "ok") closeContract();
  else closeContract(contract.outcome, {}, contract.detail);

  let service: CandidateService | undefined;
  let oracle: OracleRecord | undefined;
  let oracleMetadata: ExecuteOracleResult["metadata"] | undefined;
  if (contract.outcome === "ok") {
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
    const described = await candidateService({ rawDir, copyDir, user, start });
    service = described;

    if (build.outcome.outcome === "ok") {
      const closeStart = phase("start");
      let closeOracle: ClosePhase<"oracle"> | undefined;
      let startOutcome: PhaseOutcome<"start"> = "ok";
      try {
        const result = await executeOracle({
          baseUrl: CANDIDATE_BASE_URL,
          salt: measureSalt,
          artifactsDir: `${ARTIFACTS_DIR_FROM_ROOT}/${id}/oracle`,
          resultFile: join(measureDir, "oracle.json"),
          onStackReady: async () => {
            await stopCandidate(described);
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
        if (!(error instanceof CandidateNotStarted)) {
          await stopCandidate(described);
          throw error;
        }
        closeStart(startOutcome);
      }
    }
  }

  // Oracle non lancé : le compte des scénarios, tous non atteints.
  oracle ??= { executed: false, summary: await listOracle(`${ARTIFACTS_DIR_FROM_ROOT}/${id}/oracle`) };

  // 7. Clôture : arrêt du candidat, measure.json écrit. Après un contrat
  // invalide, aucun service `candidate` n'a été décrit : rien à arrêter.
  const closeClosing = phase("closing");
  if (service !== undefined) await stopCandidate(service);
  closeClosing();
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
