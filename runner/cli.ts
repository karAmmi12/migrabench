// `migrabench measure --candidate <dossier>` : commande mince sur
// measureCandidate. Imprime le dossier de la mesure et son issue, et rend le
// code de sortie : 0 mesure valide, 3 mesure invalide, 4 aucune mesure écrite.
// Le code 1 reste celui d'un plantage. ORACLE_SALT impose le sel, pour le
// diagnostic seulement, comme pour `npm run oracle`. `--timeout-cap-ms`
// abaisse les délais de construction et de disponibilité, pour le diagnostic
// seulement (runner/limits.ts).
//
// `migrabench calibrate [--runs <n>]` : commande mince sur calibrateCandidate
// (runner/calibrate.ts). Imprime le fichier du résultat d'étalonnage.
import { relative } from "node:path";
import { parseArgs } from "node:util";
import { calibrateCandidate } from "./calibrate.ts";
import { measureCandidate } from "./measure.ts";

const USAGE = [
  "Usage: migrabench measure --candidate <directory> [--timeout-cap-ms <milliseconds>]",
  "       migrabench calibrate [--runs <count>]",
].join("\n");

function refuse(message: string): never {
  console.error(`refused-usage: ${message}`);
  console.error(USAGE);
  process.exit(4);
}

let parsed;
try {
  parsed = parseArgs({ allowPositionals: true, options: { candidate: { type: "string" }, "timeout-cap-ms": { type: "string" }, runs: { type: "string" } } });
} catch (error) {
  refuse((error as Error).message);
}
const { positionals, values } = parsed;

if (positionals.length === 1 && positionals[0] === "calibrate") {
  if (values.candidate !== undefined || values["timeout-cap-ms"] !== undefined) refuse("calibrate takes no --candidate nor --timeout-cap-ms");
  if (values.runs !== undefined && !/^[1-9]\d*$/.test(values.runs)) refuse("--runs must be a positive whole number");
  const { resultFile } = await calibrateCandidate(values.runs === undefined ? {} : { runs: Number(values.runs) });
  console.log();
  console.log(`Calibration: ${resultFile}`);
  console.log("The stack now runs with a calibration salt: run `npm run stack:up` before `npm test`.");
  process.exit(0);
}

if (positionals.length !== 1 || positionals[0] !== "measure" || values.candidate === undefined || values.runs !== undefined) {
  refuse("expected the measure command and --candidate, or the calibrate command");
}

// Plafond des délais, diagnostic seulement : un nombre entier de
// millisecondes, contrôlé par measureCandidate.
const timeoutCap = values["timeout-cap-ms"];
const salt = process.env.ORACLE_SALT;
const result = await measureCandidate({
  candidate: values.candidate,
  ...(salt === undefined ? {} : { salt }),
  ...(timeoutCap === undefined ? {} : { timeoutCapMs: /^\d+$/.test(timeoutCap) ? Number(timeoutCap) : Number.NaN }),
});
if (!result.written) {
  if (result.refusal === "refused-usage") refuse(result.message);
  console.error(`${result.refusal}: ${result.message}`);
  process.exit(4);
}

console.log();
console.log(`Measure: ${relative(process.cwd(), result.measureDir)}`);
console.log(`Outcome: ${result.outcome.category} (${result.outcome.reason})`);
if (salt !== undefined) console.log("Salt imposed: diagnostic measure.");
if (timeoutCap !== undefined) console.log(`Timeout cap imposed (${timeoutCap} ms): diagnostic measure.`);
console.log("The stack now runs with this measure's salt: run `npm run stack:up` before `npm test`.");
process.exitCode = result.exitCode;
