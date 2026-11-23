// Historique d'une PR (History de ci-scope.ts) lu sur l'API GitHub avec gh, et
// dans le dépôt Git du job (#76). Format des réponses vérifié sur des réponses
// réelles enregistrées : tests/fixtures/github-api/.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { History, JobResult, WorkflowRun } from "./ci-scope.ts";

const execFileAsync = promisify(execFile);

function listOf(response: unknown, key: string): Record<string, unknown>[] {
  const list = (response as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(list)) throw new Error(`Réponse de l'API sans liste ${key} : ${JSON.stringify(response)}`);
  return list as Record<string, unknown>[];
}

// Exécutions terminées seulement. Le filtre status=completed de l'API n'est pas
// fiable : sur la PR #79, il a écarté les 2 exécutions « Oracle », pourtant
// terminées (tests/fixtures/github-api/oracle-runs-pr79-*.json).
export function parseWorkflowRuns(response: unknown): WorkflowRun[] {
  return listOf(response, "workflow_runs")
    .filter((run) => run.status === "completed")
    .map((run) => ({
    id: run.id as number,
    headSha: run.head_sha as string,
    createdAt: run.created_at as string,
  }));
}

export function parseJobs(response: unknown): JobResult[] {
  return listOf(response, "jobs").map((job) => ({
    name: job.name as string,
    conclusion: job.conclusion as string | null,
  }));
}

// Fichiers changés sur une plage de git diff (a..b, ou a...b depuis la base
// commune). --no-renames : un fichier déplacé donne ses deux chemins, sinon
// déplacer du code sous docs/ passerait pour un changement de docs/** seul.
export async function changedFiles(range: string, cwd = process.cwd()): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["diff", "--name-only", "--no-renames", range], { cwd });
  return stdout.split("\n").filter((line) => line !== "");
}

async function api(path: string): Promise<unknown> {
  const { stdout } = await execFileAsync("gh", ["api", path], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
}

export type PullRequest = {
  repository: string; // owner/repo
  workflow: string; // fichier du workflow, par exemple oracle.yml
  headRef: string; // branche de la PR
  headSha: string;
};

// Une page de 100 exécutions, les plus récentes d'abord : au-delà, la référence
// la plus ancienne manque et le job tourne, ce qui reste sûr.
export function githubHistory(pr: PullRequest): History {
  return {
    async completedWorkflowRuns() {
      const query = new URLSearchParams({ event: "pull_request", branch: pr.headRef, per_page: "100" });
      return parseWorkflowRuns(await api(`repos/${pr.repository}/actions/workflows/${pr.workflow}/runs?${query}`));
    },
    // Par défaut, l'API rend la dernière tentative de chaque job.
    async jobs(runId) {
      return parseJobs(await api(`repos/${pr.repository}/actions/runs/${runId}/jobs?per_page=100`));
    },
    // Code 1 : pas un ancêtre. Autre code (commit absent après un force-push) :
    // non plus.
    async isAncestorOfHead(sha) {
      try {
        await execFileAsync("git", ["merge-base", "--is-ancestor", sha, pr.headSha]);
        return true;
      } catch {
        return false;
      }
    },
    changedSince: (sha) => changedFiles(`${sha}..${pr.headSha}`),
  };
}
