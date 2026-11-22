// Lignes de fin de `npm run oracle`. L'oracle recrée la pile avec le sel de son
// exécution et ne la remet pas en place (décision de #46) : la dernière ligne
// rappelle de relancer `npm run stack:up` avant `npm test` (#52). Le sel n'est
// pas un paramètre, donc aucune ligne ne peut le citer.
import type { OracleSummary } from "./collect.ts";

export interface ClosingLinesInput {
  resultFile: string;
  summary: Pick<OracleSummary, "scenarios" | "passed" | "failed" | "unreached">;
  saltImposed: boolean;
}

export function closingLines({ resultFile, summary, saltImposed }: ClosingLinesInput): string[] {
  return [
    `\nResult: ${resultFile}`,
    `Scenarios: ${summary.scenarios}, passed: ${summary.passed}, failed: ${summary.failed}, unreached: ${summary.unreached}`,
    ...(saltImposed ? ["Salt imposed: diagnostic run, not a measurement."] : []),
    "The stack now runs with this run's salt: run `npm run stack:up` before `npm test`.",
  ];
}
