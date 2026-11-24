// Mesure interrompue (spec de l'étape 3, règle `interrupted`, #71) : sur
// SIGINT ou SIGTERM, quelle que soit la phase, le runner arrête le candidat,
// écrit measure.json avec les phases déjà faites, invalide pour la cause
// `interrupted`, libère le verrou du banc et rend le code 3.
//
// Sans la pile : un faux `docker`, placé en tête du PATH, remplace Docker,
// comme dans tests/runner/runner-errors.test.ts. Il rend pour les images de la
// pile le label de cette copie et réussit tout appel qu'il ne connaît pas. Sur
// l'appel que nomme DOCKER_STUB_BLOCK, il signale qu'il est atteint (fichier
// témoin `reached-<PID du runner>`) puis attend la mort du runner, un
// signal, ou 3 secondes au plus. Il échoue sur l'appel que nomme
// DOCKER_STUB_FAIL. Il note chaque appel. L'interruption pendant l'oracle, sur la vraie
// pile, est prouvée à la main (fiche du ticket #71).
//
// Le verrou du banc est pris dans un XDG_STATE_HOME temporaire (#92).
import { type ChildProcess, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { stackContextDigests } from "../../oracle/stack-images.ts";
import { DIAGNOSTIC_DIR_FROM_ROOT } from "../../runner/paths.ts";
import { acquireBenchLock } from "../../shared/bench-lock.ts";
import { ARTIFACTS_DIR_FROM_ROOT, ROOT } from "../../shared/root.ts";

const STATE_HOME = mkdtempSync(join(tmpdir(), "mb-state-"));
const LOCK = join(STATE_HOME, "migrabench", "bench-lock");
const stubDir = mkdtempSync(join(tmpdir(), "mb-docker-stub-"));
const stubLog = join(stubDir, "calls.log");

// Appels où le faux `docker` bloque : le conteneur de `fetch` (construction),
// la recréation de la pile (démarrage), et le relevé des sorties du candidat
// avant son arrêt (clôture).
const BUILD = "run --name *-fetch *";
const START = "compose up --detach --force-recreate --no-build --wait *";
const CLOSING = "compose * logs --no-color --timestamps candidate";
// Recréation de la pile et relevé de son état en échec : une erreur imprévue
// du runner après `npm ci`, une panne pendant que le candidat tourne (#68).
const STACK_UNREADABLE = "compose [up][ps] *";

function entries(): string[] {
  return [DIAGNOSTIC_DIR_FROM_ROOT, ARTIFACTS_DIR_FROM_ROOT].flatMap((dir) =>
    existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).map((name) => join(dir, name)) : [],
  );
}

const before = entries();
const started: ChildProcess[] = [];

beforeAll(async () => {
  const digests = await stackContextDigests();
  const image = (service: "legacy" | "archive") =>
    `echo '{"image":"sha256:${"a".repeat(64)}","labels":{"org.migrabench.context-digest":"${digests[service]}"}}'; exit 0 ;;`;
  writeFileSync(
    join(stubDir, "docker"),
    `#!/bin/sh
echo "$*" >> "${stubLog}"
case "$*" in
  $DOCKER_STUB_FAIL) echo "docker stub: failed" >&2; exit 97 ;;
  $DOCKER_STUB_BLOCK)
    touch "${stubDir}/reached-$PPID"
    waited=0
    while kill -0 "$PPID" 2>/dev/null && [ $waited -lt 30 ]; do sleep 0.1; waited=$((waited + 1)); done
    exit 0 ;;
  "info "*) echo 8 ;;
  "image inspect "*migrabench-runtime) echo "sha256:${"r".repeat(64)}" ;;
  "image inspect "*migrabench-legacy) ${image("legacy")}
  "image inspect "*migrabench-archive) ${image("archive")}
  "inspect --format "*) echo "false 2026-11-24T21:00:00.000000000Z" ;;
esac
exit 0
`,
  );
  chmodSync(join(stubDir, "docker"), 0o755);
});

afterEach(async () => {
  await Promise.all(
    started.splice(0).map((child) => {
      if (child.exitCode !== null || child.signalCode !== null) return undefined;
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGKILL");
      return exited;
    }),
  );
});

afterAll(() => {
  for (const entry of entries()) if (!before.includes(entry)) rmSync(join(ROOT, entry), { recursive: true, force: true });
  rmSync(STATE_HOME, { recursive: true, force: true });
  rmSync(stubDir, { recursive: true, force: true });
});

