// `migrabench measure --candidate <dossier>` : commande mince sur
// measureCandidate. Imprime le dossier de la mesure et son issue, et rend le
// code de sortie : 0 mesure valide, 3 mesure invalide, 4 aucune mesure écrite.
// Le code 1 reste celui d'un plantage. ORACLE_SALT impose le sel, pour le
// diagnostic seulement, comme pour `npm run oracle`. `--timeout-cap-ms`
// abaisse les délais de construction et de disponibilité, pour le diagnostic
// seulement (runner/limits.ts). `--counted` prévoit la mesure pour compter
// (#73) : refusée hors d'un état publié, écrite sous results/counted/.
// SIGINT ou SIGTERM pendant la mesure l'interrompt : mesure invalide,
// `interrupted`, code 3 (#71).
//
// `migrabench calibrate [--readings <n>]` : commande mince sur calibrateCandidate
// (runner/calibrate.ts). Imprime le fichier du résultat d'étalonnage.
import { relative } from "node:path";
import { parseArgs } from "node:util";
import { acquireBenchLockOrExit } from "../shared/bench-lock.ts";
import { calibrateCandidate } from "./calibrate.ts";
import { measureCandidate } from "./measure.ts";

const USAGE = [
  "Usage: migrabench measure --candidate <directory> [--counted] [--timeout-cap-ms <milliseconds>]",
  "       migrabench calibrate [--readings <count>]",
].join("\n");

function refuse(message: string): never {
  console.error(`refused-usage: ${message}`);
  console.error(USAGE);
  process.exit(4);
}

let parsed;
try {
  parsed = parseArgs({ allowPositionals: true, options: { candidate: { type: "string" }, counted: { type: "boolean" }, "timeout-cap-ms": { type: "string" }, readings: { type: "string" } } });
} catch (error) {
  refuse((error as Error).message);
}
const { positionals, values } = parsed;

if (positionals.length === 1 && positionals[0] === "calibrate") {
  if (values.candidate !== undefined || values["timeout-cap-ms"] !== undefined || values.counted !== undefined) {
    refuse("calibrate takes no --candidate, --counted nor --timeout-cap-ms");
  }
  if (values.readings !== undefined && !/^[1-9]\d*$/.test(values.readings)) refuse("--readings must be a positive whole number");
  // L'étalonnage recrée la pile : il tient le verrou du banc, comme une mesure.
  const lock = acquireBenchLockOrExit({ tool: "calibrate" });
  let resultFile: string;
  try {
    ({ resultFile } = await calibrateCandidate(values.readings === undefined ? {} : { readings: Number(values.readings) }));
  } finally {
    lock.release();
  }
  console.log();
  console.log(`Calibration: ${resultFile}`);
  console.log("The stack now runs with a calibration salt: run `npm run stack:up` before `npm test`.");
  process.exit(0);
}

if (positionals.length !== 1 || positionals[0] !== "measure" || values.candidate === undefined || values.readings !== undefined) {
  refuse("expected the measure command and --candidate, or the calibrate command");
}

// Plafond des délais, diagnostic seulement : un nombre entier de
// millisecondes, contrôlé par measureCandidate.
const timeoutCap = values["timeout-cap-ms"];
const salt = process.env.ORACLE_SALT;
const result = await measureCandidate({
  candidate: values.candidate,
  counted: values.counted === true,
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
console.log(values.counted === true ? "Planned to count: written under results/counted/, to be versioned." : "Diagnostic measure.");
if (salt !== undefined) console.log("Salt imposed: diagnostic measure.");
if (timeoutCap !== undefined) console.log(`Timeout cap imposed (${timeoutCap} ms): diagnostic measure.`);
console.log("The stack now runs with this measure's salt: run `npm run stack:up` before `npm test`.");
// Mesure interrompue (#71) : une commande arrêtée qui tarderait à finir ne
// retient pas le processus.
if (result.outcome.reason === "interrupted") process.exit(result.exitCode);
process.exitCode = result.exitCode;
