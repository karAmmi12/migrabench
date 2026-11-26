// Décision de lancer ou non un job lourd de CI (tests, oracle, proof,
// calibration, measures), #76, #72 et #74.

export const HEAVY_JOBS = ["tests", "oracle", "proof", "calibration", "measures"] as const;
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

// Jobs qui ne tournent que sur une PR qui touche leurs chemins.
const JOB_PATHS: Partial<Record<HeavyJob, string[]>> = {
  // Ce que prouve le job proof : l'oracle, le legacy, la pile et les résultats versionnés.
  proof: ["oracle/", "fixtures/legacy-app/", "docker-compose.yml", "results/oracle/"],
  // Ce qui fait les relevés de l'étalonnage (#72) : le candidat d'étalonnage,
  // l'image d'exécution, sa construction et son démarrage, son contrat, le
  // relevé des ressources, et le workflow lui-même. Pas results/calibration/ :
  // versionner un résultat ne doit pas en produire un autre.
  calibration: [
    "fixtures/calibration-candidate/",
    "fixtures/runtime-image/",
    "runner/build.ts",
    "runner/calibrate.ts",
    "runner/calibration.ts",
    "runner/candidate-runtime.ts",
    "runner/contract.ts",
    "runner/contract-phase.ts",
    "runner/resource-usage.ts",
    ".github/workflows/calibration.yml",
  ],
  // Ce que le job des mesures exécute (#74) : le workflow, ses scripts, les
  // candidats défectueux et conformes (#124), et la pile cassée. Pas runner/ :
  // ses changements sont couverts par Vitest, et le job dure une vingtaine de minutes ; il se lance
  // à la main (workflow_dispatch) pour la mesure comptée sur main.
  measures: [
    ".github/workflows/measures.yml",
    "scripts/measure-cases.ts",
    "scripts/measure-process.ts",
    "scripts/run-measure-case.ts",
    "scripts/interrupt-measure.ts",
    "scripts/start-report.ts",
    "fixtures/defective-candidates/",
    "fixtures/conforming-candidates/",
    "tests/fixtures/broken-stack/",
  ],
};

// Jobs dont seuls les propres chemins comptent depuis leur dernier succès,
// et pas tout ce qui n'est pas docs/** : versionner un résultat d'étalonnage
// (results/calibration/) ne doit pas relancer l'étalonnage (#72).
const ONLY_OWN_PATHS_SINCE_SUCCESS: ReadonlySet<HeavyJob> = new Set(["calibration", "measures"]);

function touches(files: string[], paths: string[]): boolean {
  return files.some((file) => paths.some((path) => (path.endsWith("/") ? file.startsWith(path) : file === path)));
}

// Au moins un fichier, tous sous docs/ : un diff vide n'est pas « docs seul ».
function onlyDocs(files: string[]): boolean {
  return files.length > 0 && files.every((file) => file.startsWith("docs/"));
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
  const paths = JOB_PATHS[job];
  if (paths !== undefined && !touches(context.prFiles, paths)) {
    return { run: false, reason: `la PR ne touche aucun de ${paths.join(", ")}` };
  }
  // #83 : le code du commit de fusion est alors celui de la base.
  if (onlyDocs(context.prFiles)) {
    return { run: false, reason: "la PR ne touche que docs/**" };
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
  if (onlyDocs(changed)) {
    return { run: false, reason: `seul docs/** a changé ${since}` };
  }
  if (paths !== undefined && ONLY_OWN_PATHS_SINCE_SUCCESS.has(job) && !touches(changed, paths)) {
    return { run: false, reason: `aucun de ses chemins n'a changé ${since}` };
  }
  return { run: true, reason: `des fichiers hors docs/** ont changé ${since}` };
}
