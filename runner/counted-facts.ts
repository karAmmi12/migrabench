// Faits Git d'une mesure prévue pour compter (#73) : le runner fait lui-même
// le `git fetch` de origin/main (récit 13), pour ne pas dépendre d'une copie
// locale périmée. Les conditions sont jugées par runner/counted.ts.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GIT_STATUS_ARGS, worktreeState } from "../oracle/worktree.ts";
import type { CountedFacts } from "./counted.ts";

const execFileAsync = promisify(execFile);

// Délai de chaque commande Git : un fetch qui ne répond pas devient un fetch
// manqué, nommé dans le refus.
const GIT_TIMEOUT_MS = 60_000;

export type CountedGitFacts = Pick<CountedFacts, "worktreeClean" | "originMain" | "headReachable">;

export async function countedGitFacts(cwd: string): Promise<CountedGitFacts> {
  const git = (...args: string[]) => execFileAsync("git", args, { cwd, encoding: "utf8", timeout: GIT_TIMEOUT_MS });
  const worktreeClean = worktreeState((await git(...GIT_STATUS_ARGS)).stdout) === "clean";
  let originMain: string | undefined;
  try {
    await git("fetch", "--quiet", "origin", "+refs/heads/main:refs/remotes/origin/main");
    originMain = (await git("rev-parse", "--verify", "refs/remotes/origin/main^{commit}")).stdout.trim();
  } catch {
    return { worktreeClean, originMain: undefined, headReachable: false };
  }
  let headReachable = true;
  try {
    await git("merge-base", "--is-ancestor", "HEAD", originMain);
  } catch {
    headReachable = false;
  }
  return { worktreeClean, originMain, headReachable };
}
