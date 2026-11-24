// Faits Git d'une mesure prévue pour compter (#73) : relevés dans un vrai dépôt
// temporaire, dont `origin` est un dépôt nu local. Le `git fetch` reste sur la
// machine : ni réseau, ni références du dépôt du banc touchées.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countedGitFacts } from "../../runner/counted-facts.ts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();
}

function commit(cwd: string, file: string): string {
  writeFileSync(join(cwd, file), file);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", file);
  return git(cwd, "rev-parse", "HEAD");
}

// Un dépôt nu `origin` avec un commit sur main, et un clone publié.
function published(): { origin: string; clone: string; head: string } {
  const base = mkdtempSync(join(tmpdir(), "mb-counted-"));
  const origin = join(base, "origin.git");
  git(base, "init", "-q", "--bare", "--initial-branch=main", origin);
  const clone = join(base, "clone");
  git(base, "clone", "-q", origin, clone);
  git(clone, "checkout", "-q", "-b", "main");
  const head = commit(clone, "a.txt");
  git(clone, "push", "-q", "origin", "main");
  return { origin, clone, head };
}

describe("git facts of a measure planned to count", () => {
  it("are those of a published state: clean worktree, origin/main fetched, HEAD reachable", async () => {
    const { clone, head } = published();

    expect(await countedGitFacts(clone)).toEqual({ worktreeClean: true, originMain: head, headReachable: true });
  });

  it("see a modified worktree", async () => {
    const { clone } = published();
    writeFileSync(join(clone, "a.txt"), "changed");

    expect((await countedGitFacts(clone)).worktreeClean).toBe(false);
  });

  it("keep the worktree clean with a new, untracked counted measure", async () => {
    const { clone } = published();
    mkdirSync(join(clone, "results", "counted", "20261124T150000Z-abc1234-reference-candidate"), { recursive: true });
    writeFileSync(join(clone, "results", "counted", "20261124T150000Z-abc1234-reference-candidate", "measure.json"), "{}");

    expect((await countedGitFacts(clone)).worktreeClean).toBe(true);
  });

  it("see a HEAD that origin/main does not contain", async () => {
    const { clone, head } = published();
    commit(clone, "unpublished.txt");

    expect(await countedGitFacts(clone)).toEqual({ worktreeClean: true, originMain: head, headReachable: false });
  });

  it("fetch origin/main first: a HEAD behind it is reachable, and origin/main is the fetched commit", async () => {
    const { origin, clone, head } = published();
    const other = join(mkdtempSync(join(tmpdir(), "mb-counted-other-")), "other");
    git(tmpdir(), "clone", "-q", origin, other);
    const newer = commit(other, "b.txt");
    git(other, "push", "-q", "origin", "main");

    const facts = await countedGitFacts(clone);

    expect(newer).not.toBe(head);
    expect(facts).toEqual({ worktreeClean: true, originMain: newer, headReachable: true });
  });

  it("give no origin/main when the fetch fails", async () => {
    const { clone } = published();
    git(clone, "remote", "set-url", "origin", join(tmpdir(), "mb-no-such-origin.git"));

    expect(await countedGitFacts(clone)).toEqual({ worktreeClean: true, originMain: undefined, headReachable: false });
  });
});
