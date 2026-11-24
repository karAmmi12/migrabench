// `npm run start-report:check -- probe <start.log> --marker <marqueur>` ou
// `npm run start-report:check -- reference <start.log>` : vérifie le constat
// de démarrage d'une mesure du candidat défectueux 5 « sonde d'isolation » ou
// du candidat de référence (scripts/start-report.ts, #66). Lancé sur le brut
// `start.log` d'une mesure réelle, en local ou en CI (#74). Pour la sonde, le
// marqueur est celui de la mesure, lu dans son measure.json : la sonde ne doit
// pas le trouver dans son environnement.
// Code de sortie non nul si le constat ne tient pas.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { probeReportProblems, referenceReportProblems } from "./start-report.ts";

const USAGE = "Usage: npm run start-report:check -- probe <start.log> --marker <marker>\n       npm run start-report:check -- reference <start.log>";

function usage(): never {
  console.error(USAGE);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({ allowPositionals: true, options: { marker: { type: "string" } } });
} catch {
  usage();
}
const { positionals, values } = parsed;
const [kind, file] = positionals;
if (positionals.length !== 2 || file === undefined) usage();

let problems: string[];
if (kind === "probe") {
  if (values.marker === undefined) usage();
  problems = probeReportProblems(values.marker, readFileSync(file, "utf8"));
} else if (kind === "reference") {
  if (values.marker !== undefined) usage();
  problems = referenceReportProblems(readFileSync(file, "utf8"));
} else {
  usage();
}
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
console.log(`Start report of the ${kind} candidate holds: ${file}`);
