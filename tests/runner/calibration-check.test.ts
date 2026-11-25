// Contrôle d'un résultat d'étalonnage versionné (#53 étendu par #72), sur un
// vrai résultat, puis une variante par règle violée. Mêmes
// règles qu'un résultat de l'oracle, sauf le sel : l'étalonnage n'en a pas.
import { describe, expect, it } from "vitest";
import { checkCalibrationResult, formatViolation, type ResultEnvironment } from "../../oracle/result-check.ts";
import { CALIBRATION, fixturePath, readJsonFixture } from "../real-fixtures.ts";

// Le vrai étalonnage de l'exécution 45509307133
// (tests/fixtures/ci45509307133/PROVENANCE.md). Chaque variante part de la
// copie et ne change que son environnement.
const RECORDED_CALIBRATION = readJsonFixture<{ environment: Record<string, unknown> }>(CALIBRATION.result);
const COMMIT = RECORDED_CALIBRATION.environment.benchCommit as string;
const ENVIRONMENT: ResultEnvironment = { node: "22.23.5", commitExists: (sha) => sha === COMMIT };
const FILE = fixturePath(CALIBRATION.result);

function calibration(environment: Record<string, unknown> = {}) {
  return { ...RECORDED_CALIBRATION, environment: { ...RECORDED_CALIBRATION.environment, ...environment } };
}

function check(result: unknown): string[] {
  return checkCalibrationResult(result, ENVIRONMENT).map((violation) => formatViolation(FILE, violation));
}

describe("calibration result check", () => {
  it("accepts a calibration from a clean worktree, under the Node of .nvmrc, with a known commit and no machine path", () => {
    expect(check(calibration())).toEqual([]);
  });

  it("refuses a calibration from a dirty worktree", () => {
    expect(check(calibration({ worktree: "dirty" }))).toEqual([`${FILE}: rule worktree: "dirty", expected "clean"`]);
  });

  it("refuses a calibration produced under another Node than the one of .nvmrc", () => {
    expect(check(calibration({ node: "v24.12.0" }))).toEqual([`${FILE}: rule node: "v24.12.0", expected "v22.23.5" (.nvmrc)`]);
  });

  it("refuses a calibration whose bench commit is not in the repository, or not a full SHA", () => {
    expect(check(calibration({ benchCommit: "0123456789abcdef0123456789abcdef01234567" }))).toEqual([
      `${FILE}: rule benchCommit: 0123456789abcdef0123456789abcdef01234567 is not a commit of this repository`,
    ]);
    expect(check(calibration({ benchCommit: "aeb3037" }))).toEqual([`${FILE}: rule benchCommit: "aeb3037" is not a full commit SHA`]);
  });

  it("refuses a calibration that contains a machine path", () => {
    expect(check(calibration({ artifacts: "/home/runner/work/migrabench/migrabench/.oracle-artifacts/x" }))).toEqual([
      `${FILE}: rule machine-path: contains /home/`,
    ]);
  });

  it("does not ask a calibration for a salt", () => {
    expect(check(calibration()).filter((message) => message.includes("saltImposed"))).toEqual([]);
  });
});
