// Verrou du banc (spec de l'étape 3, « Verrou du banc », Seam 3), par des
// processus réels : prise, refus, prise par `npm test` (#94), reprise d'un
// verrou du banc orphelin, refus de déposséder un détenteur vivant.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireBenchLock, NPM_TEST_PID, npmTestLockProblem } from "../shared/bench-lock.ts";

const HOLD = new URL("./fixtures/bench-lock/hold.ts", import.meta.url).pathname;
const NPM_TEST = new URL("../scripts/test.ts", import.meta.url).pathname;
const MODULE = new URL("../shared/bench-lock.ts", import.meta.url).pathname;

function lockFile(): string {
  return join(mkdtempSync(join(tmpdir(), "mb-bench-lock-")), ".bench-lock");
}

const holders: ChildProcess[] = [];
afterEach(() => {
  for (const holder of holders.splice(0)) holder.kill();
});

// Lance un détenteur réel et attend qu'il tienne le verrou du banc.
function hold(file: string, tool: string, measureId?: string): Promise<ChildProcess> {
  const holder = spawn(process.execPath, [HOLD, file, tool, ...(measureId === undefined ? [] : [measureId])], { stdio: ["pipe", "pipe", "inherit"] });
  holders.push(holder);
  return new Promise((resolve, reject) => {
    holder.stdout?.once("data", () => resolve(holder));
    holder.once("exit", (code) => reject(new Error(`The holder exited with code ${code}`)));
  });
}

// Tue le détenteur sans lui laisser libérer le verrou du banc.
async function killHard(holder: ChildProcess): Promise<void> {
  const exited = new Promise((resolve) => holder.once("exit", resolve));
  holder.kill("SIGKILL");
  await exited;
}

function read(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, "utf8"));
}

describe("bench lock", () => {
  it("is taken when free, with the tool, the process, the machine, the measure and the time", () => {
    const file = lockFile();
    const before = Date.now();

    const lock = acquireBenchLock({ file, tool: "measure", measureId: "20261123T090507Z-454fb76-reference-candidate" });

    expect(lock.ok).toBe(true);
    const written = JSON.parse(readFileSync(file, "utf8"));
    expect(written).toMatchObject({
      tool: "measure",
      pid: process.pid,
      host: hostname(),
      measureId: "20261123T090507Z-454fb76-reference-candidate",
    });
    expect(written.startedAt).toEqual(expect.any(String));
    expect(written.command).toBe(spawnSync("ps", ["-ww", "-o", "args=", "-p", String(process.pid)], { encoding: "utf8" }).stdout.trim());
    expect(Date.parse(written.takenAt)).toBeGreaterThanOrEqual(before - 1000);
    if (lock.ok) lock.release();
    expect(existsSync(file)).toBe(false);
  });

  it("is refused while a live process holds it, naming the tool, the process and the time of taking", async () => {
    const file = lockFile();
    const holder = await hold(file, "oracle");
    const held = readFileSync(file, "utf8");

    const lock = acquireBenchLock({ file, tool: "measure" });

    expect(lock.ok).toBe(false);
    const { pid, takenAt } = read(file);
    expect(pid).toBe(holder.pid);
    if (!lock.ok) {
      expect(lock.message).toContain("oracle");
      expect(lock.message).toContain(`PID ${holder.pid}`);
      expect(lock.message).toContain(String(takenAt));
    }
    expect(readFileSync(file, "utf8")).toBe(held);
  });

  it("is taken over when no process bears the recorded PID, and the takeover is recorded with the three values", async () => {
    const file = lockFile();
    const holder = await hold(file, "stack-up");
    const orphan = read(file);
    await killHard(holder);

    const lock = acquireBenchLock({ file, tool: "measure" });

    expect(lock.ok).toBe(true);
    if (!lock.ok) return;
    expect(lock.takenOver).toEqual({ tool: "stack-up", pid: orphan.pid, startedAt: orphan.startedAt, command: orphan.command });
    expect(read(file)).toMatchObject({ tool: "measure", pid: process.pid });
    lock.release();
  });

  // Le PID est porté par un processus vivant, mais le verrou du banc décrit un
  // autre processus : un PID réattribué ne passe pas pour le détenteur.
  for (const [value, change] of [
    ["start time", { startedAt: "Thu Jan  1 00:00:00 1970" }],
    ["command line", { command: "node scripts/stack-up.ts" }],
  ] as const) {
    it(`is taken over when the process bearing the PID has another ${value}`, async () => {
      const file = lockFile();
      const holder = await hold(file, "oracle");
      const orphan: Record<string, unknown> = { ...read(file), ...change };
      writeFileSync(file, JSON.stringify(orphan));

      const lock = acquireBenchLock({ file, tool: "measure" });

      expect(lock.ok).toBe(true);
      if (!lock.ok) return;
      expect(lock.takenOver).toEqual({ tool: "oracle", pid: holder.pid, startedAt: orphan.startedAt, command: orphan.command });
      // Le processus qui porte le PID, en se terminant, ne libère pas le verrou du banc repris.
      const exited = new Promise((resolve) => holder.once("exit", resolve));
      holder.stdin?.end();
      await exited;
      expect(read(file)).toMatchObject({ tool: "measure", pid: process.pid });
      lock.release();
    });
  }

  it("is never taken from a live holder whose PID, start time and command line all match", async () => {
    const file = lockFile();
    const holder = await hold(file, "stack-up");
    const held = readFileSync(file, "utf8");

    for (let attempt = 0; attempt < 3; attempt++) expect(acquireBenchLock({ file, tool: "oracle" }).ok).toBe(false);

    expect(readFileSync(file, "utf8")).toBe(held);
    expect(read(file).pid).toBe(holder.pid);
  });

  it("is never taken over on another machine, even when no process bears the PID here", async () => {
    const file = lockFile();
    const holder = await hold(file, "measure");
    writeFileSync(file, JSON.stringify({ ...read(file), host: `not-${hostname()}` }));
    await killHard(holder);

    const lock = acquireBenchLock({ file, tool: "oracle" });

    expect(lock.ok).toBe(false);
    if (!lock.ok) expect(lock.message).toContain(`not-${hostname()}`);
  });
});

