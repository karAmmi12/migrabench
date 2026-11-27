// Mesure interrompue (spec de l'étape 3, règle `interrupted`, #71) : sur
// SIGINT ou SIGTERM, quelle que soit la phase, le runner arrête le candidat,
// écrit measure.json avec les phases déjà faites, invalide pour la cause
// `interrupted`, libère le verrou du banc et rend le code 3.
//
// Deux jeux de faux outils, placés en tête du PATH. Chacun note ses appels.
//
// - `fake` : un faux `docker` remplace Docker, comme dans
//   tests/runner/runner-errors.test.ts. Il rend pour les images de la pile le
//   label de cette copie et réussit tout appel qu'il ne connaît pas. Sur
//   l'appel que nomme DOCKER_STUB_BLOCK, il signale qu'il est atteint (fichier
//   témoin `reached-<PID du runner>`) puis attend la mort du runner, un
//   signal, ou 3 secondes au plus. Sur l'appel que nomme DOCKER_STUB_HANG, il
//   le signale (fichier témoin `hung-<PID du runner>`) puis reste suspendu
//   20 secondes au plus. Il échoue sur l'appel que nomme DOCKER_STUB_FAIL.
// - `oracle` : pour atteindre la phase de l'oracle sans construire ni
//   démarrer de candidat. Le faux `docker` laisse passer à Docker les lectures
//   de la pile en marche (celle de `npm run stack:up`), sauf le label des
//   images, qu'il rend comme celui de cette copie : le contexte de la pile
//   est tout le dépôt (#102), et chaque modification d'un fichier changerait
//   l'empreinte. Il simule la recréation de la pile en reliant le journal
//   d'accès de la mesure à celui du legacy, la construction et le service
//   `candidate` ; le test sert lui-même le port du candidat. Le faux `npx` tient le rôle de Playwright : il écrit un
//   brut partiel, laisse un processus en arrière-plan, signale qu'il est
//   atteint, et n'écrit son rapport qu'à la réception du signal relayé, l'ordre
//   défavorable pour la mesure. `npx playwright test --list` est le vrai.
//
// Le verrou du banc est pris dans un XDG_STATE_HOME temporaire (#92).
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { stackContextDigests } from "../../oracle/stack-images.ts";
import { CANDIDATE_PORT } from "../../runner/candidate-runtime.ts";
import { DIAGNOSTIC_DIR_FROM_ROOT } from "../../runner/paths.ts";
import { acquireBenchLock } from "../../shared/bench-lock.ts";
import { BROWSER_TOKEN_ENV, stackBrowserToken } from "../../shared/browser-token.ts";
import { ARTIFACTS_DIR_FROM_ROOT, ROOT } from "../../shared/root.ts";
import { absoluteFixturePath, MEASURES } from "../real-fixtures.ts";

const STATE_HOME = mkdtempSync(join(tmpdir(), "mb-state-"));
const LOCK = join(STATE_HOME, "migrabench", "bench-lock");
const stubDirs = { fake: mkdtempSync(join(tmpdir(), "mb-docker-stub-")), oracle: mkdtempSync(join(tmpdir(), "mb-oracle-stub-")) };
type Stubs = keyof typeof stubDirs;
const callsLog = (stubs: Stubs) => join(stubDirs[stubs], "calls.log");

// Appels où le faux `docker` bloque : le conteneur de `fetch` (construction),
// la recréation de la pile (démarrage), et le relevé des sorties du candidat
// avant son arrêt (clôture).
const BUILD = "run --name *-fetch *";
const START = "compose up --detach --force-recreate --no-build --wait *";
const CLOSING = "compose * logs --no-color --timestamps candidate";
// Recréation de la pile et relevé de son état en échec : une erreur imprévue
// du runner après `npm ci`, une panne pendant que le candidat tourne (#68).
const STACK_UNREADABLE = "compose [up][ps] *";
// Le faux Playwright bloque toujours : la phase de l'oracle.
const ORACLE = "playwright test";

