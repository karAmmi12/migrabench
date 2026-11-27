// `node scripts/run-measure-case.ts <cas>` : une mesure du job de CI des
// mesures (#74) et son contrôle. Le cas nomme le candidat, ses options et son
// issue attendue (scripts/measure-cases.ts). Le contrôle porte sur le code de
// sortie, measure.json et oracle.json ; pour la sonde d'isolation et le
// candidat de référence, aussi sur le constat de démarrage de `start.log`
// (scripts/start-report.ts), avec le marqueur lu dans measure.json pour la
// sonde. Pour `legacy-stopped-during-oracle`, le legacy est arrêté dès que
// Playwright tourne (panne de #68) ; pour `browser-stopped-during-oracle`,
// le service `browser` (#168).
// Lancé par `exec` : SIGINT et SIGTERM sont relayés à la mesure.
// Code de sortie : 0 si la mesure est celle attendue, 1 sinon.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { ARTIFACTS_DIR_FROM_ROOT, ROOT } from "../shared/root.ts";
import { caseProblems, isMeasureCaseName, MEASURE_CASES, type MeasureCase } from "./measure-cases.ts";
import { artifactDirs, readMeasure, relaySignals, startMeasure, stepSummary, waitForOracleRunning } from "./measure-process.ts";
import { probeReportProblems, referenceReportProblems } from "./start-report.ts";

const name = process.argv[2];
if (name === undefined || process.argv.length !== 3 || !isMeasureCaseName(name)) {
  console.error(`Usage: node scripts/run-measure-case.ts <${Object.keys(MEASURE_CASES).join("|")}>`);
  process.exit(2);
}
const expected: MeasureCase = MEASURE_CASES[name];

const before = artifactDirs();
const measure = startMeasure(expected.candidate, expected.args, expected.env);
relaySignals(measure.child);

// Service arrêté dès que Playwright tourne : le legacy (#68) ou le
// navigateur du banc (#168).
const STOPPED_DURING_ORACLE: Partial<Record<string, { service: string; issue: string }>> = {
  "legacy-stopped-during-oracle": { service: "legacy", issue: "#68" },
  "browser-stopped-during-oracle": { service: "browser", issue: "#168" },
};
const stopped = STOPPED_DURING_ORACLE[name];
if (stopped !== undefined) {
  await waitForOracleRunning(before, measure);
  console.log(`Playwright runs: stopping the ${stopped.service} (${stopped.issue}).`);
  const stop = spawnSync("docker", ["compose", "stop", stopped.service], { cwd: ROOT, stdio: "inherit" });
  if (stop.status !== 0) throw new Error(`docker compose stop ${stopped.service} exited with ${stop.status}`);
}

const { exitCode, measureDir } = await measure.done;
if (measureDir === undefined) {
  console.error(`${name}: no measure written (exit code ${exitCode})`);
  await stepSummary(`| ${name} | — | — | ${exitCode} | ✗ no measure written |`);
  process.exit(1);
}

const { record, oracle } = readMeasure(measureDir);
const problems = caseProblems(expected, { exitCode, record, oracle });
const startLog = join(ROOT, ARTIFACTS_DIR_FROM_ROOT, basename(measureDir), "start.log");
if (name === "isolation-probe") problems.push(...probeReportProblems(String(record.marker), readFileSync(startLog, "utf8")));
if (name === "reference" || name === "reference-counted") problems.push(...referenceReportProblems(readFileSync(startLog, "utf8")));

const verdict = record.verdict as { category?: string; reason?: string } | undefined;
console.log();
for (const problem of problems) console.error(`${name}: ${problem}`);
const outcome = problems.length === 0 ? "✓" : `✗ ${problems.join("; ")}`;
await stepSummary(`| ${name} | \`${basename(measureDir)}\` | ${verdict?.category} (${verdict?.reason}) | ${exitCode} | ${outcome} |`);
if (problems.length > 0) process.exit(1);
console.log(`${name}: ${measureDir} is the expected measure (${verdict?.category}, ${verdict?.reason}, exit code ${exitCode}).`);
