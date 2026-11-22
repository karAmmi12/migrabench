// Exécution de CI d'une exécution complète (`ciRun`, spec de l'étape 2,
// « Résultat JSON ») et nom du fichier de résultat qui la porte (#39). Le job
// de preuve lance l'oracle 5 fois dans la même exécution de CI : le rang
// (ORACLE_CI_RANK, 1 par défaut) distingue ses exécutions complètes.

export interface CiRun {
  // Identifiant de l'exécution de GitHub Actions (GITHUB_RUN_ID).
  runId: string;
  // Tentative de cette exécution (GITHUB_RUN_ATTEMPT) : une relance garde le même identifiant.
  attempt: number;
  // Rang de l'exécution complète dans le job.
  rank: number;
}

export const CI_RANK_ENV = "ORACLE_CI_RANK";

type Env = Readonly<Record<string, string | undefined>>;

export function ciRunOf(env: Env): CiRun | undefined {
  if (env.GITHUB_ACTIONS !== "true") return undefined;
  const runId = env.GITHUB_RUN_ID;
  if (runId === undefined || !/^\d+$/.test(runId)) throw new Error(`GITHUB_RUN_ID is not a run identifier: ${runId}`);
  return {
    runId,
    attempt: positiveInteger("GITHUB_RUN_ATTEMPT", env.GITHUB_RUN_ATTEMPT ?? "1"),
    rank: positiveInteger(CI_RANK_ENV, env[CI_RANK_ENV] ?? "1"),
  };
}

// <horodatage>-<commit court>[-ci<identifiant>.<tentative>-<rang>].json
export function resultFileName(startedAt: Date, benchCommit: string, ciRun?: CiRun): string {
  const ci = ciRun === undefined ? "" : `-ci${ciRun.runId}.${ciRun.attempt}-${ciRun.rank}`;
  return `${timestamp(startedAt)}-${benchCommit.slice(0, 7)}${ci}.json`;
}

// 2026-11-21T15:40:12.345Z → 20261121T154012Z
export function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function positiveInteger(name: string, value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} is not a positive integer: ${value}`);
  return Number(value);
}
