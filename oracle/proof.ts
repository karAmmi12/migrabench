// Preuve du critère de fin de l'étape 2 (spec, « Critère de fin ») : les
// résultats d'un job de preuve, lus tels qu'ils sont versionnés. Rend la liste
// des manquements, vide si la preuve tient. Chaque résultat doit d'abord être
// valide (result-check.ts) ; s'y ajoute ce qui est propre à une preuve.
import type { CiRun } from "./ci-run.ts";
import type { OracleSummary } from "./collect.ts";
import { checkResult, formatViolation, type CheckedResult, type ResultEnvironment } from "./result-check.ts";

// Scénarios de l'oracle (spec de l'étape 2, « Solution »).
export const SCENARIOS = 38;
// Exécutions complètes consécutives du job de preuve.
export const EXECUTIONS = 5;

// Environnement que les exécutions de preuve partagent : images construites une
// seule fois, même commit, même outillage, même horloge figée.
const SHARED = ["benchCommit", "node", "chromium", "playwright", "frozenDate", "images.legacy", "images.archive"] as const;

// Ce que la vérification lit d'un résultat de l'oracle.
export interface ProofResult extends CheckedResult {
  config: { metadata: Record<string, unknown> & { ciRun?: CiRun; summary?: Partial<OracleSummary> } };
}

// Un résultat et le fichier qui le porte, que citent les manquements.
export interface ProofInput {
  file: string;
  result: ProofResult;
}

export function checkProof(inputs: readonly ProofInput[], environment: ResultEnvironment): string[] {
  const problems: string[] = [];
  if (inputs.length !== EXECUTIONS) problems.push(`expected ${EXECUTIONS} executions, got ${inputs.length}`);
  for (const { file, result } of inputs) {
    problems.push(...checkResult(result, environment).map((violation) => formatViolation(file, violation)));
    const { metadata } = result.config;
    if (metadata.ciRun === undefined) problems.push(`${file}: no ciRun`);
    const { scenarios, passed, failed, unreached } = metadata.summary ?? {};
    if (scenarios !== SCENARIOS || passed !== SCENARIOS || unreached !== 0) {
      problems.push(
        `${file}: ${passed} passed, ${failed} failed, ${unreached} unreached out of ${scenarios} scenarios, expected ${SCENARIOS} passed out of ${SCENARIOS}`,
      );
    }
  }
  const results = inputs.map(({ result }) => result);
  if (results.length === EXECUTIONS && !ranksOfOneCiRun(results)) problems.push(`ranks are not 1 to ${EXECUTIONS} of one CI run`);
  for (const key of SHARED) {
    const values = results.map(({ config }) => valueAt(config.metadata, key));
    if (values.some((value) => value === undefined || value === null || value === "")) problems.push(`${key} is missing`);
    else if (new Set(values).size > 1) problems.push(`${key} differs between executions`);
  }
  // Chaque exécution tire son propre sel.
  if (new Set(results.map(({ config }) => config.metadata.salt)).size !== results.length) problems.push("salts are not all different");
  return problems;
}

// Mêmes identifiant et tentative d'exécution de CI, rangs 1 à EXECUTIONS chacun une fois.
function ranksOfOneCiRun(results: readonly ProofResult[]): boolean {
  const runs = results.map(({ config }) => config.metadata.ciRun);
  const first = runs[0];
  if (first === undefined) return false;
  const sameRun = runs.every((run) => run?.runId === first.runId && run.attempt === first.attempt);
  const ranks = new Set(runs.map((run) => run?.rank));
  return sameRun && Array.from({ length: EXECUTIONS }, (_, index) => index + 1).every((rank) => ranks.has(rank));
}

// « images.legacy » → metadata.images.legacy
function valueAt(metadata: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined), metadata);
}
