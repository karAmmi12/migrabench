// Contenu de measure.json (spec de l'étape 3, « Contenu de measure.json »),
// dans la mesure de ce que produit le fil traceur (#62).
import { describe, expect, it } from "vitest";
import { type MeasureRecordInput, type PhaseRecord, measureRecord } from "../../runner/measure-record.ts";

function phase(name: PhaseRecord["name"], outcome = "ok", raw: Record<string, string> = {}): PhaseRecord {
  return { name, outcome, startedAt: "2026-11-23T09:05:07.123Z", durationMs: 10, raw };
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

describe("measureRecord", () => {
  it("records a diagnostic measure, with its format, identifier, candidate, environment and salt", () => {
    const record = measureRecord(COMPLETED);

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

  it("records the oracle result by digest with a copy of its summary, and no gate yet", () => {
    const record = measureRecord(COMPLETED);

    expect(record.oracle).toEqual({ executed: true, result: "sha256:ff", summary: SUMMARY });
    expect(record.gates).toEqual([]);
  });

  it("records every phase in order, with its outcome, start, duration and raw digests", () => {
    const record = measureRecord(COMPLETED);

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
    expect(measureRecord(COMPLETED).verdict).toEqual({ category: "completed", reason: "ok" });
  });

  it("records the phases after the first failing one as not-run", () => {
    const record = measureRecord({
      ...COMPLETED,
      phases: [phase("preparation"), phase("contract"), phase("build", "build-failed")],
      oracle: { executed: false },
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
    expect(record.oracle).toEqual({ executed: false });
  });

  it("counts a failed start against the candidate", () => {
    const record = measureRecord({
      ...COMPLETED,
      phases: [phase("preparation"), phase("contract"), phase("build"), phase("start", "start-exited"), phase("closing")],
      oracle: { executed: false },
    });

    expect(record.verdict).toEqual({ category: "candidate-failure", reason: "start-exited" });
    expect(record.phases.find(({ name }) => name === "closing")?.outcome).toBe("ok");
  });

  it("refuses an outcome it cannot classify yet", () => {
    expect(() =>
      measureRecord({ ...COMPLETED, phases: [phase("preparation", "runner-error-before-candidate")], oracle: { executed: false } }),
    ).toThrow(/runner-error-before-candidate/);
  });
});
