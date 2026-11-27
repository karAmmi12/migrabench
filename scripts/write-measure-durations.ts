// Job `measures` du workflow « Mesures » (#163) : écrit dans le résumé du job
// la durée de chaque job de mesures (`measures / <groupe>`), leur somme et le
// plus long (scripts/measure-durations.ts).
//
// Environnement des Actions : GITHUB_REPOSITORY, GITHUB_RUN_ID,
// GITHUB_RUN_ATTEMPT, GITHUB_STEP_SUMMARY. gh lit GH_TOKEN.
import { execFile } from "node:child_process";
import { appendFileSync } from "node:fs";
import { promisify } from "node:util";
import { durationsSummary, measureDurations, parseJobTimings } from "./measure-durations.ts";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

const path = `repos/${env("GITHUB_REPOSITORY")}/actions/runs/${env("GITHUB_RUN_ID")}/attempts/${env("GITHUB_RUN_ATTEMPT")}/jobs?per_page=100`;
const { stdout } = await promisify(execFile)("gh", ["api", path]);
const summary = durationsSummary(measureDurations(parseJobTimings(JSON.parse(stdout)), (name) => name.startsWith("measures / ")));
console.log(summary);
appendFileSync(env("GITHUB_STEP_SUMMARY"), summary);
