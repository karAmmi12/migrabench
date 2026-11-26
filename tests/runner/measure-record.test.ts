// Contenu de measure.json (spec de l'étape 3, « Contenu de measure.json »),
// dans la mesure de ce que produit le fil traceur (#62).
import { describe, expect, it } from "vitest";
import { type MeasureRecordInput, measureRecord } from "../../runner/measure-record.ts";
import type { PhaseRecord } from "../../runner/verdict.ts";
import { errored, judged } from "../../gates/result.ts";

function phase(name: PhaseRecord["name"], outcome = "ok", raw: Record<string, string> = {}, detail?: string): PhaseRecord {
  return { name, outcome, startedAt: "2026-11-23T09:05:07.123Z", durationMs: 10, raw, ...(detail === undefined ? {} : { detail }) } as PhaseRecord;
}

const SUMMARY = {
  scenarios: 38,
  passed: 38,
  failed: 0,
  unreached: 0,
  passRate: 1,
  reachedPassRate: 1,
  keyboard: { passed: 4, total: 4 },
};

// Oracle non lancé : les scénarios de la liste, tous non atteints.
const NOT_RUN = {
  executed: false,
  summary: { scenarios: 38, passed: 0, failed: 0, unreached: 38, passRate: 0, reachedPassRate: null, keyboard: { passed: 0, total: 4 } },
} as const;

const COMPLETED: MeasureRecordInput = {
  measureId: "20261123T090507Z-454fb76-reference-candidate",
  candidate: {
    path: "fixtures/reference-candidate",
    contentDigest: "sha256:aa",
    contract: 1,
    start: "node server.js",
  },
  environment: { benchCommit: "454fb76", runtimeImage: "sha256:bb", composeOverride: "sha256:cc", port: 8100 },
  salt: "5a17",
  saltImposed: false,
  marker: "a1".repeat(32),
  phases: [
    phase("preparation"),
    phase("contract"),
    phase("build", "ok", { "npm-ci.log": "sha256:dd" }),
    phase("start", "ok", { "start.log": "sha256:ee" }),
    phase("oracle"),
    phase("gates"),
    phase("closing"),
  ],
  oracle: { executed: true, result: "sha256:ff", summary: SUMMARY },
};

const MARKER = COMPLETED.marker;
const ACCESS_LOG = { log: "sha256:ab", lines: 57, witnesses: [{ name: "start-1", line: 3 }, { name: "end", line: 57 }] };

describe("measureRecord", () => {
  it("records the marker of the measure and its access log: digest, line count, witness positions", () => {
    const { record } = measureRecord({ ...COMPLETED, marker: MARKER, accessLog: ACCESS_LOG });

    expect(record).toMatchObject({ marker: MARKER, accessLog: ACCESS_LOG });
  });

  it("records no access log when the stack was never recreated", () => {
    const { record } = measureRecord({ ...COMPLETED, marker: MARKER });

    expect(record.marker).toBe(MARKER);
    expect(record).not.toHaveProperty("accessLog");
  });

  it("records a measure planned to count with counted: true and the origin/main commit used", () => {
    const { record } = measureRecord({ ...COMPLETED, counted: { originMain: "802178c0e1b2c3d4e5f60718293a4b5c6d7e8f90" } });

    expect(record).toMatchObject({ counted: true, originMain: "802178c0e1b2c3d4e5f60718293a4b5c6d7e8f90" });
  });

  it("records no originMain for a diagnostic measure", () => {
    expect(measureRecord(COMPLETED).record).not.toHaveProperty("originMain");
  });

  it("records a diagnostic measure, with its format, identifier, candidate, environment and salt", () => {
    const { record } = measureRecord(COMPLETED);

    expect(record).toMatchObject({
      format: 1,
      measureId: "20261123T090507Z-454fb76-reference-candidate",
      counted: false,
      candidate: COMPLETED.candidate,
      environment: COMPLETED.environment,
      salt: "5a17",
      saltImposed: false,
    });
  });

  it("records the oracle result by digest with a copy of its summary, and no gate when none ran", () => {
    const { record } = measureRecord(COMPLETED);

    expect(record.oracle).toEqual({ executed: true, result: "sha256:ff", summary: SUMMARY });
    expect(record.gates).toEqual([]);
  });

  // ADR 0008 : un échec, un résultat non évaluable ou une erreur pendant
  // l'examen est un résultat du candidat, jamais une issue de la mesure.
  it("records the gate results in order, without changing the verdict of the measure", () => {
    const gates = [
      judged({ gate: "relay", name: "legacy-port-untouched", examined: 211, passed: false, findings: [{ line: 3 }] }),
      judged({ gate: "test", name: "nothing", examined: 0, passed: true }),
      errored({ gate: "test", name: "crashed", kind: "judged", error: { stage: "on-candidate", cause: "timeout", message: "Gate test exceeded its timeout of 20 ms" } }),
    ];
    const { record, exitCode } = measureRecord({ ...COMPLETED, gates });

    expect(record.gates).toEqual(gates);
    expect(record.verdict).toEqual({ category: "completed", reason: "ok" });
    expect(exitCode).toBe(0);
  });

  it("records every phase in order, with its outcome, start, duration and raw digests", () => {
    const { record } = measureRecord(COMPLETED);

    expect(record.phases.map(({ name }) => name)).toEqual(["preparation", "contract", "build", "start", "oracle", "gates", "closing"]);
    expect(record.phases[2]).toEqual({
      name: "build",
      outcome: "ok",
      startedAt: "2026-11-23T09:05:07.123Z",
      durationMs: 10,
      raw: { "npm-ci.log": "sha256:dd" },
    });
  });

  it("is completed when every phase is ok", () => {
    expect(measureRecord(COMPLETED)).toMatchObject({ record: { verdict: { category: "completed", reason: "ok" } }, exitCode: 0 });
  });

  it("records the phases after the first failing one as not-run", () => {
    const { record } = measureRecord({
      ...COMPLETED,
      phases: [phase("preparation"), phase("contract"), phase("build", "build-failed")],
      oracle: NOT_RUN,
    });

    expect(record.phases.map(({ name, outcome }) => [name, outcome])).toEqual([
      ["preparation", "ok"],
      ["contract", "ok"],
      ["build", "build-failed"],
      ["start", "not-run"],
      ["oracle", "not-run"],
      ["gates", "not-run"],
      ["closing", "not-run"],
    ]);
    expect(record.oracle).toEqual(NOT_RUN);
  });

  it("counts a failed start against the candidate", () => {
    const { record } = measureRecord({
      ...COMPLETED,
      phases: [phase("preparation"), phase("contract"), phase("build"), phase("start", "start-exited"), phase("closing")],
      oracle: NOT_RUN,
    });

    expect(record.verdict).toEqual({ category: "candidate-failure", reason: "start-exited" });
    expect(record.phases.find(({ name }) => name === "closing")?.outcome).toBe("ok");
  });

  it("records an invalid measure with its reason and evidence, exit code 3", () => {
    const { record, exitCode } = measureRecord({
      ...COMPLETED,
      phases: [phase("preparation", "runner-error-before-candidate", {}, "Error: EACCES")],
      oracle: NOT_RUN,
    });

    expect(record.verdict).toEqual({ category: "invalid", reason: "runner-error-before-candidate", evidence: "Error: EACCES" });
    expect(exitCode).toBe(3);
  });
});
