// `npm run oracle` : commande mince sur executeOracle. BASE_URL désigne le front
// à mesurer (le legacy par défaut) ; ORACLE_SALT impose le sel, pour le
// diagnostic seulement. Code de sortie non nul si un scénario n'a pas réussi.
import { relative } from "node:path";
import { closingLines } from "./closing-lines.ts";
import { DEFAULT_BASE_URL, executeOracle } from "./execute.ts";

const salt = process.env.ORACLE_SALT;
const { resultFile, summary, errors } = await executeOracle({
  baseUrl: process.env.BASE_URL ?? DEFAULT_BASE_URL,
  ...(salt === undefined ? {} : { salt }),
});

for (const line of closingLines({
  resultFile: relative(process.cwd(), resultFile),
  summary,
  saltImposed: salt !== undefined,
})) {
  console.log(line);
}

const allPassed = errors === 0 && summary.scenarios > 0 && summary.passed === summary.scenarios;
process.exitCode = allPassed ? 0 : 1;