// Lance une mesure du candidat de référence sous le faux `docker`, attend
// qu'elle atteigne l'appel bloquant, puis l'interrompt par `signal`. Rend son
// code de sortie, son measure.json et les appels à Docker qui ont suivi.
async function interruptedMeasure(block: string, signal: NodeJS.Signals, fail = "") {
  // Chaque mesure démarre dans une nouvelle seconde : l'identifiant de la
  // mesure est horodaté à la seconde.
  await new Promise((resolve) => setTimeout(resolve, 1_010 - (Date.now() % 1_000)));
  const seen = entries();
  rmSync(stubLog, { force: true });
  const { ORACLE_SALT: _oracleSalt, ...inherited } = process.env;
  const child = spawn(process.execPath, ["runner/cli.ts", "measure", "--candidate", "fixtures/reference-candidate"], {
    cwd: ROOT,
    env: { ...inherited, PATH: `${stubDir}:${process.env.PATH}`, XDG_STATE_HOME: STATE_HOME, DOCKER_STUB_BLOCK: block, DOCKER_STUB_FAIL: fail },
    stdio: ["ignore", "ignore", "pipe"],
  });
  started.push(child);
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  for (let waited = 0; !existsSync(join(stubDir, `reached-${child.pid}`)); waited += 50) {
    if (waited > 30_000) throw new Error(`The measure did not reach ${block}: ${stderr}`);
    if (child.exitCode !== null) throw new Error(`The measure exited with code ${child.exitCode} before ${block}: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const callsBefore = readFileSync(stubLog, "utf8").trim().split("\n").length;
  child.kill(signal);
  const status = await exited;
  const written = entries().filter((entry) => !seen.includes(entry) && entry.startsWith(DIAGNOSTIC_DIR_FROM_ROOT));
  if (written.length !== 1) throw new Error(`Expected one measure, found ${written.length} (exit code ${status}): ${stderr}`);
  const record = JSON.parse(readFileSync(join(ROOT, written[0]!, "measure.json"), "utf8"));
  const phases = record.phases.map(({ name, outcome }: { name: string; outcome: string }) => `${name}:${outcome}`);
  const callsAfter = readFileSync(stubLog, "utf8").trim().split("\n").slice(callsBefore);
  return { status, record, phases, callsAfter };
}

// Le verrou du banc a été libéré, pas laissé orphelin : il se prend sans reprise.
function expectBenchLockReleased() {
  const lock = acquireBenchLock({ file: LOCK, tool: "measure" });
  expect(lock.ok && lock.takenOver).toBe(undefined);
  if (lock.ok) lock.release();
}

describe("interrupted measure", { timeout: 60_000 }, () => {
  it("is kept, invalid for interrupted, with exit code 3, when SIGINT arrives during the build", async () => {
    const { status, record, phases, callsAfter } = await interruptedMeasure(BUILD, "SIGINT");

    expect(status).toBe(3);
    expect(record.verdict).toEqual({ category: "invalid", reason: "interrupted", evidence: "Interrupted by SIGINT" });
    expect(phases).toEqual(["preparation:ok", "contract:ok", "build:interrupted", "start:not-run", "oracle:not-run", "gates:not-run", "closing:ok"]);
    expect(record.oracle).toMatchObject({ executed: false, summary: { unreached: 38 } });
    // Le conteneur de `fetch`, où tourne `npm ci`, est arrêté et supprimé.
    expect(callsAfter).toContain(`rm --force migrabench-${record.measureId}-fetch migrabench-${record.measureId}-install migrabench-${record.measureId}-build`);
    expectBenchLockReleased();
  });

  it("is kept the same way on SIGTERM during the start, the candidate stopped, and a new measure starts right after", async () => {
    const first = await interruptedMeasure(BUILD, "SIGTERM");
    expect(first.status).toBe(3);
    expect(first.record.verdict).toEqual({ category: "invalid", reason: "interrupted", evidence: "Interrupted by SIGTERM" });
    expectBenchLockReleased();

    const { status, record, phases, callsAfter } = await interruptedMeasure(START, "SIGTERM");

    expect(status).toBe(3);
    expect(record.verdict).toEqual({ category: "invalid", reason: "interrupted", evidence: "Interrupted by SIGTERM" });
    expect(phases).toEqual(["preparation:ok", "contract:ok", "build:ok", "start:interrupted", "oracle:not-run", "gates:not-run", "closing:ok"]);
    expect(record.oracle).toMatchObject({ executed: false, summary: { unreached: 38 } });
    // Le service `candidate` est supprimé, même s'il n'a pas encore été démarré.
    expect(callsAfter.some((call) => call.endsWith("rm --stop --force candidate"))).toBe(true);
    expectBenchLockReleased();
  });

  // La pile tombe au démarrage (panne pendant que le candidat tourne, une
  // mesure valide), puis le signal arrive pendant l'arrêt du candidat :
  // l'interruption passe devant, invalide quelle que soit la phase.
  it("is invalid for interrupted when the signal arrives during the closing, after another outcome", async () => {
    const { status, record, phases } = await interruptedMeasure(CLOSING, "SIGINT", STACK_UNREADABLE);

    expect(status).toBe(3);
    expect(record.verdict).toEqual({ category: "invalid", reason: "interrupted", evidence: "Interrupted by SIGINT" });
    expect(phases).toEqual(["preparation:ok", "contract:ok", "build:ok", "start:stack-down-while-candidate", "oracle:not-run", "gates:not-run", "closing:interrupted"]);
    expectBenchLockReleased();
  });
});
