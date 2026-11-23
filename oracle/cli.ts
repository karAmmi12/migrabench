// `npm run oracle` : commande mince sur executeOracle. BASE_URL désigne le front
// à mesurer (le legacy par défaut) ; ORACLE_SALT impose le sel, pour le
// diagnostic seulement. Code de sortie non nul si un scénario n'a pas réussi.
// Le verrou du banc est tenu pendant toute l'exécution ; s'il est tenu par un
// autre outil du banc, refus avec le code 4.
import { relative } from "node:path";
import { acquireBenchLockOrExit } from "../shared/bench-lock.ts";
import { closingLines } from "./closing-lines.ts";
import { DEFAULT_BASE_URL, executeOracle } from "./execute.ts";

const lock = acquireBenchLockOrExit({ tool: "oracle" });
const salt = process.env.ORACLE_SALT;
let execution;
try {
  execution = await executeOracle({
    baseUrl: process.env.BASE_URL ?? DEFAULT_BASE_URL,
    ...(salt === undefined ? {} : { salt }),
  });
} finally {
  lock.release();
}
const { resultFile, summary, errors } = execution;

console.log();
for (const line of closingLines({
  resultFile: relative(process.cwd(), resultFile),
  summary,
  saltImposed: salt !== undefined,
})) {
  console.log(line);
}

const allPassed = errors === 0 && summary.scenarios > 0 && summary.passed === summary.scenarios;
process.exitCode = allPassed ? 0 : 1;
