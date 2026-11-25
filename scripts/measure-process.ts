// Mesure lancée par un script du job de CI des mesures (#74) :
// `node runner/cli.ts measure`, enfant direct de ce processus, dont on connaît
// donc le PID. Ses sorties sont recopiées, et sa ligne `Measure: <dossier>`
// relevée. Le script lui-même est lancé par `exec` dans l'étape du workflow :
// c'est lui qui reçoit le SIGINT ou le SIGTERM de l'annulation d'un job
// GitHub, et il le relaie à la mesure (#71, #94).
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { ARTIFACTS_DIR_FROM_ROOT, ROOT } from "../shared/root.ts";

export interface MeasureProcess {
  child: ChildProcess;
  // Code de sortie et dossier de la mesure, s'il a été imprimé.
  done: Promise<{ exitCode: number; measureDir: string | undefined; output: string }>;
}

export function startMeasure(candidate: string, args: string[] = [], env: Record<string, string> = {}): MeasureProcess {
  // Jamais de sel imposé dans le job : une mesure tire le sien (#73).
  const { ORACLE_SALT: _imposed, ...inherited } = process.env;
  const child = spawn(process.execPath, ["runner/cli.ts", "measure", "--candidate", candidate, ...args], {
    cwd: ROOT,
    env: { ...inherited, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
    process.stderr.write(chunk);
  });
  const done = new Promise<{ exitCode: number; measureDir: string | undefined; output: string }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const measureDir = /^Measure: (.+)$/m.exec(output)?.[1]?.trim();
      resolve({ exitCode: code ?? (signal === null ? 1 : 128), measureDir, output });
    });
  });
  return { child, done };
}

// Relaie SIGINT et SIGTERM à la mesure, une fois chacun : ce processus
// attend ensuite qu'elle range sa mesure et sorte.
export function relaySignals(child: ChildProcess): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      console.error(`${signal} received: relayed to the measure (PID ${child.pid})`);
      child.kill(signal);
    });
  }
}

// Dossiers des bruts présents avant le lancement d'une mesure.
export function artifactDirs(): Set<string> {
  const dir = join(ROOT, ARTIFACTS_DIR_FROM_ROOT);
  return new Set(existsSync(dir) ? readdirSync(dir) : []);
}

// Attend que Playwright tourne dans la mesure lancée après `before` : le
// fichier `.oracle-artifacts/<identifiant>/oracle-playwright.log` existe et
// contient `Running`. Rend l'identifiant de la mesure.
export async function waitForOracleRunning(before: Set<string>, measure: MeasureProcess, timeoutMs = 300_000): Promise<string> {
  let exited = false;
  void measure.done.then(() => (exited = true));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited) throw new Error("The measure exited before Playwright ran");
    for (const id of artifactDirs()) {
      if (before.has(id)) continue;
      const log = join(ROOT, ARTIFACTS_DIR_FROM_ROOT, id, "oracle-playwright.log");
      if (existsSync(log) && readFileSync(log, "utf8").includes("Running")) return id;
    }
    await sleep(200);
  }
  throw new Error(`Playwright did not run within ${timeoutMs} ms`);
}

// measure.json et, s'il existe, oracle.json d'un dossier de mesure.
export function readMeasure(measureDir: string): { record: Record<string, unknown>; oracle: Record<string, unknown> | undefined } {
  const read = (name: string) => JSON.parse(readFileSync(join(ROOT, measureDir, name), "utf8")) as Record<string, unknown>;
  return { record: read("measure.json"), oracle: existsSync(join(ROOT, measureDir, "oracle.json")) ? read("oracle.json") : undefined };
}

// Ajoute une ligne au résumé de l'étape GitHub, quand il existe.
export async function stepSummary(line: string): Promise<void> {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file === undefined || file === "") return;
  const { appendFileSync } = await import("node:fs");
  appendFileSync(file, `${line}\n`);
}
