// Contrôle d'un résultat de l'oracle versionné (#53), sur des résultats
// factices : un résultat valide, puis un par règle violée.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkResult, formatViolation, type ResultEnvironment } from "../../oracle/result-check.ts";

const ENVIRONMENT: ResultEnvironment = {
  node: "22.23.5",
  commitExists: (sha) => sha === "b2ec9d805391a7d38c43306fa3dea19a586d3e91",
};

function check(name: string): string[] {
  const file = `tests/oracle/fixtures/results/${name}.json`;
  const result = JSON.parse(readFileSync(new URL(`fixtures/results/${name}.json`, import.meta.url), "utf8"));
  return checkResult(result, ENVIRONMENT).map((violation) => formatViolation(file, violation));
}

describe("oracle result check", () => {
  it("accepts a result from a clean worktree, under the Node of .nvmrc, with a drawn salt and a known commit", () => {
    expect(check("valid")).toEqual([]);
  });

  it("refuses a result from a dirty worktree", () => {
    expect(check("dirty-worktree")).toEqual([
      'tests/oracle/fixtures/results/dirty-worktree.json: rule worktree: "dirty", expected "clean"',
    ]);
  });

  it("refuses a result produced under another Node than the one of .nvmrc", () => {
    expect(check("other-node")).toEqual([
      'tests/oracle/fixtures/results/other-node.json: rule node: "v24.12.0", expected "v22.23.5" (.nvmrc)',
    ]);
  });

  it("refuses a diagnostic result, whose salt was imposed by ORACLE_SALT", () => {
    expect(check("salt-imposed")).toEqual([
      "tests/oracle/fixtures/results/salt-imposed.json: rule saltImposed: true, expected false",
    ]);
  });

  it("refuses a result that does not say whether its salt was imposed", () => {
    expect(check("salt-imposed-missing")).toEqual([
      "tests/oracle/fixtures/results/salt-imposed-missing.json: rule saltImposed: missing, expected false",
    ]);
  });

  it("refuses a result whose bench commit is not in the repository", () => {
    expect(check("unknown-commit")).toEqual([
      "tests/oracle/fixtures/results/unknown-commit.json: rule benchCommit: 0123456789abcdef0123456789abcdef01234567 is not a commit of this repository",
    ]);
  });

  it("refuses a bench commit that is not a full SHA", () => {
    expect(check("short-commit")).toEqual([
      'tests/oracle/fixtures/results/short-commit.json: rule benchCommit: "b2ec9d8" is not a full commit SHA',
    ]);
  });

  it.each([
    ["home-path", "/Users/"],
    ["linux-home-path", "/home/"],
    ["temp-path", "/var/folders/"],
  ])("refuses a machine path anywhere in the result (%s)", (name, prefix) => {
    expect(check(name)).toEqual([`tests/oracle/fixtures/results/${name}.json: rule machine-path: contains ${prefix}`]);
  });

  it("refuses a path field that climbs above the repository root", () => {
    expect(check("parent-path")).toEqual([
      "tests/oracle/fixtures/results/parent-path.json: rule machine-path: contains a path above the repository root: ../../../../.nvm/versions/node/v22.23.5/bin/node",
    ]);
  });

  it("accepts ../ in a text that is not a path field (test output)", () => {
    expect(check("parent-in-text")).toEqual([]);
  });

  it("reports every violation of a result, not only the first", () => {
    const file = "tests/oracle/fixtures/results/several-violations.json";
    expect(check("several-violations")).toEqual([
      `${file}: rule worktree: "dirty", expected "clean"`,
      `${file}: rule node: "v24.12.0", expected "v22.23.5" (.nvmrc)`,
      `${file}: rule machine-path: contains /Users/`,
      `${file}: rule machine-path: contains /var/folders/`,
      `${file}: rule machine-path: contains a path above the repository root: ../../../../.nvm/versions/node/v24.12.0/bin/node`,
    ]);
  });
});
