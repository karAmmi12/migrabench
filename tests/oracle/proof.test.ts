// Vérification de la preuve du critère de fin de l'étape 2 (#39) : 5 résultats
// d'un même job de preuve, chacun une mesure verte, tous obtenus dans le même
// environnement, avec 5 sels différents. Chaque résultat est aussi un
// résultat valide au sens de oracle/result-check.ts.
import { describe, expect, it } from "vitest";
import { checkProof, type ProofInput, type ProofResult } from "../../oracle/proof.ts";
import type { ResultEnvironment } from "../../oracle/result-check.ts";

const BENCH_COMMIT = "f89e6d0833ca0fc84c88f48281ce0fa2c16390bf";
const OTHER_COMMIT = "41fce78aa218f75266cc6ccb7f7bcf2475836d18";

const ENVIRONMENT: ResultEnvironment = {
  node: "22.23.5",
  commitExists: (sha) => sha === BENCH_COMMIT || sha === OTHER_COMMIT,
};

const SALTS = ["a1", "b2", "c3", "d4", "e5"].map((prefix) => prefix.repeat(32));

function result(rank: number): ProofResult {
  return {
    config: {
      metadata: {
        benchCommit: BENCH_COMMIT,
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

function fileOf(rank: number): string {
  return `results/oracle/ci19876543210.1-${rank}.json`;
}

function proof(): ProofInput[] {
  return [1, 2, 3, 4, 5].map((rank) => ({ file: fileOf(rank), result: result(rank) }));
}

function check(inputs: readonly ProofInput[]): string[] {
  return checkProof(inputs, ENVIRONMENT);
}

// Modifie une métadonnée d'un des 5 résultats.
function withMetadata(rank: number, change: Record<string, unknown>): ProofInput[] {
  const inputs = proof();
  const target = inputs[rank - 1]!.result;
  target.config.metadata = { ...target.config.metadata, ...change };
  return inputs;
}

describe("oracle proof", () => {
  it("accepts 5 green measurements of one proof job", () => {
    expect(check(proof())).toEqual([]);
  });

  it("refuses an execution imposed by ORACLE_SALT", () => {
    expect(check(withMetadata(2, { saltImposed: true }))).toEqual([`${fileOf(2)}: rule saltImposed: true, expected false`]);
  });

  it("refuses an execution from a dirty worktree", () => {
    expect(check(withMetadata(3, { worktree: "dirty" }))).toEqual([`${fileOf(3)}: rule worktree: "dirty", expected "clean"`]);
  });

  it("refuses an execution that is not 38 passed scenarios out of 38", () => {
    expect(check(withMetadata(1, { summary: { scenarios: 38, passed: 37, failed: 0, unreached: 1 } }))).toEqual([
      `${fileOf(1)}: 37 passed, 0 failed, 1 unreached out of 38 scenarios, expected 38 passed out of 38`,
    ]);
    expect(check(withMetadata(4, { summary: { scenarios: 37, passed: 37, failed: 0, unreached: 0 } }))).toEqual([
      `${fileOf(4)}: 37 passed, 0 failed, 0 unreached out of 37 scenarios, expected 38 passed out of 38`,
    ]);
  });

  it("refuses executions from different environments", () => {
    for (const [key, value] of [
      ["chromium", "159.0.8154.7"],
      ["playwright", "1.65.2"],
      ["frozenDate", "2025-11-16"],
    ] as const) {
      expect(check(withMetadata(5, { [key]: value })), key).toEqual([`${key} differs between executions`]);
    }
  });

  it("refuses executions on different legacy or archive images", () => {
    expect(check(withMetadata(2, { images: { legacy: "sha256:9999", archive: "sha256:aed1" } }))).toEqual([
      "images.legacy differs between executions",
    ]);
    expect(check(withMetadata(2, { images: { legacy: "sha256:1716" } }))).toEqual(["images.archive is missing"]);
  });

  it("refuses an environment value missing from every execution", () => {
    const inputs = proof();
    for (const { result: { config } } of inputs) config.metadata = { ...config.metadata, chromium: undefined, images: {} };
    expect(check(inputs)).toEqual(["chromium is missing", "images.legacy is missing", "images.archive is missing"]);
  });

  it("refuses two executions with the same salt", () => {
    expect(check(withMetadata(4, { salt: SALTS[0] }))).toEqual(["salts are not all different"]);
  });

  it("refuses fewer than 5 executions", () => {
    expect(check(proof().slice(0, 4))).toEqual(["expected 5 executions, got 4"]);
  });

  it("refuses executions that are not ranks 1 to 5 of one CI run", () => {
    expect(check(withMetadata(3, { ciRun: undefined }))).toEqual([`${fileOf(3)}: no ciRun`, "ranks are not 1 to 5 of one CI run"]);
    expect(check(withMetadata(3, { ciRun: { runId: "19876543211", attempt: 1, rank: 3 } }))).toEqual([
      "ranks are not 1 to 5 of one CI run",
    ]);
    expect(check(withMetadata(3, { ciRun: { runId: "19876543210", attempt: 2, rank: 3 } }))).toEqual([
      "ranks are not 1 to 5 of one CI run",
    ]);
    expect(check(withMetadata(3, { ciRun: { runId: "19876543210", attempt: 1, rank: 2 } }))).toEqual([
      "ranks are not 1 to 5 of one CI run",
    ]);
  });

  it("refuses an execution under another Node or on an unknown commit, even if all five share it", () => {
    const inputs = proof();
    for (const { result: { config } } of inputs) {
      config.metadata = { ...config.metadata, node: "v22.23.4", benchCommit: "41fce78000000000000000000000000000000000" };
    }
    expect(check(inputs)).toEqual(
      [1, 2, 3, 4, 5].flatMap((rank) => [
        `${fileOf(rank)}: rule node: "v22.23.4", expected "v22.23.5" (.nvmrc)`,
        `${fileOf(rank)}: rule benchCommit: 41fce78000000000000000000000000000000000 is not a commit of this repository`,
      ]),
    );
  });

  it("refuses an execution whose result contains a machine path", () => {
    const inputs = proof();
    (inputs[1]!.result as ProofResult & { suites?: unknown }).suites = [{ file: "/Users/someone/migrabench/search.spec.ts" }];
    expect(check(inputs)).toEqual([`${fileOf(2)}: rule machine-path: contains /Users/`]);
  });

  it("refuses executions on different bench commits", () => {
    expect(check(withMetadata(5, { benchCommit: OTHER_COMMIT }))).toEqual(["benchCommit differs between executions"]);
  });

  it("refuses executions on different Node versions", () => {
    expect(check(withMetadata(5, { node: "v22.23.4" }))).toEqual([
      `${fileOf(5)}: rule node: "v22.23.4", expected "v22.23.5" (.nvmrc)`,
      "node differs between executions",
    ]);
  });
});
