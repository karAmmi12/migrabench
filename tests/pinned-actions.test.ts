// Contrôle de CI : chaque action d'un workflow est épinglée sur un SHA de
// commit complet, suivi de sa version en commentaire (#22).
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = new URL("../scripts/check-pinned-actions.sh", import.meta.url).pathname;

type Outcome = { code: number; stdout: string };

async function check(dir: string): Promise<Outcome> {
  try {
    const { stdout } = await execFileAsync("bash", [script, dir]);
    return { code: 0, stdout };
  } catch (error) {
    const failure = error as { code: number; stdout: string };
    return { code: failure.code, stdout: failure.stdout };
  }
}

function workflows(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "mb-workflows-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

function job(...uses: string[]): string {
  return [
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-24.04",
    "    steps:",
    ...uses.map((ref) => `      - uses: ${ref}`),
    "",
  ].join("\n");
}

describe("pinned actions check", () => {
  it("refuses an action pinned on a version tag, naming file and line", async () => {
    const dir = workflows({ "ci.yml": job("actions/checkout@v4") });

    const { code, stdout } = await check(dir);

    expect(code).toBe(1);
    expect(stdout).toContain(`::error file=${join(dir, "ci.yml")},line=5::`);
    expect(stdout).toContain("actions/checkout@v4");
    expect(stdout).toContain("docs/agents/pinned-actions.md");
  });

  it.each([
    ["a SHA without its version comment", "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"],
    ["a short SHA", "actions/checkout@3d3c42e # v7.0.1"],
  ])("refuses %s", async (_case, ref) => {
    const { code } = await check(workflows({ "ci.yml": job(ref) }));

    expect(code).toBe(1);
  });

  it("accepts the repository's own workflows", async () => {
    const { code, stdout } = await check(new URL("../.github/workflows", import.meta.url).pathname);

    expect(stdout).toBe("");
    expect(code).toBe(0);
  });

  it("accepts an action pinned on a full commit SHA with its version", async () => {
    const dir = workflows({
      "ci.yml": job("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1"),
    });

    const { code, stdout } = await check(dir);

    expect(code).toBe(0);
    expect(stdout).toBe("");
  });
});
