// Job « changes » des workflows « Tests du banc », « Oracle » et « Étalonnage »
// (#76, #72) : écrit dans GITHUB_OUTPUT, pour chaque job lourd listé dans
// CI_JOBS (séparés par des virgules), `<job>=true` s'il doit tourner,
// `<job>=false` sinon. Règle :
// scripts/ci-scope.ts. Hors pull_request, n'appelle ni gh ni git.
//
// Le reste vient de l'environnement des Actions : GITHUB_EVENT_NAME,
// GITHUB_EVENT_PATH (commits de tête et de base de la PR), GITHUB_REPOSITORY,
// GITHUB_HEAD_REF, GITHUB_WORKFLOW_REF (fichier du workflow). gh lit GH_TOKEN.
import { appendFileSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { HEAVY_JOBS, shouldRun, type Context, type HeavyJob, type History } from "./ci-scope.ts";
import { githubHistory, pullRequestFiles } from "./github-history.ts";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

function heavyJobs(list: string): HeavyJob[] | null {
  const jobs = list.split(",").map((job) => job.trim());
  const unknown = jobs.find((job) => !(HEAVY_JOBS as readonly string[]).includes(job));
  if (unknown !== undefined) {
    console.log(`::error::CI_JOBS : job inconnu ${unknown} (attendu : ${HEAVY_JOBS.join(", ")}).`);
    return null;
  }
  return jobs as HeavyJob[];
}

// Contexte et historique de la PR ; hors PR, un historique qui n'est jamais lu.
async function scope(event: string): Promise<{ context: Context; history: History }> {
  if (event !== "pull_request") {
    const unread = () => Promise.reject(new Error(`historique lu hors pull_request (${event})`));
    return {
      context: { event, prFiles: [] },
      history: { completedWorkflowRuns: unread, jobs: unread, isAncestorOfHead: unread, changedSince: unread },
    };
  }
  const payload = JSON.parse(readFileSync(env("GITHUB_EVENT_PATH"), "utf8"));
  const headSha: string = payload.pull_request.head.sha;
  const baseSha: string = payload.pull_request.base.sha;
  const prFiles = await pullRequestFiles(baseSha, headSha);
  return {
    context: { event, prFiles },
    history: githubHistory({
      repository: env("GITHUB_REPOSITORY"),
      workflow: basename(env("GITHUB_WORKFLOW_REF").split("@")[0]!),
      headRef: env("GITHUB_HEAD_REF"),
      headSha,
    }),
  };
}

const jobs = heavyJobs(env("CI_JOBS"));
if (jobs === null) {
  process.exitCode = 1;
} else {
  const { context, history } = await scope(env("GITHUB_EVENT_NAME"));
  for (const job of jobs) {
    const decision = await shouldRun(job, context, history);
    console.log(`${job} : ${decision.run ? "tourne" : "ignoré"} (${decision.reason})`);
    appendFileSync(env("GITHUB_OUTPUT"), `${job}=${decision.run}\n`);
  }
}
