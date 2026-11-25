// Contrôle d'un résultat de l'oracle versionné (#53), sur un vrai résultat :
// le rang 1 de la preuve de l'exécution 45041781224
// (tests/fixtures/ci45041781224/PROVENANCE.md), qui doit passer, puis une
// variante par règle violée. Chaque variante part de la copie et ne change
// que ce que son test regarde.
import { describe, expect, it } from "vitest";
import { checkResult, formatViolation, type ResultEnvironment } from "../../oracle/result-check.ts";
import { fixturePath, PROOF_RESULTS, readJsonFixture, variant } from "../real-fixtures.ts";

const FILE = fixturePath(PROOF_RESULTS[0]);

type Result = {
  config: { metadata: Record<string, unknown>; argv: string[]; rootDir: string };
  suites: { file: string; specs: { tests: { results: { stdout: { text: string }[] }[] }[] }[] }[];
};
const PROOF_RESULT = readJsonFixture<Result>(PROOF_RESULTS[0]);
const BENCH_COMMIT = PROOF_RESULT.config.metadata.benchCommit as string;

const ENVIRONMENT: ResultEnvironment = {
  node: "22.23.5",
  commitExists: (sha) => sha === BENCH_COMMIT,
};

// Premier résultat du premier scénario.
const firstResult = (result: Result) => result.suites[0]!.specs[0]!.tests[0]!.results[0]!;

const withMetadata = (change: Record<string, unknown>) => variant(PROOF_RESULT, (result) => Object.assign(result.config.metadata, change));
// Sortie standard du premier scénario, vide dans le vrai résultat.
const withStdout = (text: string) => variant(PROOF_RESULT, (result) => firstResult(result).stdout.push({ text }));

const HOME_PATH = "/Users/someone/migrabench/oracle/scenarios/remise.spec.ts";
const TEMP_TEXT = "trace in /var/folders/xy/T/playwright-artifacts\n";
const parentNode = (version: string) => `../../../../.nvm/versions/node/${version}/bin/node`;

function check(result: Result): string[] {
  return checkResult(result, ENVIRONMENT).map((violation) => formatViolation(FILE, violation));
}

describe("oracle result check", () => {
  it("accepts a result from a clean worktree, under the Node of .nvmrc, with a drawn salt and a known commit", () => {
    expect(check(PROOF_RESULT)).toEqual([]);
  });

  it("refuses a result from a dirty worktree", () => {
    expect(check(withMetadata({ worktree: "dirty" }))).toEqual([`${FILE}: rule worktree: "dirty", expected "clean"`]);
  });

  it("refuses a result produced under another Node than the one of .nvmrc", () => {
    expect(check(withMetadata({ node: "v24.12.0" }))).toEqual([`${FILE}: rule node: "v24.12.0", expected "v22.23.5" (.nvmrc)`]);
  });

  it("refuses a diagnostic result, whose salt was imposed by ORACLE_SALT", () => {
    expect(check(withMetadata({ saltImposed: true }))).toEqual([`${FILE}: rule saltImposed: true, expected false`]);
  });

  it("refuses a result that does not say whether its salt was imposed", () => {
    const result = variant(PROOF_RESULT, ({ config }) => delete config.metadata.saltImposed);

    expect(check(result)).toEqual([`${FILE}: rule saltImposed: missing, expected false`]);
  });

  it("refuses a result whose bench commit is not in the repository", () => {
    expect(check(withMetadata({ benchCommit: "0123456789abcdef0123456789abcdef01234567" }))).toEqual([
      `${FILE}: rule benchCommit: 0123456789abcdef0123456789abcdef01234567 is not a commit of this repository`,
    ]);
  });

  it("refuses a bench commit that is not a full SHA", () => {
    expect(check(withMetadata({ benchCommit: BENCH_COMMIT.slice(0, 7) }))).toEqual([`${FILE}: rule benchCommit: "a664b7b" is not a full commit SHA`]);
  });

  it.each([
    ["a suite file under a macOS home", variant(PROOF_RESULT, (result) => (result.suites[0]!.file = HOME_PATH)), "/Users/"],
    ["a root directory under a Linux home", variant(PROOF_RESULT, (result) => (result.config.rootDir = "/home/runner/work/migrabench/migrabench/oracle/scenarios")), "/home/"],
    ["a temporary directory in a test output", withStdout(TEMP_TEXT), "/var/folders/"],
  ])("refuses a machine path anywhere in the result (%s)", (_, result, prefix) => {
    expect(check(result)).toEqual([`${FILE}: rule machine-path: contains ${prefix}`]);
  });

  it("refuses a path field that climbs above the repository root", () => {
    const result = variant(PROOF_RESULT, ({ config }) => (config.argv[0] = parentNode("v22.23.5")));

    expect(check(result)).toEqual([`${FILE}: rule machine-path: contains a path above the repository root: ${parentNode("v22.23.5")}`]);
  });

  it("accepts ../ in a text that is not a path field (test output)", () => {
    expect(check(withStdout("read ../../shared/fixture.json\n"))).toEqual([]);
  });

  it("reports every violation of a result, not only the first", () => {
    const result = variant(PROOF_RESULT, (result) => {
      Object.assign(result.config.metadata, { worktree: "dirty", node: "v24.12.0" });
      result.config.argv[0] = parentNode("v24.12.0");
      result.suites[0]!.file = HOME_PATH;
      firstResult(result).stdout.push({ text: TEMP_TEXT });
    });

    expect(check(result)).toEqual([
      `${FILE}: rule worktree: "dirty", expected "clean"`,
      `${FILE}: rule node: "v24.12.0", expected "v22.23.5" (.nvmrc)`,
      `${FILE}: rule machine-path: contains /Users/`,
      `${FILE}: rule machine-path: contains /var/folders/`,
      `${FILE}: rule machine-path: contains a path above the repository root: ${parentNode("v24.12.0")}`,
    ]);
  });
});
