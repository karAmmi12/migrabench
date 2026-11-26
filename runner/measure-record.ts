// Contenu de measure.json (spec de l'étape 3, « Contenu de measure.json ») :
// fonction pure qui assemble le résultat d'une mesure à partir de ce que le
// runner a relevé, avec son verdict et le code de sortie qui en découle.
import type { GateResult } from "../gates/result.ts";
import type { OracleSummary } from "../oracle/collect.ts";
import type { WitnessPosition } from "./access-log.ts";
import type { CountedRecord } from "./counted.ts";
import { PHASES, type PhaseRecord, verdict } from "./verdict.ts";

export const MEASURE_FORMAT = 1;

export interface CandidateRecord {
  path: string;
  contentDigest: string;
  contract?: number;
  build?: string;
  start?: string;
}

// Journal d'accès de la mesure, contrôlé à la clôture (runner/access-log.ts).
export interface AccessLogRecord {
  // Empreinte du journal brut.
  log: string;
  lines: number;
  witnesses: WitnessPosition[];
}

// Oracle non lancé : le compte des scénarios, tous non atteints (`oracle.executed: false`).
// Sans compte si Playwright n'a pu ni exécuter ni lister les scénarios (#68).
export type OracleRecord = { executed: true; result: string; summary: OracleSummary } | { executed: false; summary?: OracleSummary };

export interface MeasureRecordInput {
  measureId: string;
  candidate: CandidateRecord;
  environment: Record<string, unknown>;
  salt: string;
  saltImposed: boolean;
  // Marqueur de la mesure, écrit à la fin seulement : measure.json n'est écrit
  // qu'une fois, à la clôture.
  marker: string;
  // Absent si la pile n'a jamais été recréée (mesure arrêtée avant le démarrage).
  accessLog?: AccessLogRecord;
  // Phases relevées ; celles qui manquent sont enregistrées `not-run`.
  phases: readonly PhaseRecord[];
  oracle: OracleRecord;
  // Mesure prévue pour compter (#73) : le commit de origin/main utilisé pour
  // vérifier ses préconditions. Absent : mesure de diagnostic.
  counted?: CountedRecord;
  // Résultats des portes, dans l'ordre du registre (ADR 0008). Ils ne
  // changent pas le verdict : seule une erreur de porte avant le candidat le
  // fait, par l'issue de sa phase.
  gates?: readonly GateResult[];
}

export function measureRecord({ measureId, candidate, environment, salt, saltImposed, marker, accessLog, phases, oracle, counted, gates = [] }: MeasureRecordInput) {
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
    marker,
    phases: recorded,
    oracle,
    ...(accessLog === undefined ? {} : { accessLog }),
    gates,
    verdict: measureVerdict,
  };
  return { record, exitCode };
}
