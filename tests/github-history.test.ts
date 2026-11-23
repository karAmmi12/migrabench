// Adaptateur de l'historique de la PR sur l'API GitHub (#76), vérifié sur des
// réponses réelles enregistrées (tests/fixtures/github-api/README.md).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changedFiles, parseJobs, parseWorkflowRuns } from "../scripts/github-history.ts";

function recorded(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/github-api/${name}`, import.meta.url), "utf8"));
}

describe("parseWorkflowRuns", () => {
  it("reads id, head commit and creation date of each completed run", () => {
    expect(parseWorkflowRuns(recorded("oracle-runs-pr75.json"))).toEqual([
      { id: 45203285639, headSha: "2f0f0349a027c612f4807a185613e874cbaa1a1e", createdAt: "2026-11-23T15:15:59Z" },
      { id: 45201392534, headSha: expect.stringMatching(/^d14909c[0-9a-f]{33}$/), createdAt: "2026-11-23T15:06:05Z" },
    ]);
  });

  it("refuses a response that is not a list of workflow runs", () => {
    expect(() => parseWorkflowRuns({ message: "Not Found" })).toThrow(/workflow_runs/);
  });
});

describe("parseJobs", () => {
  it("reads name and conclusion of each job of a run", () => {
    expect(parseJobs(recorded("oracle-jobs-run45203285639.json"))).toEqual([
      { name: "oracle", conclusion: "success" },
      { name: "proof", conclusion: "success" },
    ]);
  });

  it("refuses a response that is not a list of jobs", () => {
    expect(() => parseJobs({ message: "Not Found" })).toThrow(/jobs/);
  });
});

// Sur un vrai dépôt Git : un faux historique ne reproduirait pas la détection
// des renommages de git diff.
describe("changedFiles", () => {
  function git(cwd: string, ...args: string[]): string {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  }

  function repository(): string {
    const cwd = mkdtempSync(join(tmpdir(), "mb-git-"));
    git(cwd, "init", "--quiet");
    git(cwd, "config", "user.name", "test");
    git(cwd, "config", "user.email", "test@example.invalid");
    return cwd;
  }

  function commit(cwd: string): string {
    git(cwd, "add", "--all");
    git(cwd, "commit", "--quiet", "--message", "test");
    return git(cwd, "rev-parse", "HEAD");
  }

  it("lists both paths of a file moved into docs/, so that moving code away is not a docs-only change", async () => {
    const cwd = repository();
    mkdirSync(join(cwd, "runner"));
    writeFileSync(join(cwd, "runner/x.ts"), "export const x = 1;\n".repeat(20));
    const before = commit(cwd);
    mkdirSync(join(cwd, "docs"));
    git(cwd, "mv", "runner/x.ts", "docs/x.ts");
    const after = commit(cwd);

    expect((await changedFiles(`${before}..${after}`, cwd)).toSorted()).toEqual(["docs/x.ts", "runner/x.ts"]);
  });
});
