// `migrabench measure --candidate <dossier>` : commande mince sur
// measureCandidate. Imprime le dossier de la mesure et son issue, et rend le
// code de sortie : 0 mesure valide, 3 mesure invalide, 4 aucune mesure écrite.
// Le code 1 reste celui d'un plantage. ORACLE_SALT impose le sel, pour le
// diagnostic seulement, comme pour `npm run oracle`.
import { relative } from "node:path";
import { parseArgs } from "node:util";
import { measureCandidate } from "./measure.ts";

const USAGE = "Usage: migrabench measure --candidate <directory>";

function refuse(message: string): never {
  console.error(`refused-usage: ${message}`);
  console.error(USAGE);
  process.exit(4);
}

let parsed;
try {
  parsed = parseArgs({ allowPositionals: true, options: { candidate: { type: "string" } } });
} catch (error) {
  refuse((error as Error).message);
}
const { positionals, values } = parsed;
if (positionals.length !== 1 || positionals[0] !== "measure" || values.candidate === undefined) {
  refuse("expected the measure command and --candidate");
}

const salt = process.env.ORACLE_SALT;
const result = await measureCandidate({
  candidate: values.candidate,
  ...(salt === undefined ? {} : { salt }),
});
if (!result.written) refuse(result.message);

console.log();
console.log(`Measure: ${relative(process.cwd(), result.measureDir)}`);
console.log(`Outcome: ${result.outcome.category} (${result.outcome.reason})`);
if (salt !== undefined) console.log("Salt imposed: diagnostic measure.");
console.log("The stack now runs with this measure's salt: run `npm run stack:up` before `npm test`.");
process.exitCode = result.exitCode;