describe("bench lock left mid-way by a crash", () => {
  it("is taken despite a draft left by a crashed process that bore the same PID", () => {
    const file = lockFile();
    writeFileSync(`${file}.${process.pid}.draft`, "left by a crash");

    const lock = acquireBenchLock({ file, tool: "oracle" });

    expect(lock.ok).toBe(true);
    if (lock.ok) lock.release();
  });

  it("refuses, without removing it, the takeover guard of a process that died while taking over", async () => {
    const file = lockFile();
    await killHard(await hold(file, "oracle"));
    await killHard(await hold(`${file}.takeover`, "measure"));
    const guard = readFileSync(`${file}.takeover`, "utf8");

    const lock = acquireBenchLock({ file, tool: "stack-up" });

    expect(lock.ok).toBe(false);
    // Les deux commandes exactes : vérifier qu'aucun outil du banc ne tourne,
    // puis retirer la garde.
    if (!lock.ok) {
      expect(lock.message).toContain('pgrep -fl "runner/cli.ts|oracle/cli.ts|scripts/stack-up.ts|scripts/test.ts|scripts/trial-agent.ts"');
      expect(lock.message).toContain(`rm ${file}.takeover`);
    }
    expect(readFileSync(`${file}.takeover`, "utf8")).toBe(guard);
  });
});

