// Script du job « changes » (#76) : écrit dans GITHUB_OUTPUT, pour chaque job
// lourd de CI_JOBS, s'il doit tourner.
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = new URL("../scripts/write-ci-scope.ts", import.meta.url).pathname;

async function writeScope(env: Record<string, string>): Promise<{ code: number; stdout: string; output: string }> {
  const output = join(mkdtempSync(join(tmpdir(), "mb-ci-scope-")), "github-output");
  writeFileSync(output, "");
  // Ni gh ni git dans le PATH : hors PR, le script ne doit appeler ni l'un ni l'autre.
  const base = { PATH: "/nonexistent", GITHUB_OUTPUT: output };
  try {
    const { stdout } = await execFileAsync(process.execPath, [script], { env: { ...base, ...env } });
    return { code: 0, stdout, output: readFileSync(output, "utf8") };
  } catch (error) {
    const failure = error as { code: number; stdout: string };
    return { code: failure.code, stdout: failure.stdout, output: readFileSync(output, "utf8") };
  }
}

describe("write-ci-scope script", () => {
  it.each(["push", "workflow_dispatch"])("runs every listed job on %s, without calling gh or git", async (event) => {
    const { code, stdout, output } = await writeScope({ GITHUB_EVENT_NAME: event, CI_JOBS: "oracle,proof" });

    expect(code).toBe(0);
    expect(output).toBe("oracle=true\nproof=true\n");
    expect(stdout).toBe(`oracle : tourne (événement ${event})\nproof : tourne (événement ${event})\n`);
  });

  it("refuses a job that is not a heavy job", async () => {
    const { code, stdout, output } = await writeScope({ GITHUB_EVENT_NAME: "push", CI_JOBS: "oracle,typecheck" });

    expect(code).toBe(1);
    expect(stdout).toBe("::error::CI_JOBS : job inconnu typecheck (attendu : tests, oracle, proof, calibration, measures).\n");
    expect(output).toBe("");
  });
});
