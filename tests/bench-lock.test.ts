// Verrou du banc (spec de l'étape 3, « Verrou du banc », Seam 3), par des
// processus réels : prise, refus, refus de `pretest`, reprise d'un verrou du
// banc orphelin, refus de déposséder un détenteur vivant.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireBenchLock, BENCH_LOCK_FILE_FROM_ROOT } from "../shared/bench-lock.ts";

const HOLD = new URL("./fixtures/bench-lock/hold.ts", import.meta.url).pathname;
const CHECK = new URL("../scripts/check-bench-lock.ts", import.meta.url).pathname;
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
      expect(lock.message).toContain('pgrep -fl "runner/cli.ts|oracle/cli.ts|scripts/stack-up.ts"');
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
    });
  }
});

// `pretest` vérifie le verrou du banc à la racine de son dépôt : le contrôle
// et le module sont copiés dans un dépôt temporaire, dont le fichier du
// verrou du banc est le cas.
describe("pretest check of the bench lock", () => {
  function repo(): { root: string; file: string } {
    const root = mkdtempSync(join(tmpdir(), "mb-pretest-"));
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "shared"));
    copyFileSync(CHECK, join(root, "scripts", "check-bench-lock.ts"));
    copyFileSync(MODULE, join(root, "shared", "bench-lock.ts"));
    return { root, file: join(root, ".bench-lock") };
  }

  function pretest(root: string) {
    const { status, stderr } = spawnSync(process.execPath, [join(root, "scripts", "check-bench-lock.ts")], { encoding: "utf8" });
    return { status, stderr };
  }

  it("lets npm test run when the bench lock is free", () => {
    expect(pretest(repo().root)).toEqual({ status: 0, stderr: "" });
  });

  it("refuses npm test while a bench tool holds the bench lock, naming it, without taking it", async () => {
    const { root, file } = repo();
    const holder = await hold(file, "measure", "20261123T090507Z-454fb76-reference-candidate");
    const held = readFileSync(file, "utf8");

    const outcome = pretest(root);

    expect(outcome.status).not.toBe(0);
    expect(outcome.stderr).toContain("npm test");
    expect(outcome.stderr).toContain(`measure (PID ${holder.pid}`);
    expect(outcome.stderr).toContain("20261123T090507Z-454fb76-reference-candidate");
    expect(readFileSync(file, "utf8")).toBe(held);
  });

  it("lets npm test run over an orphan bench lock, which it leaves in place", async () => {
    const { root, file } = repo();
    await killHard(await hold(file, "oracle"));
    const orphan = readFileSync(file, "utf8");

    expect(pretest(root).status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(orphan);
  });
});

describe("bench lock file", () => {
  it("lies at the root of the repository and is ignored by Git, with its drafts and its takeover guard", () => {
    const paths = [BENCH_LOCK_FILE_FROM_ROOT, `${BENCH_LOCK_FILE_FROM_ROOT}.4242.draft`, `${BENCH_LOCK_FILE_FROM_ROOT}.takeover`];
    const ignored = spawnSync("git", ["check-ignore", ...paths], { encoding: "utf8" }).stdout.trim().split("\n");

    expect(BENCH_LOCK_FILE_FROM_ROOT).toBe(".bench-lock");
    expect(ignored).toEqual(paths);
  });
});