// #92 : la pile (projet Compose `migrabench`, ports de l'hôte) est commune à
// toute la machine. Deux copies du dépôt, comme deux worktrees, voient donc le
// même verrou du banc. Chaque copie a son module, et le détenteur prend le
// verrou du banc à son emplacement par défaut, sous un XDG_STATE_HOME
// temporaire.
describe("bench lock shared by every copy of the repository", () => {
  const HOLD_DEFAULT = `import { acquireBenchLock } from "./shared/bench-lock.ts";
const lock = acquireBenchLock({ tool: process.argv[2] });
if (!lock.ok) {
  console.error(lock.message);
  process.exit(4);
}
console.log("held");
process.stdin.resume();
process.stdin.on("end", () => lock.release());
`;

  function copy(): string {
    const root = mkdtempSync(join(tmpdir(), "mb-copy-"));
    mkdirSync(join(root, "shared"));
    copyFileSync(MODULE, join(root, "shared", "bench-lock.ts"));
    writeFileSync(join(root, "hold-default.ts"), HOLD_DEFAULT);
    return root;
  }

  function stateEnv(): NodeJS.ProcessEnv {
    return { ...process.env, XDG_STATE_HOME: mkdtempSync(join(tmpdir(), "mb-state-")) };
  }

  for (const [holderCopy, takerCopy] of [
    ["A", "B"],
    ["B", "A"],
  ] as const) {
    it(`refuses a bench tool of copy ${takerCopy} while a bench tool of copy ${holderCopy} holds it`, async () => {
      const copies = { A: copy(), B: copy() };
      const env = stateEnv();
      const holder = spawn(process.execPath, [join(copies[holderCopy], "hold-default.ts"), "measure"], { env, stdio: ["pipe", "pipe", "inherit"] });
      holders.push(holder);
      await new Promise((resolve, reject) => {
        holder.stdout?.once("data", resolve);
        holder.once("exit", (code) => reject(new Error(`The holder exited with code ${code}`)));
      });

      const taker = spawnSync(process.execPath, [join(copies[takerCopy], "hold-default.ts"), "oracle"], { env, input: "", encoding: "utf8" });

      expect(taker.status).toBe(4);
      expect(taker.stderr).toContain(`The bench lock is held by measure (PID ${holder.pid}`);
      expect(taker.stderr).toContain(`Bench lock: ${join(env.XDG_STATE_HOME ?? "", "migrabench", "bench-lock")}`);
    });
  }
});

