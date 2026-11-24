// Contrôle d'un measure.json versionné (#73, spec de l'étape 3, « Tests ») :
// les règles du contrôle des résultats de l'oracle (#53), plus `counted: true`,
// `originMain` connu, `benchCommit` égal à `originMain` ou ancêtre de lui, et
// l'empreinte de `oracle.json`.
import { describe, expect, it } from "vitest";
import { checkMeasureResult, type MeasureEnvironment } from "../../oracle/result-check.ts";

const ORIGIN_MAIN = "802178c0e1b2c3d4e5f60718293a4b5c6d7e8f90";
const BENCH_COMMIT = "29e779b0a1b2c3d4e5f60718293a4b5c6d7e8f90";
const OTHER_BRANCH = "c0ffee00a1b2c3d4e5f60718293a4b5c6d7e8f90";
const ORACLE_DIGEST = "sha256:0f0f";

const ENVIRONMENT: MeasureEnvironment = {
  node: "22.23.5",
  commitExists: (sha) => [ORIGIN_MAIN, BENCH_COMMIT, OTHER_BRANCH].includes(sha),
  // BENCH_COMMIT est un ancêtre de ORIGIN_MAIN ; OTHER_BRANCH ne l'est pas.
  isAncestor: (ancestor, descendant) => ancestor === descendant || (ancestor === BENCH_COMMIT && descendant === ORIGIN_MAIN),
};

const VALID = {
  format: 1,
  measureId: "20261124T150000Z-29e779b-reference-candidate",
  counted: true,
  originMain: ORIGIN_MAIN,
  candidate: { path: "fixtures/reference-candidate", contentDigest: "sha256:aa" },
  environment: { benchCommit: BENCH_COMMIT, worktree: "clean", node: "v22.23.5" },
  salt: "5a17",
  saltImposed: false,
  oracle: { executed: true, result: ORACLE_DIGEST },
};

// Sans second argument : le oracle.json de VALID. `{ digest: undefined }` :
// aucun oracle.json dans le dossier.
function rules(measure: unknown, oracle: { digest: string | undefined } = { digest: ORACLE_DIGEST }): string[] {
  return checkMeasureResult(measure, oracle.digest, ENVIRONMENT).map(({ rule }) => rule);
}

describe("check of a versioned measure.json", () => {
  it("accepts a measure planned to count from a published state, with its oracle.json", () => {
    expect(checkMeasureResult(VALID, ORACLE_DIGEST, ENVIRONMENT)).toEqual([]);
  });

  it("accepts a measure whose bench commit is origin/main itself", () => {
    expect(rules({ ...VALID, environment: { ...VALID.environment, benchCommit: ORIGIN_MAIN } })).toEqual([]);
  });

  it("refuses a measure.json written by hand, without the environment of a measure", () => {
    expect(rules({ counted: true, originMain: ORIGIN_MAIN, saltImposed: false, oracle: { executed: false } }, { digest: undefined })).toEqual([
      "worktree",
      "node",
      "benchCommit",
    ]);
  });

  it.each([
    ["under another Node", { environment: { ...VALID.environment, node: "v22.1.0" } }, "node"],
    ["from a modified worktree", { environment: { ...VALID.environment, worktree: "dirty" } }, "worktree"],
    ["with an imposed salt", { saltImposed: true }, "saltImposed"],
    ["that is not planned to count", { counted: false }, "counted"],
    ["without counted", { counted: undefined }, "counted"],
    ["with an unknown originMain", { originMain: "deadbeef00000000000000000000000000000000" }, "originMain"],
    ["without originMain", { originMain: undefined }, "originMain"],
    ["whose bench commit is outside the history of originMain", { environment: { ...VALID.environment, benchCommit: OTHER_BRANCH } }, "benchCommit"],
    ["with a machine path", { candidate: { ...VALID.candidate, path: "/Users/someone/candidate" } }, "machine-path"],
  ])("refuses a measure %s", (_, change, rule) => {
    expect(rules({ ...VALID, ...change })).toEqual([rule]);
  });

  it("refuses a measure whose oracle.json digest is not the one it cites", () => {
    expect(rules(VALID, { digest: "sha256:1e1e" })).toEqual(["oracle"]);
  });

  it("refuses a measure that cites an oracle.json that is missing", () => {
    expect(rules(VALID, { digest: undefined })).toEqual(["oracle"]);
  });

  it("refuses an oracle.json next to a measure whose oracle did not run", () => {
    expect(rules({ ...VALID, oracle: { executed: false } }, { digest: ORACLE_DIGEST })).toEqual(["oracle"]);
  });
});
