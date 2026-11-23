// Décision de lancer ou non un job lourd de CI (tests, oracle, proof), #76.

export const HEAVY_JOBS = ["tests", "oracle", "proof"] as const;
export type HeavyJob = (typeof HEAVY_JOBS)[number];

export type WorkflowRun = { id: number; headSha: string; createdAt: string };
export type JobResult = { name: string; conclusion: string | null };

// Historique de la PR : exécutions terminées du workflow, jobs d'une exécution,
// et l'état Git de la tête.
export interface History {
  completedWorkflowRuns(): Promise<WorkflowRun[]>;
  jobs(runId: number): Promise<JobResult[]>;
  isAncestorOfHead(sha: string): Promise<boolean>;
  changedSince(sha: string): Promise<string[]>;
}

export type Context = { event: string; prFiles: string[] };
export type Decision = { run: boolean; reason: string };

// Ce que prouve le job proof : l'oracle, le legacy, la pile et les résultats versionnés.
const PROOF_PATHS = ["oracle/", "fixtures/legacy-app/", "docker-compose.yml", "results/oracle/"];

function touches(files: string[], paths: string[]): boolean {
  return files.some((file) => paths.some((path) => (path.endsWith("/") ? file.startsWith(path) : file === path)));
}

async function lastSuccess(job: HeavyJob, history: History): Promise<string | null> {
  const runs = (await history.completedWorkflowRuns()).toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const run of runs) {
    const jobs = await history.jobs(run.id);
    const succeeded = jobs.some((result) => result.name === job && result.conclusion === "success");
    if (succeeded && (await history.isAncestorOfHead(run.headSha))) return run.headSha;
  }
  return null;
}

export async function shouldRun(job: HeavyJob, context: Context, history: History): Promise<Decision> {
  if (context.event !== "pull_request") {
    return { run: true, reason: `événement ${context.event}` };
  }
  if (job === "proof" && !touches(context.prFiles, PROOF_PATHS)) {
    return { run: false, reason: `la PR ne touche aucun de ${PROOF_PATHS.join(", ")}` };
  }
  const reference = await lastSuccess(job, history);
  if (reference === null) {
    return { run: true, reason: `${job} n'a réussi sur aucun commit de la PR ancêtre de la tête` };
  }
  const since = `depuis ${reference}, où ${job} a réussi`;
  const changed = await history.changedSince(reference);
  if (changed.length === 0) {
    // Relance sur le commit même du succès : c'est une demande explicite.
    return { run: true, reason: `rien n'a changé ${since} : relance` };
  }
  if (changed.every((file) => file.startsWith("docs/"))) {
    return { run: false, reason: `seul docs/** a changé ${since}` };
  }
  return { run: true, reason: `des fichiers hors docs/** ont changé ${since}` };
}
