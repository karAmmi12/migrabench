// Verdict d'une mesure (spec de l'étape 3, « Phases d'une mesure et leurs
// issues », « Codes de sortie ») : seule définition de « invalide ».
import { describe, expect, it } from "vitest";
import { type PhaseRecord, verdict } from "../../runner/verdict.ts";

// Le détail d'une phase qui rend la mesure invalide porte sa preuve.
function phase(name: PhaseRecord["name"], outcome: string = "ok", detail?: string): PhaseRecord {
  return { name, outcome, startedAt: "2026-11-23T09:05:07.123Z", durationMs: 10, raw: {}, ...(detail === undefined ? {} : { detail }) } as PhaseRecord;
}

const ALL_OK = ["preparation", "contract", "build", "start", "oracle", "gates", "closing"].map((name) => phase(name as PhaseRecord["name"]));

// Phases `ok` jusqu'à `name`, qui rend `outcome`, puis la clôture.
function stoppedAt(name: PhaseRecord["name"], outcome: string, evidence?: string): PhaseRecord[] {
  const before = ALL_OK.slice(0, ALL_OK.findIndex((entry) => entry.name === name));
  return name === "closing" ? [...before, phase("closing", outcome, evidence)] : [...before, phase(name, outcome, evidence), phase("closing")];
}

describe("verdict", () => {
  it("is completed, exit code 0, when every phase is ok", () => {
    expect(verdict(ALL_OK)).toEqual({ verdict: { category: "completed", reason: "ok" }, exitCode: 0 });
  });

  // Table « Phases d'une mesure et leurs issues » de la spec.
  it.each([
    ["contract", "contract-invalid", "contract-failure"],
    ["build", "build-failed", "candidate-failure"],
    ["build", "build-timeout", "candidate-failure"],
    ["build", "build-resource-limit", "candidate-failure"],
    ["start", "start-exited", "candidate-failure"],
    ["start", "start-not-ready", "candidate-failure"],
    ["build", "stack-down-while-candidate", "stack-down-while-candidate"],
    ["start", "stack-down-while-candidate", "stack-down-while-candidate"],
    ["oracle", "stack-down-while-candidate", "stack-down-while-candidate"],
    ["closing", "stack-down-while-candidate", "stack-down-while-candidate"],
  ] as const)("counts %s ending in %s as a valid measure of category %s, exit code 0", (name, outcome, category) => {
    expect(verdict(stoppedAt(name, outcome))).toEqual({ verdict: { category, reason: outcome }, exitCode: 0 });
  });

  it.each([
    ["preparation", "runner-error-before-candidate"],
    ["contract", "runner-error-before-candidate"],
    ["build", "registry-network-error"],
    ["start", "stack-failed-before-candidate"],
    ["start", "access-log-inactive"],
    ["oracle", "oracle-error"],
    ["closing", "marker-out-of-place"],
    ["closing", "access-log-inactive"],
    ...(["preparation", "contract", "build", "start", "oracle", "closing"] as const).map((name) => [name, "interrupted"] as const),
  ] as const)("counts %s ending in %s as an invalid measure with its evidence, exit code 3", (name, outcome) => {
    expect(verdict(stoppedAt(name, outcome, "proof line"))).toEqual({
      verdict: { category: "invalid", reason: outcome, evidence: "proof line" },
      exitCode: 3,
    });
  });

  it("refuses an invalidity cause outside the closed list", () => {
    expect(() => verdict(stoppedAt("oracle", "candidate-asked-for-invalid", "proof line"))).toThrow(/candidate-asked-for-invalid/);
  });

  it("refuses an outcome that its phase cannot produce", () => {
    expect(() => verdict(stoppedAt("start", "registry-network-error", "proof line"))).toThrow(/registry-network-error.*start/);
  });

  it("refuses any gates outcome other than ok while the gates are empty (step 3)", () => {
    expect(() => verdict(stoppedAt("gates", "stack-down-while-candidate"))).toThrow(/stack-down-while-candidate.*gates/);
    expect(() => verdict(stoppedAt("gates", "interrupted", "SIGINT"))).toThrow(/interrupted.*gates/);
  });

  it("refuses an invalid measure without evidence", () => {
    expect(() => verdict(stoppedAt("start", "stack-failed-before-candidate"))).toThrow(/without evidence/);
  });

  it("never makes an exceeded delay invalid", () => {
    expect(verdict(stoppedAt("build", "build-timeout", "proof line")).verdict.category).toBe("candidate-failure");
    expect(verdict(stoppedAt("start", "start-not-ready", "proof line")).verdict.category).toBe("candidate-failure");
  });

  it("makes a runner error before npm ci invalid, and a runner error from npm ci on a stack failure while the candidate runs", () => {
    expect(verdict(stoppedAt("contract", "runner-error-before-candidate", "TypeError: boom")).exitCode).toBe(3);
    expect(() => verdict(stoppedAt("build", "runner-error-before-candidate", "TypeError: boom"))).toThrow(/runner-error-before-candidate.*build/);
    expect(verdict(stoppedAt("build", "stack-down-while-candidate"))).toEqual({
      verdict: { category: "stack-down-while-candidate", reason: "stack-down-while-candidate" },
      exitCode: 0,
    });
  });

  it("never makes a network error outside the imposed registry invalid: it is a failed build", () => {
    expect(verdict(stoppedAt("build", "build-failed", "getaddrinfo ENOTFOUND evil.example"))).toEqual({
      verdict: { category: "candidate-failure", reason: "build-failed" },
      exitCode: 0,
    });
  });

  it("is decided by the first outcome other than ok: a later invalid closing does not hide a candidate failure", () => {
    const phases = [...stoppedAt("start", "start-exited").slice(0, -1), phase("closing", "access-log-inactive", "no start marker")];

    expect(verdict(phases).verdict).toEqual({ category: "candidate-failure", reason: "start-exited" });
  });

  it("is invalid when interrupted, whatever the phase, even after a candidate failure", () => {
    const phases = [...stoppedAt("start", "start-exited").slice(0, -1), phase("closing", "interrupted", "SIGINT")];

    expect(verdict(phases)).toEqual({ verdict: { category: "invalid", reason: "interrupted", evidence: "SIGINT" }, exitCode: 3 });
  });
});