// `npm test` (scripts/test.ts) prend le verrou du banc pour toute la durée de
// Vitest (#94). Le script et le module sont copiés dans un dépôt temporaire, à
// côté d'un faux Vitest, lancés sous un XDG_STATE_HOME temporaire. Le faux
// Vitest note ses arguments et le verrou du banc tel qu'il le voit, puis se
// termine avec le code FAKE_VITEST_EXIT, ou attend un signal quand il vaut
// `wait`.
describe("npm test holding the bench lock", () => {
  const FAKE_VITEST = `import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const lock = process.env.FAKE_VITEST_LOCK;
writeFileSync(process.env.FAKE_VITEST_SEEN, JSON.stringify({ pid: process.pid, args: process.argv.slice(2), npmTestPid: process.env.MIGRABENCH_NPM_TEST_PID ?? null, lock: existsSync(lock) ? JSON.parse(readFileSync(lock, "utf8")) : null }));
const exit = process.env.FAKE_VITEST_EXIT;
if (exit === "wait") {
  // Interrompu : chaque signal reçu est noté ; le premier lance un nettoyage
  // d'une seconde, à la fin duquel le verrou du banc est relevé.
  const log = (line) => appendFileSync(process.env.FAKE_VITEST_SIGNALS, line + "\\n");
  let cleaning = false;
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      log(signal);
      if (cleaning) return;
      cleaning = true;
      setTimeout(() => {
        log(\`cleaned lock=\${existsSync(lock) ? "held" : "free"}\`);
        process.exit(130);
      }, 1000);
    });
  }
  setInterval(() => {}, 1000);
} else process.exit(Number(exit));
`;

  interface Repo {
    root: string;
    file: string;
    seen: string;
    signals: string;
    env: NodeJS.ProcessEnv;
  }

  function repo(exit: number | "wait", vitest = true): Repo {
    const root = mkdtempSync(join(tmpdir(), "mb-npm-test-"));
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "shared"));
    mkdirSync(join(root, "node_modules", "vitest"), { recursive: true });
    copyFileSync(NPM_TEST, join(root, "scripts", "test.ts"));
    copyFileSync(MODULE, join(root, "shared", "bench-lock.ts"));
    if (vitest) writeFileSync(join(root, "node_modules", "vitest", "vitest.mjs"), FAKE_VITEST);
    const state = mkdtempSync(join(tmpdir(), "mb-state-"));
    const file = join(state, "migrabench", "bench-lock");
    const seen = join(root, "seen.json");
    const signals = join(root, "signals.log");
    return {
      root,
      file,
      seen,
      signals,
      env: { ...process.env, XDG_STATE_HOME: state, FAKE_VITEST_LOCK: file, FAKE_VITEST_SEEN: seen, FAKE_VITEST_SIGNALS: signals, FAKE_VITEST_EXIT: String(exit) },
    };
  }

  function npmTest({ root, env }: Repo, args: readonly string[] = []) {
    const { status, stderr } = spawnSync(process.execPath, [join(root, "scripts", "test.ts"), ...args], { cwd: root, env, encoding: "utf8" });
    return { status, stderr };
  }

  function readSeen({ seen }: Repo): { pid: number; args: string[]; npmTestPid: string | null; lock: Record<string, unknown> | null } {
    return JSON.parse(readFileSync(seen, "utf8"));
  }

  it("holds the bench lock as the tool test while vitest runs, then releases it", () => {
    const copied = repo(0);

    const outcome = npmTest(copied, ["tests/one.test.ts", "--reporter=default"]);

    expect(outcome).toEqual({ status: 0, stderr: "" });
    const { args, npmTestPid, lock } = readSeen(copied);
    expect(args).toEqual(["run", "tests/one.test.ts", "--reporter=default"]);
    expect(lock).toMatchObject({ tool: "test", host: hostname() });
    // #163 : Vitest reçoit le PID du détenteur, que vérifie son globalSetup.
    expect(npmTestPid).toBe(String(lock?.pid));
    expect(existsSync(copied.file)).toBe(false);
  });

  it("releases the bench lock after failing tests, keeping the exit code of vitest", () => {
    const copied = repo(1);

    expect(npmTest(copied).status).toBe(1);
    expect(readSeen(copied).lock).toMatchObject({ tool: "test" });
    expect(existsSync(copied.file)).toBe(false);
  });

  it("refuses to run while a bench tool holds the bench lock, naming it, without launching vitest", async () => {
    const copied = repo(0);
    const { file } = copied;
    const holder = await hold(file, "measure", "20261123T090507Z-454fb76-reference-candidate");
    const held = readFileSync(file, "utf8");

    const outcome = npmTest(copied);

    expect(outcome.status).toBe(4);
    expect(outcome.stderr).toContain("refused-lock: The bench lock is held by measure");
    expect(outcome.stderr).toContain(`measure (PID ${holder.pid}`);
    expect(outcome.stderr).toContain("20261123T090507Z-454fb76-reference-candidate");
    expect(outcome.stderr).toContain(`Bench lock: ${file}`);
    expect(existsSync(copied.seen)).toBe(false);
    expect(readFileSync(file, "utf8")).toBe(held);
  });

  it("takes over an orphan bench lock, saying so, and releases it at the end", async () => {
    const copied = repo(0);
    await killHard(await hold(copied.file, "oracle"));

    const outcome = npmTest(copied);

    expect(outcome.status).toBe(0);
    expect(outcome.stderr).toContain("Took over an orphan bench lock of oracle");
    expect(readSeen(copied).lock).toMatchObject({ tool: "test" });
    expect(existsSync(copied.file)).toBe(false);
  });

  it("releases the bench lock when vitest cannot be launched", () => {
    const copied = repo(0, false);

    expect(npmTest(copied).status).not.toBe(0);
    expect(existsSync(copied.file)).toBe(false);
  });

  // Interruption. `npm test` est lancé dans son propre groupe de processus,
  // comme un terminal lance une commande au premier plan : Ctrl+C envoie
  // SIGINT à tout le groupe, et npm (run-script) le relaie aussi à son enfant.
  // Vitest doit recevoir le signal une seule fois : un second SIGINT
  // l'arrêterait au milieu de son nettoyage. Pendant ce temps, les autres
  // outils du banc sont refusés, et le verrou du banc n'est libéré qu'après le
  // nettoyage.
  const interruptions: [name: string, signal: "SIGINT" | "SIGTERM", deliver: (pid: number, signal: NodeJS.Signals) => void][] = [
    ["Ctrl+C in a terminal", "SIGINT", (pid, signal) => process.kill(-pid, signal)],
    ["Ctrl+C under npm, which relays SIGINT", "SIGINT", (pid, signal) => (process.kill(-pid, signal), process.kill(pid, signal))],
    ["SIGINT sent to npm test alone", "SIGINT", (pid, signal) => process.kill(pid, signal)],
    ["SIGTERM sent to npm test alone", "SIGTERM", (pid, signal) => process.kill(pid, signal)],
  ];
  for (const [name, signal, deliver] of interruptions) {
    it(`refuses the bench tools until interrupted by ${name}, then lets vitest clean up once and releases the bench lock`, async () => {
      const copied = repo("wait");
      const npm = spawn(process.execPath, [join(copied.root, "scripts", "test.ts")], { cwd: copied.root, env: copied.env, stdio: "ignore", detached: true });
      holders.push(npm);
      const pid = npm.pid ?? 0;
      const exited = new Promise<number | null>((resolve) => npm.once("exit", (code) => resolve(code)));
      for (let waited = 0; !existsSync(copied.seen); waited += 50) {
        if (waited > 10_000) throw new Error("vitest was not launched");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const vitest = readSeen(copied).pid;
      try {
        const refused = acquireBenchLock({ file: copied.file, tool: "measure" });
        expect(refused.ok).toBe(false);
        if (!refused.ok) expect(refused.message).toContain(`The bench lock is held by test (PID ${pid}`);

        deliver(pid, signal);

        expect(await exited).not.toBe(0);
        expect(readFileSync(copied.signals, "utf8").trim().split("\n")).toEqual([signal, "cleaned lock=held"]);
        expect(existsSync(copied.file)).toBe(false);
      } finally {
        if (spawnSync("ps", ["-p", String(vitest)]).status === 0) process.kill(vitest, "SIGKILL");
      }
    });
  }
});