function entries(): string[] {
  return [DIAGNOSTIC_DIR_FROM_ROOT, ARTIFACTS_DIR_FROM_ROOT].flatMap((dir) =>
    existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).map((name) => join(dir, name)) : [],
  );
}

const before = entries();
const started: ChildProcess[] = [];

// Chemin d'un outil réel, cherché dans le PATH du test.
function realTool(name: string): string {
  const { stdout, status } = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  if (status !== 0) throw new Error(`${name} not found in PATH`);
  return stdout.trim();
}

function writeStub(stubs: Stubs, name: string, script: string) {
  writeFileSync(join(stubDirs[stubs], name), script);
  chmodSync(join(stubDirs[stubs], name), 0o755);
}

beforeAll(async () => {
  const digests = await stackContextDigests();
  // Un seul contexte de construction, la racine du dépôt : une seule empreinte.
  if (digests.legacy !== digests.archive) throw new Error("The stack services no longer share their build context");
  const image = (service: "legacy" | "archive") =>
    `echo '{"image":"sha256:${"a".repeat(64)}","labels":{"org.migrabench.context-digest":"${digests[service]}"}}'; exit 0 ;;`;
  const dir = stubDirs.fake;
  writeStub(
    "fake",
    "docker",
    `#!/bin/sh
echo "$*" >> "${callsLog("fake")}"
case "$*" in
  $DOCKER_STUB_FAIL) echo "docker stub: failed" >&2; exit 97 ;;
  $DOCKER_STUB_BLOCK)
    touch "${dir}/reached-$PPID"
    waited=0
    while kill -0 "$PPID" 2>/dev/null && [ $waited -lt 30 ]; do sleep 0.1; waited=$((waited + 1)); done
    exit 0 ;;
  $DOCKER_STUB_HANG)
    touch "${dir}/hung-$PPID"
    waited=0
    while kill -0 "$PPID" 2>/dev/null && [ $waited -lt 200 ]; do sleep 0.1; waited=$((waited + 1)); done
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

  const oracleDir = stubDirs.oracle;
  // Rapport écrit par le faux Playwright au signal : le vrai rapport partiel
  // d'un Playwright interrompu, celui de la mesure interrompue de l'exécution
  // 45624689673 (tests/fixtures/ci45624689673/PROVENANCE.md).
  const INTERRUPTED_REPORT = absoluteFixturePath(`${MEASURES.interrupted.artifacts}/oracle/report.json`);
  writeStub(
    "oracle",
    "docker",
    `#!/bin/sh
echo "$*" >> "${callsLog("oracle")}"
case "$*" in
  "build "*|"run --name "*|"rm --force migrabench-"*|"compose --file "*) exit 0 ;;
  "image inspect --format {{.Id}} migrabench-runtime") echo "sha256:${"r".repeat(64)}"; exit 0 ;;
  "inspect --format {{.State.OOMKilled}} "*) echo "false 2026-11-24T21:00:00.000000000Z"; exit 0 ;;
  "image inspect "*migrabench-legacy) ${image("legacy")}
  "image inspect "*migrabench-archive) ${image("archive")}
  'inspect --format {"image":{{json .Image}}'*) ${image("legacy")}
  "compose up --detach --force-recreate --no-build --wait "*)
    ln -sf "${join(ROOT, ".access-log", "access.log")}" "$MB_ACCESS_LOG_DIR/access.log"
    # Seul le navigateur est vraiment recréé, avec le jeton de la mesure
    # (MB_BROWSER_TOKEN) : sans lui, ses passerelles refusent le relevé des
    # versions, avant Playwright (#160).
    exec "${realTool("docker")}" compose up --detach --force-recreate --no-build --wait --no-deps browser ;;
esac
exec "${realTool("docker")}" "$@"
`,
  );
  writeStub(
    "oracle",
    "npx",
    `#!/bin/sh
