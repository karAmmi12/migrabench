// Issues attendues des mesures du job de CI des mesures (#74) : le contrôle
// compare le code de sortie, measure.json et la présence d'oracle.json au
// tableau de la spec de l'étape 3 (« Candidats défectueux »), et, pour la
// mesure comptée du candidat de référence, au critère de fin (« Notes »).
import { describe, expect, it } from "vitest";
import { MEASURE_CASES, type Observed, caseProblems } from "../scripts/measure-cases.ts";
import { MEASURES, readJsonFixture, readMeasure } from "./real-fixtures.ts";

// Copie de la première mesure comptée du candidat de référence, produite par
// le job des mesures sur main (exécution 45624689673, commit 52303ae) : son
// measure.json et son oracle.json, tels qu'écrits par le banc.
const referenceMeasure = readMeasure(MEASURES.reference);
const referenceOracle = readJsonFixture<object>(`${MEASURES.reference.results}/oracle.json`);

describe("caseProblems, on a real counted measure", () => {
  // L'exécution 45624689673 a rejeté cette mesure : le contrôle cherchait
  // originMain sous environment, alors que le banc l'écrit à la racine.
  it("has nothing to report for the first counted measure of the reference candidate", () => {
    expect(caseProblems(MEASURE_CASES["reference-counted"], { exitCode: 0, record: referenceMeasure, oracle: referenceOracle })).toEqual([]);
  });

  it("names a counted measure without originMain", () => {
    const { originMain: _originMain, ...record } = referenceMeasure;

    expect(caseProblems(MEASURE_CASES["reference-counted"], { exitCode: 0, record, oracle: referenceOracle })).toEqual(["originMain is missing"]);
  });
});

// Variantes de la vraie mesure : chacune part de la copie et ne change que ce
// que son test regarde. Phases : celles de la mesure, issue et détail changés.
type RecordedPhase = { name: string; outcome: string; detail?: string };
const REFERENCE_PHASES = referenceMeasure.phases as RecordedPhase[];

function phases(outcomes: Record<string, string> = {}, details: Record<string, string> = {}) {
  return REFERENCE_PHASES.map((phase) => ({ ...phase, outcome: outcomes[phase.name] ?? phase.outcome, ...(details[phase.name] === undefined ? {} : { detail: details[phase.name] }) }));
}

function summary(passed: number, failed: number, unreached: number) {
  return { ...(referenceMeasure.oracle as { summary: object }).summary, scenarios: passed + failed + unreached, passed, failed, unreached };
}

// La mesure de diagnostic correspondante : même mesure, pas prévue pour compter.
const COMPLETE: Record<string, unknown> = { ...referenceMeasure, counted: false, environment: { ...(referenceMeasure.environment as object), worktree: "dirty" } };

// oracle.json de la mesure, son sel (config.metadata.saltImposed) remplacé.
function oracleJson(saltImposed: unknown) {
  const oracle = structuredClone(referenceOracle) as { config: { metadata: Record<string, unknown> } };
  oracle.config.metadata.saltImposed = saltImposed;
  return oracle;
}

function observed(record: object, more: Partial<Observed> = {}): Observed {
  return { exitCode: 0, record, oracle: oracleJson(false), ...more };
}

describe("caseProblems, reference candidate", () => {
  it("has nothing to report for a complete measure with 38 passed scenarios and both witnesses", () => {
    expect(caseProblems(MEASURE_CASES.reference, observed(COMPLETE))).toEqual([]);
  });

  it("names a failed and an unreached scenario", () => {
    const record = { ...COMPLETE, oracle: { executed: true, summary: summary(36, 1, 1) } };

    expect(caseProblems(MEASURE_CASES.reference, observed(record))).toEqual(["oracle.summary.passed is 36, expected 38", "oracle.summary.failed is 1, expected 0", "oracle.summary.unreached is 1, expected 0"]);
  });

  it("names a missing end witness of the access log", () => {
    const record = { ...COMPLETE, accessLog: { witnesses: [{ name: "start-1", line: 2 }] } };

    expect(caseProblems(MEASURE_CASES.reference, observed(record))).toEqual(["accessLog.witnesses has no end witness"]);
  });

  // Avant 71d8c18 (#73), oracle.json disait saltImposed: true même sans
  // ORACLE_SALT, alors que measure.json disait false : les deux fichiers sont lus.
  it("names an imposed salt in oracle.json even when measure.json says it was drawn", () => {
    expect(caseProblems(MEASURE_CASES.reference, observed(COMPLETE, { oracle: oracleJson(true) }))).toEqual(["oracle.json: config.metadata.saltImposed is true, expected false"]);
  });

  it("names an oracle.json without saltImposed in its metadata", () => {
    expect(caseProblems(MEASURE_CASES.reference, observed(COMPLETE, { oracle: { saltImposed: false } }))).toEqual(["oracle.json: config.metadata.saltImposed is undefined, expected false"]);
  });

  it("names a measure without oracle.json", () => {
    expect(caseProblems(MEASURE_CASES.reference, observed(COMPLETE, { oracle: undefined }))).toEqual(["oracle.json is missing"]);
  });

  it("names an unexpected exit code", () => {
    expect(caseProblems(MEASURE_CASES.reference, observed(COMPLETE, { exitCode: 3 }))).toEqual(["exit code is 3, expected 0"]);
  });
});

