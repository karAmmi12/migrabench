// Contenu de measure.json (spec de l'étape 3, « Contenu de measure.json ») :
// fonction pure qui assemble le résultat d'une mesure à partir de ce que le
// runner a relevé, avec son verdict et le code de sortie qui en découle.
import type { OracleSummary } from "../oracle/collect.ts";
import { PHASES, type PhaseRecord, verdict } from "./verdict.ts";

export const MEASURE_FORMAT = 1;

export interface CandidateRecord {
  path: string;
  contentDigest: string;
  contract?: number;
  build?: string;
  start?: string;
}

// Oracle non lancé : le compte des scénarios, tous non atteints (`oracle.executed: false`).
export type OracleRecord = { executed: true; result: string; summary: OracleSummary } | { executed: false; summary: OracleSummary };

export interface MeasureRecordInput {
  measureId: string;
  candidate: CandidateRecord;
  environment: Record<string, unknown>;
  salt: string;
  saltImposed: boolean;
  // Phases relevées ; celles qui manquent sont enregistrées `not-run`.
  phases: readonly PhaseRecord[];
  oracle: OracleRecord;
  // Mesure prévue pour compter (#73) : le commit de origin/main utilisé pour
  // vérifier ses préconditions. Absent : mesure de diagnostic.
  counted?: { originMain: string };
}

export function measureRecord({ measureId, candidate, environment, salt, saltImposed, phases, oracle, counted }: MeasureRecordInput) {
  const recorded = PHASES.map(
    (name): PhaseRecord =>
      phases.find((entry) => entry.name === name) ?? { name, outcome: "not-run", startedAt: "", durationMs: 0, raw: {} },
  );
  const { verdict: measureVerdict, exitCode } = verdict(recorded);
  const record = {
    format: MEASURE_FORMAT,
    measureId,
    counted: counted !== undefined,
    ...(counted === undefined ? {} : { originMain: counted.originMain }),
    candidate,
    environment,
    salt,
    saltImposed,
    phases: recorded,
    oracle,
    gates: [] as never[],
    verdict: measureVerdict,
  };
  return { record, exitCode };
}
