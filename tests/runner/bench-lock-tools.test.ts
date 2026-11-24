// Verrou du banc pris par les outils du banc (spec de l'étape 3, « Verrou du
// banc ») : `migrabench measure`, `migrabench calibrate` (#72), `npm run
// oracle` et `npm run stack:up` se refusent l'un l'autre, et une mesure qui
// échoue libère le verrou du banc.
//
// Sans la pile : un faux `docker`, placé en tête du PATH, remplace Docker. En
// mode `block`, il signale qu'il est atteint (fichier témoin `reached-<PID de
// l'outil>`), puis ne rend la main qu'à la mort de l'outil qui l'a lancé, qui
// garde donc le verrou du banc ; en mode `fail`, il échoue aussitôt. Il note
// chaque appel, et si le verrou du banc existait à ce moment.
//
// Le verrou du banc de ces outils est pris dans un XDG_STATE_HOME temporaire
// (#92) : il ne gêne ni ne voit le verrou du banc réel de la machine, commun à
// toutes les copies du dépôt.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { DIAGNOSTIC_DIR_FROM_ROOT } from "../../runner/paths.ts";
import { acquireBenchLock, type BenchLockHolder } from "../../shared/bench-lock.ts";
import { ARTIFACTS_DIR_FROM_ROOT, ROOT } from "../../shared/root.ts";

const HOLD = new URL("../fixtures/bench-lock/hold.ts", import.meta.url).pathname;
const DEV_SALT = join(ROOT, ".dev-archive-salt");

const STATE_HOME = mkdtempSync(join(tmpdir(), "mb-state-"));
const LOCK = join(STATE_HOME, "migrabench", "bench-lock");

const stubDir = mkdtempSync(join(tmpdir(), "mb-docker-stub-"));
const stubLog = join(stubDir, "calls.log");
writeFileSync(
  join(stubDir, "docker"),
  `#!/bin/sh
echo "$* lock=$(test -f "${LOCK}" && echo held || echo free)" >> "${stubLog}"
if [ "$DOCKER_STUB_MODE" = block ]; then
  touch "${stubDir}/reached-$PPID"
  while kill -0 "$PPID" 2>/dev/null; do sleep 0.2; done
fi
echo "docker stub: $DOCKER_STUB_MODE" >&2
exit 97
`,
);
chmodSync(join(stubDir, "docker"), 0o755);

function env(mode: "block" | "fail"): NodeJS.ProcessEnv {
  const { ORACLE_SALT: _oracleSalt, ...inherited } = process.env;
  return { ...inherited, PATH: `${stubDir}:${process.env.PATH}`, DOCKER_STUB_MODE: mode, XDG_STATE_HOME: STATE_HOME };
}

function stubCalls(): string[] {
  return existsSync(stubLog) ? readFileSync(stubLog, "utf8").trim().split("\n") : [];
}

function entries(): string[] {
  return [DIAGNOSTIC_DIR_FROM_ROOT, ARTIFACTS_DIR_FROM_ROOT].flatMap((dir) =>
    existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).map((name) => join(dir, name)) : [],
  );
}

// Outil du banc lancé à la racine du dépôt, sous le faux `docker`.
function run(script: string, args: readonly string[], mode: "block" | "fail") {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, ...args], { cwd: ROOT, env: env(mode), encoding: "utf8" });
  return { status, stdout, stderr };
}

type Tool = readonly [script: string, args: readonly string[]];
const MEASURE: Tool = ["runner/cli.ts", ["measure", "--candidate", "fixtures/reference-candidate"]];
const CALIBRATE: Tool = ["runner/cli.ts", ["calibrate", "--readings", "1"]];
const ORACLE: Tool = ["oracle/cli.ts", []];
const STACK_UP: Tool = ["scripts/stack-up.ts", []];

const started: ChildProcess[] = [];
let before: string[];
let devSalt: string | undefined;

