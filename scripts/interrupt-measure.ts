// `node scripts/interrupt-measure.ts` : deux preuves du job de CI des mesures
// (#74) sur une seule mesure du candidat de référence, sans ORACLE_SALT.
//
// 1. Verrou du banc : pendant que la mesure tourne, une seconde mesure rend
//    le code 4 et n'écrit aucun résultat.
// 2. Interruption pendant l'oracle (#71) : dès que Playwright tourne, SIGINT
//    au processus `node` de la mesure. Attendus : code 3, `measure.json` avec
//    la cause `interrupted` (scripts/measure-cases.ts, cas `interrupted`),
//    pas d'`oracle.json`, sortie moins de 7 500 ms après le signal (le SIGTERM
//    de GitHub à l'annulation d'un job, runner/interruption.ts), aucun
//    conteneur du service `candidate`, aucun `playwright test` restant, et le
//    verrou du banc libéré.
//
// Lancé par `exec` : SIGINT et SIGTERM reçus de l'annulation du job sont
// relayés à la mesure.
// Code de sortie : 0 si tout tient, 1 sinon.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { acquireBenchLock } from "../shared/bench-lock.ts";
import { ROOT } from "../shared/root.ts";
import { DIAGNOSTIC_DIR_FROM_ROOT } from "../runner/paths.ts";
import { caseProblems, MEASURE_CASES } from "./measure-cases.ts";
import { artifactDirs, readMeasure, relaySignals, startMeasure, stepSummary, waitForOracleRunning } from "./measure-process.ts";

// Délai entre SIGINT et SIGTERM à l'annulation d'un job GitHub.
const GITHUB_SIGTERM_AFTER_MS = 7_500;
const REFERENCE = MEASURE_CASES.interrupted.candidate;

function diagnosticDirs(): Set<string> {
  const dir = join(ROOT, DIAGNOSTIC_DIR_FROM_ROOT);
  return new Set(existsSync(dir) ? readdirSync(dir) : []);
}

const problems: string[] = [];
const resultsBefore = diagnosticDirs();
const artifactsBefore = artifactDirs();
const measure = startMeasure(REFERENCE);
relaySignals(measure.child);
const id = await waitForOracleRunning(artifactsBefore, measure);
console.log(`\nPlaywright runs in ${id}.`);

// 1. Une seconde mesure pendant que la première tient le verrou du banc.
console.log("A second measure while the first holds the bench lock:");
const second = startMeasure(REFERENCE);
const refused = await second.done;
if (refused.exitCode !== 4) problems.push(`second measure: exit code is ${refused.exitCode}, expected 4`);
if (!refused.output.includes("refused-lock")) problems.push("second measure: no refused-lock message");
const written = [...diagnosticDirs()].filter((dir) => !resultsBefore.has(dir) && dir !== id);
if (written.length > 0) problems.push(`second measure: results written: ${written.join(", ")}`);
await stepSummary(`| lock-refused | — | refused-lock | ${refused.exitCode} | ${problems.length === 0 ? "✓" : "✗"} |`);

// 2. SIGINT pendant l'oracle.
console.log(`\nSIGINT to the measure (PID ${measure.child.pid}).`);
const signalledAt = performance.now();
measure.child.kill("SIGINT");
const { exitCode, measureDir } = await measure.done;
const delayMs = Math.round(performance.now() - signalledAt);
console.log(`The measure exited with code ${exitCode}, ${delayMs} ms after SIGINT.`);

const interruptedProblems: string[] = [];
if (measureDir === undefined) {
  interruptedProblems.push("no measure written");
} else {
  const { record, oracle } = readMeasure(measureDir);
  interruptedProblems.push(...caseProblems(MEASURE_CASES.interrupted, { exitCode, record, oracle }));
}
if (delayMs >= GITHUB_SIGTERM_AFTER_MS) interruptedProblems.push(`exited ${delayMs} ms after SIGINT, expected under ${GITHUB_SIGTERM_AFTER_MS} ms`);

const containers = spawnSync("docker", ["ps", "--all", "--quiet", "--filter", "label=com.docker.compose.service=candidate"], { encoding: "utf8" });
if (containers.status !== 0) interruptedProblems.push(`docker ps failed: ${containers.stderr}`);
else if (containers.stdout.trim() !== "") interruptedProblems.push(`candidate containers left: ${containers.stdout.trim().split("\n").join(", ")}`);

// pgrep rend 1 quand aucun processus ne correspond.
const playwright = spawnSync("pgrep", ["-fl", "playwright test"], { encoding: "utf8" });
if (playwright.status === 0) interruptedProblems.push(`playwright test processes left: ${playwright.stdout.trim()}`);

const lock = acquireBenchLock({ tool: "measure" });
if (lock.ok) lock.release();
else interruptedProblems.push(`bench lock not released: ${lock.message}`);

await stepSummary(`| interrupted | \`${id}\` | interrupted, ${delayMs} ms after SIGINT | ${exitCode} | ${interruptedProblems.length === 0 ? "✓" : "✗"} |`);
problems.push(...interruptedProblems.map((problem) => `interrupted measure: ${problem}`));

console.log();
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
console.log(`Bench lock refusal and interrupted measure hold: ${measureDir}, ${delayMs} ms after SIGINT.`);
