// Refus préalables de `migrabench measure` (spec de l'étape 3, « Codes de
// sortie ») : options invalides ou dossier du candidat absent rendent le code
// 4 sans rien écrire. Ces refus arrivent avant toute commande Docker.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_DIR_FROM_ROOT } from "../../runner/paths.ts";
import { ARTIFACTS_DIR_FROM_ROOT, ROOT } from "../../shared/root.ts";

function entries(dir: string): string[] {
  const full = join(ROOT, dir);
  return existsSync(full) ? readdirSync(full) : [];
}

function measure(...args: string[]) {
  const before = [entries(DIAGNOSTIC_DIR_FROM_ROOT), entries(ARTIFACTS_DIR_FROM_ROOT)];
  const { status, stderr } = spawnSync(process.execPath, ["runner/cli.ts", ...args], { cwd: ROOT, encoding: "utf8" });
  const after = [entries(DIAGNOSTIC_DIR_FROM_ROOT), entries(ARTIFACTS_DIR_FROM_ROOT)];
  return { status, stderr, written: after.map((names, index) => names.filter((name) => !before[index]!.includes(name))).flat() };
}

describe("migrabench measure refused before any measure", () => {
  it("refuses invalid options with exit code 4", () => {
    expect(measure("measure")).toMatchObject({ status: 4, written: [] });
    expect(measure("measure", "--candidate", "fixtures/reference-candidate", "--bogus")).toMatchObject({ status: 4, written: [] });
  });

  it("refuses a missing candidate directory with exit code 4, naming it, and writes nothing", () => {
    const result = measure("measure", "--candidate", "fixtures/no-such-candidate");

    expect(result).toMatchObject({ status: 4, written: [] });
    expect(result.stderr).toContain("refused-usage");
    expect(result.stderr).toContain("fixtures/no-such-candidate");
  });

  it("refuses a candidate directory outside candidates/ and fixtures/", () => {
    const result = measure("measure", "--candidate", "runner");

    expect(result).toMatchObject({ status: 4, written: [] });
    expect(result.stderr).toContain("candidates/ or fixtures/");
  });

  it("refuses a candidate path that is a file", () => {
    expect(measure("measure", "--candidate", "fixtures/users.json")).toMatchObject({ status: 4, written: [] });
  });
});
