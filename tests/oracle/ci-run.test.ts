// Exécution de CI enregistrée dans le résultat (`ciRun`) et nom du fichier de
// résultat (#39) : identifiant de l'exécution de CI et rang de l'exécution
// complète dans le job.
import { describe, expect, it } from "vitest";
import { ciRunOf, resultFileName } from "../../oracle/ci-run.ts";

const STARTED_AT = new Date("2026-11-22T14:44:56.123Z");
const COMMIT = "f89e6d0833ca0fc84c88f48281ce0fa2c16390bf";

describe("CI run", () => {
  it("is absent outside GitHub Actions", () => {
    expect(ciRunOf({})).toBeUndefined();
    expect(ciRunOf({ ORACLE_CI_RANK: "2" })).toBeUndefined();
  });

  it("reads the run identifier, its attempt and the rank", () => {
    expect(ciRunOf({ GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "19876543210", GITHUB_RUN_ATTEMPT: "2", ORACLE_CI_RANK: "3" })).toEqual({
      runId: "19876543210",
      attempt: 2,
      rank: 3,
    });
  });

  it("has rank 1 when the job runs the oracle once", () => {
    expect(ciRunOf({ GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "19876543210", GITHUB_RUN_ATTEMPT: "1" })?.rank).toBe(1);
  });

  it("refuses a rank that is not a positive integer", () => {
    const ci = { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "19876543210", GITHUB_RUN_ATTEMPT: "1" };
    for (const rank of ["0", "-1", "1.5", "deux", ""]) {
      expect(() => ciRunOf({ ...ci, ORACLE_CI_RANK: rank }), rank).toThrow(/ORACLE_CI_RANK/);
    }
  });

  it("refuses GitHub Actions without a run identifier", () => {
    expect(() => ciRunOf({ GITHUB_ACTIONS: "true", GITHUB_RUN_ATTEMPT: "1" })).toThrow(/GITHUB_RUN_ID/);
  });
});

describe("result file name", () => {
  it("is the start time and the short commit outside CI", () => {
    expect(resultFileName(STARTED_AT, COMMIT)).toBe("20261122T144456Z-f89e6d0.json");
  });

  it("adds the CI run, its attempt and the rank in CI", () => {
    expect(resultFileName(STARTED_AT, COMMIT, { runId: "19876543210", attempt: 1, rank: 4 })).toBe(
      "20261122T144456Z-f89e6d0-ci19876543210.1-4.json",
    );
  });
});