describe("caseProblems, counted measure of the reference candidate", () => {
  it("names a diagnostic measure, a modified worktree, an unknown origin/main and an imposed salt", () => {
    const { originMain: _originMain, ...diagnostic } = COMPLETE;
    const record = { ...diagnostic, saltImposed: true };

    expect(caseProblems(MEASURE_CASES["reference-counted"], observed(record))).toEqual([
      "measure.json: saltImposed is true, expected false",
      "counted is false, expected true",
      "environment.worktree is dirty, expected clean",
      "originMain is missing",
    ]);
  });
});

describe("caseProblems, defective candidates", () => {
  it("expects both failures of the invalid contract in its detail", () => {
    const record = {
      ...COMPLETE,
      phases: phases({ contract: "contract-invalid", build: "not-run", start: "not-run", oracle: "not-run", gates: "not-run" }, { contract: 'candidate.json: field "url" is not allowed: the bench imposes the port' }),
      oracle: { executed: false },
      verdict: { category: "contract-failure", reason: "contract-invalid" },
    };

    expect(caseProblems(MEASURE_CASES["contract-invalid"], observed(record, { oracle: undefined }))).toEqual(["phase contract: detail does not cite \"is resolved on another host\""]);
  });

  it("names a wrong category and reason", () => {
    const record = { ...COMPLETE, verdict: { category: "completed", reason: "ok" } };

    expect(caseProblems(MEASURE_CASES["build-fails"], observed(record))).toEqual([
      "verdict is completed (ok), expected candidate-failure (build-failed)",
      "phase build is ok, expected build-failed",
      "phase start is ok, expected not-run",
      "oracle.json is present, expected absent",
    ]);
  });

  it("expects the never-ready candidate to stop before the oracle", () => {
    const record = { ...COMPLETE, phases: phases({ start: "start-not-ready", oracle: "ok" }), oracle: { executed: true }, verdict: { category: "candidate-failure", reason: "start-not-ready" } };

    expect(caseProblems(MEASURE_CASES["never-ready"], observed(record, { oracle: undefined }))).toEqual(["phase oracle is ok, expected not-run", "oracle.executed is true, expected false"]);
  });

  it("expects at least one failed scenario through the relay that alters a label", () => {
    expect(caseProblems(MEASURE_CASES["relay-alters-label"], observed(COMPLETE))).toEqual(["oracle.summary.failed is 0, expected at least 1"]);
  });

  it("expects the broken stack to give an invalid measure, exit code 3", () => {
    const record = { ...COMPLETE, phases: phases({ start: "stack-failed-before-candidate", oracle: "not-run", gates: "not-run" }), oracle: { executed: false }, verdict: { category: "invalid", reason: "stack-failed-before-candidate", evidence: "legacy: unhealthy" } };

    expect(caseProblems(MEASURE_CASES["broken-stack"], observed(record, { exitCode: 3, oracle: undefined }))).toEqual([]);
  });

  it("expects a stack from another copy to be refused before any build", () => {
    const record = {
      ...COMPLETE,
      phases: phases({ preparation: "stack-not-from-this-copy", contract: "not-run", build: "ok", start: "not-run", oracle: "not-run", gates: "not-run" }),
      oracle: { executed: false },
      verdict: { category: "invalid", reason: "stack-not-from-this-copy", evidence: "foreign" },
    };

    expect(caseProblems(MEASURE_CASES["foreign-stack"], observed(record, { exitCode: 3, oracle: undefined }))).toEqual(["phase build is ok, expected not-run"]);
  });
});

describe("caseProblems, failures of #68 and interruption", () => {
  it("keeps oracle.json of a measure whose legacy went down during the oracle", () => {
    const record = { ...COMPLETE, phases: phases({ oracle: "stack-down-while-candidate" }), oracle: { executed: true, summary: summary(2, 2, 34) }, verdict: { category: "stack-down-while-candidate", reason: "stack-down-while-candidate" } };

    expect(caseProblems(MEASURE_CASES["legacy-stopped-during-oracle"], observed(record, { oracle: undefined }))).toEqual(["oracle.json is missing"]);
  });

  it("expects an interrupted measure with its exact verdict, the oracle not executed and no oracle.json", () => {
    const record = {
      ...COMPLETE,
      phases: phases({ oracle: "interrupted", gates: "not-run" }),
      oracle: { executed: false },
      verdict: { category: "invalid", reason: "interrupted", evidence: "Interrupted by SIGINT" },
    };

    expect(caseProblems(MEASURE_CASES.interrupted, observed(record, { exitCode: 3, oracle: undefined }))).toEqual([]);
  });

  it("names an interrupted measure that kept oracle.json, with another evidence", () => {
    const record = {
      ...COMPLETE,
      phases: phases({ oracle: "interrupted", gates: "not-run" }),
      oracle: { executed: false },
      verdict: { category: "invalid", reason: "interrupted", evidence: "Interrupted by SIGTERM" },
    };

    expect(caseProblems(MEASURE_CASES.interrupted, observed(record, { exitCode: 3 }))).toEqual(["verdict.evidence is \"Interrupted by SIGTERM\", expected \"Interrupted by SIGINT\"", "oracle.json is present, expected absent"]);
  });
});