case "$*" in
  *--list*) exec "${realTool("npx")}" "$@" ;;
  "playwright test "*)
    mkdir -p "$MB_ORACLE_OUTPUT_DIR"
    echo partial > "$MB_ORACLE_OUTPUT_DIR/partial-raw.txt"
    sleep 300 > /dev/null 2>&1 &
    echo $! > "${oracleDir}/background-$PPID"
    trap 'cp "${INTERRUPTED_REPORT}" "$MB_ORACLE_REPORT"; exit 1' INT TERM
    touch "${oracleDir}/reached-$PPID"
    waited=0
    while kill -0 "$PPID" 2>/dev/null && [ $waited -lt 100 ]; do sleep 0.1; waited=$((waited + 1)); done
    exit 1 ;;
esac
exec "${realTool("npx")}" "$@"
`,
  );
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
  // Le navigateur reprend le jeton de la pile, que lisent les tests suivants (#160).
  const restored = spawnSync("docker", ["compose", "up", "--detach", "--force-recreate", "--no-build", "--wait", "--no-deps", "browser"], {
    cwd: ROOT,
    env: { ...process.env, [BROWSER_TOKEN_ENV]: stackBrowserToken() },
    stdio: "ignore",
  });
  if (restored.status !== 0) throw new Error("Could not recreate the browser service with the token of the stack");
  for (const entry of entries()) if (!before.includes(entry)) rmSync(join(ROOT, entry), { recursive: true, force: true });
  rmSync(STATE_HOME, { recursive: true, force: true });
  for (const dir of Object.values(stubDirs)) rmSync(dir, { recursive: true, force: true });
});

interface Interruption {
  stubs?: Stubs;
  // Appel bloquant du faux `docker` (`fake`) ; ignoré par `oracle`.
  block?: string;
  signal: NodeJS.Signals;
  fail?: string;
  // Appel où le faux `docker` reste suspendu (`fake`).
  hang?: string;
  // Signal envoyé 100 ms après le premier, comme le relais de npm sous Ctrl+C.
  duplicate?: boolean;
  // Second signal, envoyé une fois l'appel suspendu atteint.
  second?: NodeJS.Signals;
}

// Lance une mesure du candidat de référence sous les faux outils, attend
// qu'elle atteigne l'appel bloquant, puis l'interrompt par `signal`. Rend son
// code de sortie, son measure.json, son dossier et les appels à Docker qui
// ont suivi.
async function interruptedMeasure({ stubs = "fake", block = "", signal, fail = "", hang = "", duplicate = false, second }: Interruption) {
  // Chaque mesure démarre dans une nouvelle seconde : l'identifiant de la
  // mesure est horodaté à la seconde.
  await new Promise((resolve) => setTimeout(resolve, 1_010 - (Date.now() % 1_000)));
  const seen = entries();
  const dir = stubDirs[stubs];
  rmSync(callsLog(stubs), { force: true });
  const { ORACLE_SALT: _oracleSalt, ...inherited } = process.env;
  const child = spawn(process.execPath, ["runner/cli.ts", "measure", "--candidate", "fixtures/reference-candidate"], {
    cwd: ROOT,
    env: { ...inherited, PATH: `${dir}:${process.env.PATH}`, XDG_STATE_HOME: STATE_HOME, DOCKER_STUB_BLOCK: block, DOCKER_STUB_FAIL: fail, DOCKER_STUB_HANG: hang },
    stdio: ["ignore", "pipe", "pipe"],
  });
  started.push(child);
  let stderr = "";
  // Sorties mêlées, pour le message d'un échec.
  child.stdout?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  const reach = async (file: string, call: string) => {
    for (let waited = 0; !existsSync(join(dir, `${file}-${child.pid}`)); waited += 50) {
      if (waited > 60_000) throw new Error(`The measure did not reach ${call}: ${stderr}`);
      if (child.exitCode !== null) throw new Error(`The measure exited with code ${child.exitCode} before ${call}: ${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  await reach("reached", stubs === "oracle" ? ORACLE : block);
  const callsBefore = readFileSync(callsLog(stubs), "utf8").trim().split("\n").length;
  const signalledAt = Date.now();
  child.kill(signal);
  if (duplicate) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    child.kill(signal);
  }
  let secondAt: number | undefined;
  if (second !== undefined) {
    await reach("hung", hang);
    secondAt = Date.now();
    child.kill(second);
  }
  const status = await exited;
  const exitedAt = Date.now();
  const written = entries().filter((entry) => !seen.includes(entry) && entry.startsWith(DIAGNOSTIC_DIR_FROM_ROOT));
  if (written.length !== 1) throw new Error(`Expected one measure, found ${written.length} (exit code ${status}): ${stderr}`);
  const measureDir = join(ROOT, written[0]!);
  const record = JSON.parse(readFileSync(join(measureDir, "measure.json"), "utf8"));
  const phases = record.phases.map(({ name, outcome }: { name: string; outcome: string }) => `${name}:${outcome}`);
  const callsAfter = readFileSync(callsLog(stubs), "utf8").trim().split("\n").slice(callsBefore);
  const detail = (name: string) => record.phases.find((entry: { name: string }) => entry.name === name)?.detail as string | undefined;
  // Délais de sortie, depuis le premier signal et depuis le second.
  const exitDelays = { first: exitedAt - signalledAt, second: secondAt === undefined ? undefined : exitedAt - secondAt };
  return { status, record, phases, detail, callsAfter, measureDir, pid: child.pid!, exitDelays };
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Le verrou du banc a été libéré, pas laissé orphelin : il se prend sans reprise.
function expectBenchLockReleased() {
  const lock = acquireBenchLock({ file: LOCK, tool: "measure" });
  expect(lock.ok && lock.takenOver).toBe(undefined);
  if (lock.ok) lock.release();
}