// Lance un outil du banc qui reste bloqué sur Docker, et attend qu'il ait
// atteint le faux `docker` : les appels relevés ensuite contiennent déjà les
// siens. Il prend le verrou du banc avant toute commande Docker : une prise
// tentée ensuite est refusée, et le refus nomme le détenteur. Pas de prise
// tentée avant : elle pourrait devancer l'outil.
async function holding([script, args]: Tool, tool: string): Promise<BenchLockHolder> {
  const child = spawn(process.execPath, [script, ...args], { cwd: ROOT, env: env("block"), stdio: "ignore" });
  started.push(child);
  for (let waited = 0; !existsSync(join(stubDir, `reached-${child.pid}`)); waited += 50) {
    if (waited > 10_000) throw new Error(`${script} did not reach Docker`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const probe = acquireBenchLock({ file: LOCK, tool: "measure" });
  if (probe.ok) {
    probe.release();
    throw new Error(`${script} reached Docker without holding the bench lock`);
  }
  expect(probe.holder).toMatchObject({ tool, pid: child.pid });
  return probe.holder;
}

afterAll(() => rmSync(STATE_HOME, { recursive: true, force: true }));

beforeEach(() => {
  rmSync(stubLog, { force: true });
  before = entries();
  devSalt = existsSync(DEV_SALT) ? readFileSync(DEV_SALT, "utf8") : undefined;
});

afterEach(async () => {
  await Promise.all(
    started.splice(0).map((child) => {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGKILL");
      return exited;
    }),
  );
  // Verrou du banc laissé par un outil tué ici : repris, puis libéré.
  const left = acquireBenchLock({ file: LOCK, tool: "measure" });
  if (left.ok) left.release();
  for (const entry of entries()) if (!before.includes(entry)) rmSync(join(ROOT, entry), { recursive: true, force: true });
});

describe("bench lock taken by the bench tools", { timeout: 20_000 }, () => {
  it("refuses a measure with exit code 4 and writes nothing while npm run oracle holds it", async () => {
    const holder = await holding(ORACLE, "oracle");

    const result = run(...MEASURE, "fail");

    expect(result.status).toBe(4);
    expect(result.stderr).toContain("refused-lock: The bench lock is held by oracle");
    expect(result.stderr).toContain(`PID ${holder.pid}`);
    expect(result.stderr).toContain(holder.takenAt);
    expect(entries()).toEqual(before);
  });

  it("refuses a measure while npm run stack:up holds it", async () => {
    // Détenteur `stack-up` simulé : le vrai `npm run stack:up` réécrirait le
    // sel de développement relu par les autres tests.
    const holder = spawn(process.execPath, [HOLD, LOCK, "stack-up"], { stdio: ["pipe", "pipe", "inherit"] });
    started.push(holder);
    await new Promise((resolve) => holder.stdout?.once("data", resolve));

    const result = run(...MEASURE, "fail");

    expect(result.status).toBe(4);
    expect(result.stderr).toContain("refused-lock: The bench lock is held by stack-up");
    expect(entries()).toEqual(before);
  });

  it("refuses npm run oracle and npm run stack:up while a measure holds it, before any Docker command", async () => {
    const holder = await holding(MEASURE, "measure");
    const measureCalls = stubCalls();

    for (const tool of [ORACLE, STACK_UP]) {
      const result = run(...tool, "fail");

      expect(result.status).toBe(4);
      expect(result.stderr).toContain("refused-lock: The bench lock is held by measure");
      expect(result.stderr).toContain(`measure ${holder.measureId}`);
    }
    expect(stubCalls()).toEqual(measureCalls);
    expect(existsSync(DEV_SALT) ? readFileSync(DEV_SALT, "utf8") : undefined).toBe(devSalt);
  });

  // #72 : l'étalonnage recrée la pile, comme une mesure.
  it("refuses migrabench calibrate while a measure holds it, before any Docker command", async () => {
    // Détenteur `measure` simulé : le test précédent couvre déjà une vraie
    // mesure qui tient le verrou du banc.
    const holder = spawn(process.execPath, [HOLD, LOCK, "measure"], { stdio: ["pipe", "pipe", "inherit"] });
    started.push(holder);
    await new Promise((resolve) => holder.stdout?.once("data", resolve));

    const result = run(...CALIBRATE, "fail");

    expect(result.status).toBe(4);
    expect(result.stderr).toContain("refused-lock: The bench lock is held by measure");
    expect(stubCalls()).toEqual([]);
  });

  it("refuses a measure while migrabench calibrate holds it", async () => {
    await holding(CALIBRATE, "calibrate");

    const result = run(...MEASURE, "fail");

    expect(result.status).toBe(4);
    expect(result.stderr).toContain("refused-lock: The bench lock is held by calibrate");
    expect(entries()).toEqual(before);
  });

  it("is released after a measure that fails, having been held while it ran", () => {
    const result = run(...MEASURE, "fail");

    // Docker en échec à la préparation : une erreur du runner rangée dans une
    // mesure invalide (#68).
    expect(result.status).toBe(3);
    expect(result.stdout).toContain("Outcome: invalid (runner-error-before-candidate)");
    expect(stubCalls()[0]).toMatch(/^build .* lock=held$/);
    expect(existsSync(LOCK)).toBe(false);
  });
});
