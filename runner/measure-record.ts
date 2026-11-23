// Contenu de measure.json (spec de l'étape 3, « Contenu de measure.json ») :
// fonction pure qui assemble le résultat d'une mesure à partir de ce que le
// runner a relevé. Le fil traceur (#62) n'écrit que des mesures de diagnostic,
// sans portes ; le verdict complet et ses codes de sortie viennent avec #63.
import type { OracleSummary } from "../oracle/collect.ts";

export const MEASURE_FORMAT = 1;

export const PHASES = ["preparation", "contract", "build", "start", "oracle", "gates", "closing"] as const;
export type PhaseName = (typeof PHASES)[number];

export interface PhaseRecord {
  name: PhaseName;
  // `ok`, ou l'issue nommée qui a arrêté la mesure ; `not-run` si la phase n'a pas tourné.
  outcome: string;
  startedAt: string;
  durationMs: number;
  detail?: string;
  // Empreinte de chaque brut de la phase, par son chemin dans le dossier des bruts.
  raw: Record<string, string>;
}

export interface CandidateRecord {
  path: string;
  contentDigest: string;
  contract?: number;
  build?: string;
  start?: string;
}

export type OracleRecord = { executed: true; result: string; summary: OracleSummary } | { executed: false };

export interface MeasureOutcome {
  category: "completed" | "candidate-failure";
  reason: string;
}

export interface MeasureRecordInput {
  measureId: string;
  candidate: CandidateRecord;
  environment: Record<string, unknown>;
  salt: string;
  saltImposed: boolean;
  // Phases relevées ; celles qui manquent sont enregistrées `not-run`.
  phases: readonly PhaseRecord[];
  oracle: OracleRecord;
}

// Issues que le fil traceur sait produire, comptées contre le candidat.
const CANDIDATE_FAILURES = new Set(["build-failed", "start-exited", "start-not-ready"]);

export function measureRecord({ measureId, candidate, environment, salt, saltImposed, phases, oracle }: MeasureRecordInput) {
  const recorded = PHASES.map(
    (name): PhaseRecord =>
      phases.find((entry) => entry.name === name) ?? { name, outcome: "not-run", startedAt: "", durationMs: 0, raw: {} },
  );
  return {
    format: MEASURE_FORMAT,
    measureId,
    counted: false,
    candidate,
    environment,
    salt,
    saltImposed,
    phases: recorded,
    oracle,
    gates: [] as never[],
    verdict: verdictOf(recorded),
  };
}

function verdictOf(phases: readonly PhaseRecord[]): MeasureOutcome {
  const failed = phases.find(({ outcome }) => outcome !== "ok" && outcome !== "not-run");
  if (failed === undefined) return { category: "completed", reason: "ok" };
  if (CANDIDATE_FAILURES.has(failed.outcome)) return { category: "candidate-failure", reason: failed.outcome };
  throw new Error(`Outcome ${failed.outcome} of phase ${failed.name} has no verdict yet (#63, #68)`);
}