describe("interrupted measure", { timeout: 60_000 }, () => {
  it("is kept, invalid for interrupted, with exit code 3, when SIGINT arrives during the build", async () => {
    const { status, record, phases, callsAfter } = await interruptedMeasure({ block: BUILD, signal: "SIGINT" });

    expect(status).toBe(3);
    expect(record.verdict).toEqual({ category: "invalid", reason: "interrupted", evidence: "Interrupted by SIGINT" });
    expect(phases).toEqual(["preparation:ok", "contract:ok", "build:interrupted", "start:not-run", "oracle:not-run", "gates:not-run", "closing:ok"]);
    expect(record.oracle).toMatchObject({ executed: false, summary: { unreached: 38 } });
    // Le conteneur de `fetch`, où tourne `npm ci`, est arrêté et supprimé.
    expect(callsAfter).toContain(`rm --force migrabench-${record.measureId}-fetch migrabench-${record.measureId}-install migrabench-${record.measureId}-build`);
    expectBenchLockReleased();
  });

  it("is kept the same way on SIGTERM during the build, then a new measure starts right after and is interrupted during the start, the candidate stopped", async () => {
    const first = await interruptedMeasure({ block: BUILD, signal: "SIGTERM" });
    expect(first.status).toBe(3);
    expect(first.record.verdict).toEqual({ category: "invalid", reason: "interrupted", evidence: "Interrupted by SIGTERM" });
    expectBenchLockReleased();

    const { status, record, phases, callsAfter } = await interruptedMeasure({ block: START, signal: "SIGTERM" });

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
    const { status, record, phases } = await interruptedMeasure({ block: CLOSING, signal: "SIGINT", fail: STACK_UNREADABLE });

    expect(status).toBe(3);
    expect(record.verdict).toEqual({ category: "invalid", reason: "interrupted", evidence: "Interrupted by SIGINT" });
    expect(phases).toEqual(["preparation:ok", "contract:ok", "build:ok", "start:stack-down-while-candidate", "oracle:not-run", "gates:not-run", "closing:interrupted"]);
    expectBenchLockReleased();
  });

  // Annulation d'un job de GitHub Actions : SIGTERM 7 500 ms après SIGINT
  // (runner/interruption.ts). measure.json est écrit avant, même si la
  // clôture reste suspendue ; le doublon du relais de npm n'abrège rien.
  it("writes measure.json before GitHub's SIGTERM when the closing hangs, then removes the candidate", async () => {
    const { status, record, phases, detail, callsAfter, exitDelays } = await interruptedMeasure({ block: START, signal: "SIGINT", duplicate: true, hang: CLOSING });

    expect(status).toBe(3);
    expect(record.verdict).toEqual({ category: "invalid", reason: "interrupted", evidence: "Interrupted by SIGINT" });
    expect(phases).toEqual(["preparation:ok", "contract:ok", "build:ok", "start:interrupted", "oracle:not-run", "gates:not-run", "closing:interrupted"]);
    expect(detail("closing")).toBe("Cut short: measure.json is due 5000 ms after the signal");
    expect(exitDelays.first).toBeLessThan(7_500);
    expect(callsAfter.some((call) => call.endsWith("kill candidate"))).toBe(true);
    expectBenchLockReleased();
  });

  it("writes measure.json at once on a second signal", async () => {
    const { status, record, phases, detail, exitDelays } = await interruptedMeasure({ block: START, signal: "SIGINT", hang: CLOSING, second: "SIGTERM" });

    expect(status).toBe(3);
    expect(record.verdict).toEqual({ category: "invalid", reason: "interrupted", evidence: "Interrupted by SIGINT" });
    expect(phases.at(-1)).toBe("closing:interrupted");
    expect(detail("closing")).toBe("Cut short by a second signal, SIGTERM");
    expect(exitDelays.second).toBeLessThan(1_500);
    expectBenchLockReleased();
  });
});

