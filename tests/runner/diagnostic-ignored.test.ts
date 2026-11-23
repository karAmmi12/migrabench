// Les mesures de diagnostic restent hors de Git (spec de l'étape 3, user story 22).
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_DIR_FROM_ROOT } from "../../runner/paths.ts";

describe("diagnostic measures directory", () => {
  it("is ignored by Git", () => {
    const path = `${DIAGNOSTIC_DIR_FROM_ROOT}/20261123T090507Z-454fb76-reference-candidate/measure.json`;
    const ignored = execFileSync("git", ["check-ignore", path], { encoding: "utf8" });

    expect(ignored.trim()).toBe(path);
  });

  it("lies under results/", () => {
    expect(DIAGNOSTIC_DIR_FROM_ROOT).toBe("results/diagnostic");
  });
});
