// Chaque résultat d'étalonnage versionné dans results/calibration/ passe le
// contrôle de oracle/result-check.ts (#53 étendu par #72) : arbre propre, Node
// de .nvmrc, commit du banc connu, aucun chemin machine. Seul un étalonnage
// fait en CI y est versionné : il cite aussi son exécution de CI.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FETCH_PULL_HEADS, repositoryEnvironment } from "../../oracle/repository.ts";
import { checkCalibrationResult, formatViolation } from "../../oracle/result-check.ts";
import { CALIBRATION_DIR_FROM_ROOT } from "../../runner/paths.ts";

const ROOT = new URL("../../", import.meta.url);
const environment = repositoryEnvironment(ROOT);
const files = readdirSync(new URL(CALIBRATION_DIR_FROM_ROOT, ROOT))
  .filter((name) => name.endsWith(".json"))
  .sort();

describe("versioned calibration results", () => {
  it("there are versioned calibrations to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s passes the calibration result check and cites its CI run", (name) => {
    const file = `${CALIBRATION_DIR_FROM_ROOT}/${name}`;
    const result = JSON.parse(readFileSync(new URL(file, ROOT), "utf8")) as { environment?: { ciRun?: unknown } };
    const violations = checkCalibrationResult(result, environment);
    const hint = violations.some(({ rule }) => rule === "benchCommit")
      ? `\nThe bench commit may only be reachable from its pull request head: ${FETCH_PULL_HEADS}`
      : "";
    const messages = violations.map((violation) => formatViolation(file, violation));
    expect(messages, `${messages.join("\n")}${hint}`).toEqual([]);
    expect(result.environment?.ciRun, `${file}: not a CI calibration`).toBeDefined();
  });
});
