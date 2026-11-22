// Vérification de la preuve du critère de fin de l'étape 2 (#39) : 5 résultats
// d'un même job de preuve, chacun une mesure verte, tous obtenus dans le même
// environnement, avec 5 sels différents.
import { describe, expect, it } from "vitest";
import { checkProof, type ProofResult } from "../../oracle/proof.ts";

const SALTS = ["a1", "b2", "c3", "d4", "e5"].map((prefix) => prefix.repeat(32));

function result(rank: number): ProofResult {
  return {
    config: {
      metadata: {
        benchCommit: "f89e6d0833ca0fc84c88f48281ce0fa2c16390bf",
        worktree: "clean",
        node: "v22.23.5",
        chromium: "159.0.8154.6",
        playwright: "1.65.1",
        images: { legacy: "sha256:1716", archive: "sha256:aed1" },
        frozenDate: "2025-11-15",
        ciRun: { runId: "19876543210", attempt: 1, rank },
        salt: SALTS[rank - 1],
        saltImposed: false,
        summary: { scenarios: 38, passed: 38, failed: 0, unreached: 0 },
      },
    },
  };
}

function proof(): ProofResult[] {
  return [1, 2, 3, 4, 5].map(result);
}

// Modifie une métadonnée d'un des 5 résultats.
function withMetadata(rank: number, change: Record<string, unknown>): ProofResult[] {
  const results = proof();
  const target = results[rank - 1]!;
  target.config.metadata = { ...target.config.metadata, ...change };
  return results;
}

describe("oracle proof", () => {
  it("accepts 5 green measurements of one proof job", () => {
    expect(checkProof(proof())).toEqual([]);
  });

  it("refuses a run imposed by ORACLE_SALT", () => {
    expect(checkProof(withMetadata(2, { saltImposed: true }))).toEqual(["rank 2: saltImposed is not false"]);
  });

  it("refuses a run from a dirty worktree", () => {
    expect(checkProof(withMetadata(3, { worktree: "dirty" }))).toEqual(["rank 3: worktree is not clean"]);
  });

  it("refuses a run that is not 38 passed scenarios out of 38", () => {
    expect(checkProof(withMetadata(1, { summary: { scenarios: 38, passed: 37, failed: 0, unreached: 1 } }))).toEqual([
      "rank 1: 37 passed, 0 failed, 1 unreached out of 38 scenarios, expected 38 passed out of 38",
    ]);
    expect(checkProof(withMetadata(4, { summary: { scenarios: 37, passed: 37, failed: 0, unreached: 0 } }))).toEqual([
      "rank 4: 37 passed, 0 failed, 0 unreached out of 37 scenarios, expected 38 passed out of 38",
    ]);
  });

  it("refuses runs from different environments", () => {
    for (const [key, value] of [
      ["benchCommit", "41fce78000000000000000000000000000000000"],
      ["node", "v22.23.4"],
      ["chromium", "159.0.8154.7"],
      ["playwright", "1.65.2"],
      ["frozenDate", "2025-11-16"],
    ] as const) {
      expect(checkProof(withMetadata(5, { [key]: value })), key).toEqual([`${key} differs between runs`]);
    }
  });

  it("refuses runs on different legacy or archive images", () => {
    expect(checkProof(withMetadata(2, { images: { legacy: "sha256:9999", archive: "sha256:aed1" } }))).toEqual([
      "images.legacy differs between runs",
    ]);
    expect(checkProof(withMetadata(2, { images: { legacy: "sha256:1716" } }))).toEqual(["images.archive differs between runs"]);
  });

  it("refuses two runs with the same salt", () => {
    expect(checkProof(withMetadata(4, { salt: SALTS[0] }))).toEqual(["salts are not all different"]);
  });

  it("refuses fewer than 5 runs", () => {
    expect(checkProof(proof().slice(0, 4))).toEqual(["expected 5 runs, got 4"]);
  });

  it("refuses runs that are not ranks 1 to 5 of one CI run", () => {
    expect(checkProof(withMetadata(3, { ciRun: undefined }))).toEqual(["rank ?: no ciRun", "ranks are not 1 to 5 of one CI run"]);
    expect(checkProof(withMetadata(3, { ciRun: { runId: "19876543211", attempt: 1, rank: 3 } }))).toEqual([
      "ranks are not 1 to 5 of one CI run",
    ]);
    expect(checkProof(withMetadata(3, { ciRun: { runId: "19876543210", attempt: 2, rank: 3 } }))).toEqual([
      "ranks are not 1 to 5 of one CI run",
    ]);
    expect(checkProof(withMetadata(3, { ciRun: { runId: "19876543210", attempt: 1, rank: 2 } }))).toEqual([
      "ranks are not 1 to 5 of one CI run",
    ]);
  });
});
