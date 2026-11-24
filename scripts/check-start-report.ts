// `npm run start-report:check -- <probe|reference> <start.log>` : vérifie le
// constat de démarrage d'une mesure du candidat défectueux 5 « sonde
// d'isolation » ou du candidat de référence (scripts/start-report.ts, #66).
// Lancé sur le brut `start.log` d'une mesure réelle, en local ou en CI (#74).
// Code de sortie non nul si le constat ne tient pas.
import { readFileSync } from "node:fs";
import { probeReportProblems, referenceReportProblems } from "./start-report.ts";

const CHECKS = { probe: probeReportProblems, reference: referenceReportProblems };
const [kind, file] = process.argv.slice(2);
if (kind === undefined || !Object.hasOwn(CHECKS, kind) || file === undefined) {
  console.error("Usage: npm run start-report:check -- <probe|reference> <start.log>");
  process.exit(2);
}
const problems = CHECKS[kind as keyof typeof CHECKS](readFileSync(file, "utf8"));
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
console.log(`Start report of the ${kind} candidate holds: ${file}`);
