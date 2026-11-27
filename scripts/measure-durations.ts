// Durées des jobs de mesures du workflow « Mesures » (#163) : les mesures
// tournent en plusieurs jobs parallèles, chacun sous son délai. Le résumé du
// job `measures` donne la durée de chacun, leur somme et le plus long.
// Pur : la réponse de l'API est lue par scripts/write-measure-durations.ts.

export type JobTiming = { name: string; conclusion: string | null; startedAt: string; completedAt: string | null };

export interface MeasureDurations {
  jobs: { name: string; seconds: number; conclusion: string | null }[];
  // Somme des durées des jobs : les minutes de runner consommées.
  totalSeconds: number;
  longest: { name: string; seconds: number };
  // Du premier départ à la dernière fin.
  spanSeconds: number;
  // Jobs qui n'ont pas réussi : le job `measures` échoue s'il y en a un.
  unsuccessful: string[];
}

// Réponse de `GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{n}/jobs`.
export function parseJobTimings(response: unknown): JobTiming[] {
  const jobs = (response as Record<string, unknown> | null)?.jobs;
  if (!Array.isArray(jobs)) throw new Error(`Réponse de l'API sans liste jobs : ${JSON.stringify(response)}`);
  return (jobs as Record<string, unknown>[]).map((job) => ({
    name: job.name as string,
    conclusion: job.conclusion as string | null,
    startedAt: job.started_at as string,
    completedAt: job.completed_at as string | null,
  }));
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes === 0 ? `${seconds} s` : `${minutes} min ${seconds % 60} s`;
}

const seconds = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 1000;

export function measureDurations(all: JobTiming[], isMeasureJob: (name: string) => boolean): MeasureDurations {
  const selected = all.filter((job) => isMeasureJob(job.name));
  if (selected.length === 0) throw new Error(`no measure job among: ${all.map((job) => job.name).join(", ")}`);
  const ended = selected.map((job) => {
    if (job.completedAt === null) throw new Error(`The measure job ${job.name} has not ended`);
    return { ...job, completedAt: job.completedAt };
  });
  const jobs = ended.map((job) => ({ name: job.name, seconds: seconds(job.startedAt, job.completedAt), conclusion: job.conclusion }));
  const longest = jobs.reduce((max, job) => (job.seconds > max.seconds ? job : max));
  const firstStart = ended.map((job) => job.startedAt).toSorted()[0]!;
  const lastEnd = ended.map((job) => job.completedAt).toSorted().at(-1)!;
  return {
    jobs,
    totalSeconds: jobs.reduce((sum, job) => sum + job.seconds, 0),
    longest: { name: longest.name, seconds: longest.seconds },
    spanSeconds: seconds(firstStart, lastEnd),
    unsuccessful: jobs.filter((job) => job.conclusion !== "success").map((job) => job.name),
  };
}

export function durationsSummary({ jobs, totalSeconds, longest, spanSeconds }: MeasureDurations): string {
  return [
    "## Durées des jobs de mesures",
    "",
    "| Job | Durée | Conclusion |",
    "|---|---|---|",
    ...jobs.map((job) => `| ${job.name} | ${formatDuration(job.seconds)} | ${job.conclusion ?? "—"} |`),
    "",
    `- Durée totale (somme des jobs) : ${formatDuration(totalSeconds)}`,
    `- Plus long job : ${longest.name}, ${formatDuration(longest.seconds)}`,
    `- Du premier départ à la dernière fin : ${formatDuration(spanSeconds)}`,
    "",
  ].join("\n");
}