describe("measure interrupted during the oracle", { timeout: 90_000 }, () => {
  // Le candidat : une réponse HTTP sur son port suffit à le dire disponible.
  let candidate: Server;
  beforeAll(async () => {
    candidate = createServer((_request, response) => response.end("candidate"));
    await new Promise<void>((resolve) => candidate.listen(CANDIDATE_PORT, "127.0.0.1", resolve));
  });
  afterAll(() => new Promise<void>((resolve) => candidate.close(() => resolve())));

  // Playwright n'écrit son rapport qu'après le signal : le résultat de
  // l'oracle reste celui de l'instant du signal, sans oracle.json.
  it("keeps the oracle result as it was when the signal arrived, even if Playwright writes its report afterwards", async () => {
    const { status, record, phases, measureDir } = await interruptedMeasure({ stubs: "oracle", signal: "SIGINT" });

    expect(status).toBe(3);
    expect(record.verdict).toEqual({ category: "invalid", reason: "interrupted", evidence: "Interrupted by SIGINT" });
    expect(phases.slice(0, 5)).toEqual(["preparation:ok", "contract:ok", "build:ok", "start:ok", "oracle:interrupted"]);
    expect(record.oracle.executed).toBe(false);
    expect(existsSync(join(measureDir, "oracle.json"))).toBe(false);
    expectBenchLockReleased();
  });

  // La liste des scénarios de la clôture n'est jamais lancée dans le dossier
  // d'un oracle déjà lancé : ses bruts partiels restent tels quels.
  // Playwright tourne dans son propre groupe de processus, que le runner
  // arrête à l'interruption : rien de ce qu'il a lancé ne lui survit, même un
  // processus qui ignore SIGINT.
  it("stops the whole Playwright process group, and the runner exits by itself", async () => {
    const { status, pid } = await interruptedMeasure({ stubs: "oracle", signal: "SIGINT" });

    expect(status).toBe(3);
    const background = Number(readFileSync(join(stubDirs.oracle, `background-${pid}`), "utf8"));
    expect(isAlive(background)).toBe(false);
  });

  it("keeps the partial raw outputs of the interrupted oracle, and still counts the unreached scenarios", async () => {
    const { record } = await interruptedMeasure({ stubs: "oracle", signal: "SIGINT" });

    const oracleDir = join(ROOT, ARTIFACTS_DIR_FROM_ROOT, record.measureId, "oracle");
    // Le brut partiel et le rapport écrit au signal, rien de la liste.
    expect(readdirSync(oracleDir).sort()).toEqual(["partial-raw.txt", "report.json"]);
    expect(readFileSync(join(oracleDir, "partial-raw.txt"), "utf8")).toBe("partial\n");
    expect(record.oracle).toMatchObject({ executed: false, summary: { scenarios: 38, unreached: 38 } });
  });
});