// Emplacement du verrou du banc (#92), lu par un processus enfant sous un
// HOME et un XDG_STATE_HOME temporaires : jamais le dossier d'état réel.
describe("bench lock file", () => {
  // Lance `code` dans un module ES où `lock` est le module du verrou du banc.
  function inModule(code: string, env: NodeJS.ProcessEnv) {
    const script = `const lock = await import(process.argv[1]);\n${code}`;
    return spawnSync(process.execPath, ["--input-type=module", "-e", script, MODULE], { env, encoding: "utf8" });
  }

  function envWith(state: string | undefined): { env: NodeJS.ProcessEnv; home: string } {
    const { XDG_STATE_HOME: _state, ...inherited } = process.env;
    const home = mkdtempSync(join(tmpdir(), "mb-home-"));
    return { env: { ...inherited, HOME: home, ...(state === undefined ? {} : { XDG_STATE_HOME: state }) }, home };
  }

  function lockFileUnder(state: string | undefined): { file: string; home: string } {
    const { env, home } = envWith(state);
    const child = inModule("console.log(lock.BENCH_LOCK_FILE);", env);
    expect(child.stderr).toBe("");
    return { file: child.stdout.trim(), home };
  }

  it("lies in $XDG_STATE_HOME/migrabench/ when XDG_STATE_HOME is an absolute path", () => {
    const state = mkdtempSync(join(tmpdir(), "mb-state-"));

    expect(lockFileUnder(state).file).toBe(join(state, "migrabench", "bench-lock"));
  });

  it("lies in ~/.local/state/migrabench/ when XDG_STATE_HOME is not set", () => {
    const { file, home } = lockFileUnder(undefined);

    expect(file).toBe(join(home, ".local", "state", "migrabench", "bench-lock"));
  });

  it("lies in ~/.local/state/migrabench/ when XDG_STATE_HOME is not an absolute path", () => {
    for (const state of ["relative/state", ""]) {
      const { file, home } = lockFileUnder(state);

      expect(file).toBe(join(home, ".local", "state", "migrabench", "bench-lock"));
    }
  });

  it("is taken in a directory created when missing", () => {
    const state = join(mkdtempSync(join(tmpdir(), "mb-state-")), "not-yet");
    const { env } = envWith(state);

    const child = inModule('const taken = lock.acquireBenchLock({ tool: "oracle" }); console.log(taken.ok); taken.release();', env);

    expect(child.stdout.trim()).toBe("true");
    expect(existsSync(join(state, "migrabench"))).toBe(true);
  });

  it("keeps its takeover guard next to it, in the same directory", async () => {
    const state = mkdtempSync(join(tmpdir(), "mb-state-"));
    const { env } = envWith(state);
    const file = join(state, "migrabench", "bench-lock");
    mkdirSync(join(state, "migrabench"));
    await killHard(await hold(file, "oracle"));
    await killHard(await hold(join(state, "migrabench", "bench-lock.takeover"), "measure"));

    const child = inModule('const taken = lock.acquireBenchLock({ tool: "stack-up" }); console.log(taken.ok ? "taken" : taken.message);', env);

    expect(child.stdout).toContain(`rm ${join(state, "migrabench", "bench-lock.takeover")}`);
  });
});

