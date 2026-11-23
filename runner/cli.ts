// `migrabench measure --candidate <dossier>` : commande mince sur
// measureCandidate. Imprime le dossier de la mesure et son issue, et rend le
// code de sortie. ORACLE_SALT impose le sel, pour le diagnostic seulement,
// comme pour `npm run oracle`.
import { relative } from "node:path";
import { parseArgs } from "node:util";
import { measureCandidate } from "./measure.ts";

const USAGE = "Usage: migrabench measure --candidate <directory>";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { candidate: { type: "string" } },
});
if (positionals.length !== 1 || positionals[0] !== "measure" || values.candidate === undefined) {
  console.error(USAGE);
  process.exit(4);
}

const salt = process.env.ORACLE_SALT;
const { measureDir, outcome, exitCode } = await measureCandidate({
  candidate: values.candidate,
  ...(salt === undefined ? {} : { salt }),
});

console.log();
console.log(`Measure: ${relative(process.cwd(), measureDir)}`);
console.log(`Outcome: ${outcome.category} (${outcome.reason})`);
if (salt !== undefined) console.log("Salt imposed: diagnostic measure.");
console.log("The stack now runs with this measure's salt: run `npm run stack:up` before `npm test`.");
process.exitCode = exitCode;
