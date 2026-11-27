// Format d'un résultat de porte (ADR 0008, spec de l'étape 4, « Format d'un
// résultat ») : deux sortes, cinq issues, `examined` toujours présent,
// `findings` borné.
import { describe, expect, it } from "vitest";
import { beforeCandidateEvidence, benchBrowserEvidence, errored, FINDINGS_LIMIT, gateResultPassed, judged, measured } from "../../gates/result.ts";

describe("judged result", () => {
  it("is passed when the gate examined something and judged it passed", () => {
    expect(judged({ gate: "relay", name: "legacy-port-untouched", examined: 412, passed: true, findings: [], raw: { "access.log": "sha256:abc" } })).toEqual({
      gate: "relay",
      name: "legacy-port-untouched",
      kind: "judged",
      outcome: "passed",
      examined: 412,
      findings: [],
      findingsTotal: 0,
      findingsKept: 0,
      values: {},
      raw: { "access.log": "sha256:abc" },
    });
  });

  it("is failed when the gate examined something and judged it failed", () => {
    const result = judged({ gate: "relay", name: "legacy-port-untouched", examined: 3, passed: false, findings: [{ line: 2 }] });
    expect(result).toMatchObject({ kind: "judged", outcome: "failed", findings: [{ line: 2 }], findingsTotal: 1, findingsKept: 1 });
  });

  // Une porte qui a examiné des éléments sans pouvoir conclure (#153) : la
  // valeur témoin dont un corps de réponse manque au HAR.
  it("is not-evaluable when the gate examined something but could not conclude", () => {
    expect(judged({ gate: "test", name: "unread", examined: 5, passed: true, evaluable: false, findings: [{ body: "absent" }] })).toMatchObject({
      outcome: "not-evaluable",
      examined: 5,
      findingsTotal: 1,
    });
  });

  it("stays failed when the gate could not conclude everywhere but judged it failed", () => {
    expect(judged({ gate: "test", name: "leak", examined: 5, passed: false, evaluable: false })).toMatchObject({ outcome: "failed" });
  });

  // Une porte de test qui n'examine aucun élément : jamais une réussite.
  it("is not-evaluable when the gate examined 0 element, even judged passed", () => {
    expect(judged({ gate: "test", name: "nothing", examined: 0, passed: true, findings: [] })).toMatchObject({ outcome: "not-evaluable", examined: 0 });
  });
});

describe("measured result", () => {
  it("is measured, with its values, when the gate examined something", () => {
    expect(measured({ gate: "test", name: "weight", examined: 4, values: { bytes: 1200 } })).toEqual({
      gate: "test",
      name: "weight",
      kind: "measured",
      outcome: "measured",
      examined: 4,
      findings: [],
      findingsTotal: 0,
      findingsKept: 0,
      values: { bytes: 1200 },
      raw: {},
    });
  });

  it("is not-evaluable when the gate examined 0 element", () => {
    expect(measured({ gate: "test", name: "weight", examined: 0, values: {} })).toMatchObject({ kind: "measured", outcome: "not-evaluable" });
  });
});

describe("findings", () => {
  it(`keeps the first ${FINDINGS_LIMIT} findings and says how many there were`, () => {
    const findings = Array.from({ length: FINDINGS_LIMIT + 7 }, (_, line) => ({ line }));
    const result = judged({ gate: "relay", name: "legacy-port-untouched", examined: 500, passed: false, findings });
    expect(result.findings).toHaveLength(FINDINGS_LIMIT);
    expect(result.findings[0]).toEqual({ line: 0 });
    expect(result.findings.at(-1)).toEqual({ line: FINDINGS_LIMIT - 1 });
    expect(result).toMatchObject({ findingsTotal: FINDINGS_LIMIT + 7, findingsKept: FINDINGS_LIMIT });
  });

  it("keeps every finding up to the limit", () => {
    const findings = Array.from({ length: FINDINGS_LIMIT }, (_, line) => ({ line }));
    expect(judged({ gate: "relay", name: "legacy-port-untouched", examined: 500, passed: false, findings })).toMatchObject({ findingsTotal: FINDINGS_LIMIT, findingsKept: FINDINGS_LIMIT });
  });
});

describe("gateResultPassed", () => {
  it("is true for passed only", () => {
    const base = { gate: "test", name: "r", findings: [] };
    expect(gateResultPassed(judged({ ...base, examined: 1, passed: true }))).toBe(true);
    expect(gateResultPassed(judged({ ...base, examined: 1, passed: false }))).toBe(false);
    expect(gateResultPassed(judged({ ...base, examined: 0, passed: true }))).toBe(false);
  });

  it("refuses a measured result at compile time", () => {
    const result = measured({ gate: "test", name: "weight", examined: 4, values: {} });
    // @ts-expect-error Un résultat relevé n'est ni une réussite ni un échec (ADR 0008).
    gateResultPassed(result);
  });
});

// Seule une erreur de porte avant le candidat rend la mesure invalide : sa
// preuve est reprise dans le détail de la phase.
describe("beforeCandidateEvidence", () => {
  const error = (stage: "before-candidate" | "on-candidate", message: string) => ({ stage, cause: "exception" as const, message });

  it("cites every result errored before the candidate", () => {
    const results = [
      judged({ gate: "relay", name: "legacy-port-untouched", examined: 3, passed: false }),
      errored({ gate: "audit", name: "audit/high", kind: "judged", error: error("before-candidate", "database digest mismatch") }),
      errored({ gate: "audit", name: "audit/low", kind: "judged", error: error("before-candidate", "database digest mismatch") }),
    ];
    expect(beforeCandidateEvidence(results)).toBe(
      ["Gate audit, result audit/high: errored before-candidate (exception): database digest mismatch", "Gate audit, result audit/low: errored before-candidate (exception): database digest mismatch"].join("\n"),
    );
  });

  it("is undefined when no result errored before the candidate", () => {
    const results = [
      judged({ gate: "relay", name: "legacy-port-untouched", examined: 0, passed: true }),
      errored({ gate: "tsc", name: "tsc", kind: "judged", error: error("on-candidate", "out of memory") }),
    ];
    expect(beforeCandidateEvidence(results)).toBeUndefined();
  });
});

// Navigateur du banc injoignable (#168) : à toute étape, la mesure est
// invalide ; chaque résultat concerné est cité.
describe("benchBrowserEvidence", () => {
  it("cites every result errored because the bench browser was unreachable, at any stage", () => {
    const results = [
      errored({ gate: "xss", name: "xss/executed", kind: "judged", error: { stage: "before-candidate", cause: "bench-browser-unreachable", message: "403" } }),
      errored({ gate: "role-check", name: "role-replay", kind: "judged", error: { stage: "on-candidate", cause: "bench-browser-unreachable", message: "ECONNREFUSED" } }),
      errored({ gate: "tsc", name: "tsc", kind: "judged", error: { stage: "on-candidate", cause: "exception", message: "out of memory" } }),
    ];
    expect(benchBrowserEvidence(results)).toBe(
      ["Gate xss, result xss/executed: bench browser unreachable before-candidate: 403", "Gate role-check, result role-replay: bench browser unreachable on-candidate: ECONNREFUSED"].join("\n"),
    );
  });

  it("is undefined when the bench browser was reached", () => {
    expect(benchBrowserEvidence([errored({ gate: "tsc", name: "tsc", kind: "judged", error: { stage: "before-candidate", cause: "exception", message: "x" } })])).toBeUndefined();
  });
});