// #163 : Vitest ne démarre que sous le verrou du banc tenu par `npm test`.
// Son globalSetup (tests/bench-lock-held.setup.ts) appelle npmTestLockProblem.
describe("vitest only under the bench lock held by npm test", () => {
  const USE_NPM_TEST = "use npm test -- <file>";

  function held(tool: "test" | "measure") {
    const file = lockFile();
    const lock = acquireBenchLock({ tool, file });
    if (!lock.ok) throw new Error(lock.message);
    return { file, release: lock.release };
  }

  it("refuses without the variable set by npm test", () => {
    const { file, release } = held("test");
    try {
      expect(npmTestLockProblem({}, file)).toContain(USE_NPM_TEST);
    } finally {
      release();
    }
  });

  it("refuses when the bench lock is free", () => {
    expect(npmTestLockProblem({ [NPM_TEST_PID]: String(process.pid) }, lockFile())).toContain(USE_NPM_TEST);
  });

  it("refuses when another bench tool holds the bench lock", () => {
    const { file, release } = held("measure");
    try {
      const problem = npmTestLockProblem({ [NPM_TEST_PID]: String(process.pid) }, file);
      expect(problem).toContain("The bench lock is held by measure");
      expect(problem).toContain(USE_NPM_TEST);
    } finally {
      release();
    }
  });

  it("refuses when npm test holds the bench lock under another PID", () => {
    const { file, release } = held("test");
    try {
      expect(npmTestLockProblem({ [NPM_TEST_PID]: String(process.pid + 1) }, file)).toContain(USE_NPM_TEST);
    } finally {
      release();
    }
  });

  it("accepts the bench lock held by the npm test that launched vitest", () => {
    const { file, release } = held("test");
    try {
      expect(npmTestLockProblem({ [NPM_TEST_PID]: String(process.pid) }, file)).toBeUndefined();
    } finally {
      release();
    }
  });

  // Témoin : le vrai Vitest, lancé directement depuis le dépôt, refuse avant
  // tout test. Ce Vitest-ci tient le verrou du banc, mais pas pour lui.
  it("stops a real vitest launched directly, before any test", () => {
    const root = new URL("..", import.meta.url).pathname;
    const { [NPM_TEST_PID]: _pid, ...env } = process.env;

    const direct = spawnSync(process.execPath, [join(root, "node_modules", "vitest", "vitest.mjs"), "run", "tests/ci-scope.test.ts"], { cwd: root, env, encoding: "utf8" });

    expect(direct.status).not.toBe(0);
    expect(direct.stdout + direct.stderr).toContain(USE_NPM_TEST);
    expect(direct.stdout + direct.stderr).not.toMatch(/Test Files .* passed/);
  }, 60_000);
});
