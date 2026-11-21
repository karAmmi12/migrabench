// `npm run oracle` : commande mince sur runOracle. BASE_URL désigne le front
// à mesurer (le legacy par défaut) ; ORACLE_SALT impose le sel, pour le
// diagnostic seulement. Code de sortie non nul si un scénario n'a pas réussi.
import { relative } from "node:path";
import { DEFAULT_BASE_URL, runOracle } from "./run.ts";

const salt = process.env.ORACLE_SALT;
const { resultFile, summary, errors } = await runOracle({
  baseUrl: process.env.BASE_URL ?? DEFAULT_BASE_URL,
  ...(salt === undefined ? {} : { salt }),
});

console.log(`\nResult: ${relative(process.cwd(), resultFile)}`);
console.log(
  `Scenarios: ${summary.scenarios}, passed: ${summary.passed}, failed: ${summary.failed}, unreached: ${summary.unreached}`,
);
if (salt !== undefined) console.log("Salt imposed: diagnostic run, not a measurement.");

const allPassed = errors === 0 && summary.scenarios > 0 && summary.passed === summary.scenarios;
process.exitCode = allPassed ? 0 : 1;
