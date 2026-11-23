// Verrou du banc (spec de l'étape 3, « Verrou du banc ») : un fichier à la
// racine du dépôt, ignoré par Git, que prennent `migrabench measure`,
// `npm run oracle` et `npm run stack:up` pour toute leur durée, et que
// `pretest` vérifie sans le prendre. Deux outils du banc ne partagent jamais
// la pile.
//
// Sans dépendance hors de Node : le module est copié tel quel dans un dépôt
// temporaire par les tests de `pretest`.
import { spawnSync } from "node:child_process";
import { linkSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";

export type BenchTool = "measure" | "oracle" | "stack-up";

// Fichier du verrou du banc, à la racine du dépôt.
export const BENCH_LOCK_FILE_FROM_ROOT = ".bench-lock";
export const BENCH_LOCK_FILE = fileURLToPath(new URL(`../${BENCH_LOCK_FILE_FROM_ROOT}`, import.meta.url));

// Ce qui reconnaît un processus : un PID seul peut être réattribué.
export interface ProcessIdentity {
  pid: number;
  // Heure de démarrage du processus, telle que `ps` la donne.
  startedAt: string;
  // Ligne de commande du processus, telle que `ps` la donne.
  command: string;
}

// Contenu du fichier du verrou du banc.
export interface BenchLockHolder extends ProcessIdentity {
  tool: BenchTool;
  host: string;
  measureId?: string;
  // Heure de prise, ISO 8601.
  takenAt: string;
}

// Verrou du banc orphelin repris : les trois valeurs qui reconnaissent son
// processus, et son outil. Enregistré dans `environment.lock` d'une mesure.
export type TakenOver = Pick<BenchLockHolder, "tool" | "pid" | "startedAt" | "command">;

export type BenchLock =
  | { ok: true; holder: BenchLockHolder; takenOver?: TakenOver; release: () => void }
  // Refus : le verrou du banc est tenu, par `holder`.
  | { ok: false; holder: BenchLockHolder; message: string };

export interface AcquireOptions {
  tool: BenchTool;
  measureId?: string;
  file?: string;
}

// Prend le verrou du banc, en reprenant un verrou du banc orphelin, ou rend le
// refus. Un détenteur vivant n'est jamais dépossédé.
export function acquireBenchLock({ tool, measureId, file = BENCH_LOCK_FILE }: AcquireOptions): BenchLock {
  const self = processIdentity(process.pid);
  if (self === undefined) throw new Error(`Cannot read the identity of process ${process.pid} with ps`);
  const holder: BenchLockHolder = {
    tool,
    ...self,
    host: hostname(),
    ...(measureId === undefined ? {} : { measureId }),
    takenAt: new Date().toISOString(),
  };
  const text = `${JSON.stringify(holder, null, 2)}\n`;
  const taken = (takenOver?: TakenOver): BenchLock => ({
    ok: true,
    holder,
    ...(takenOver === undefined ? {} : { takenOver }),
    release: () => release(file, text),
  });
  // Quelques tentatives : entre deux lectures, un autre outil peut libérer,
  // prendre ou reprendre le verrou du banc.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (createExclusive(file, text)) return taken();
    const held = readText(file);
    if (held === undefined) continue;
    const current = parseHolder(file, held);
    if (!isOrphan(current)) return { ok: false, holder: current, message: heldMessage(current) };
    const takeover = takeOver(file, held, text);
    if (takeover === "taken") {
      const { tool: orphanTool, pid, startedAt, command } = current;
      return taken({ tool: orphanTool, pid, startedAt, command });
    }
    if (takeover !== "retry") return { ok: false, ...takeover };
  }
  throw new Error(`The bench lock ${file} keeps changing: try again`);
}

// Ligne affichée par un outil du banc qui a repris un verrou du banc orphelin.
function takenOverNotice({ tool, pid, startedAt, command }: TakenOver): string {
  return `Took over an orphan bench lock of ${tool} (PID ${pid}, started ${startedAt}: ${command}).`;
}

// Prise par un outil du banc en ligne de commande : sur refus, le message sur
// la sortie d'erreur et le code 4 ; sur reprise, la ligne qui la signale.
export function acquireBenchLockOrExit(options: AcquireOptions): Extract<BenchLock, { ok: true }> {
  const lock = acquireBenchLock(options);
  if (!lock.ok) {
    console.error(`refused-lock: ${lock.message}`);
    process.exit(4);
  }
  if (lock.takenOver !== undefined) console.error(takenOverNotice(lock.takenOver));
  return lock;
}

// État du verrou du banc, sans le prendre (`pretest`) : libre, tenu, ou
// orphelin (il serait repris).
export type BenchLockState = { state: "free" } | { state: "held" | "orphan"; holder: BenchLockHolder };

export function inspectBenchLock(file = BENCH_LOCK_FILE): BenchLockState {
  const held = readText(file);
  if (held === undefined) return { state: "free" };
  const holder = parseHolder(file, held);
  return { state: isOrphan(holder) ? "orphan" : "held", holder };
}

// Message de refus : l'outil, son processus et l'heure de prise.
export function heldMessage({ tool, pid, startedAt, command, host, measureId, takenAt }: BenchLockHolder): string {
  const measure = measureId === undefined ? "" : `, measure ${measureId}`;
  return `The bench lock is held by ${tool} (PID ${pid} on ${host}, started ${startedAt}: ${command}${measure}), taken at ${takenAt}`;
}

// Orphelin : sur cette machine, aucun processus ne porte le PID, ou celui qui
// le porte a une autre heure de démarrage ou une autre ligne de commande. Sur
// une autre machine, rien ne se vérifie : jamais orphelin.
function isOrphan(holder: BenchLockHolder): boolean {
  if (holder.host !== hostname()) return false;
  const alive = processIdentity(holder.pid);
  return alive === undefined || alive.startedAt !== holder.startedAt || alive.command !== holder.command;
}

// Reprise d'un verrou du banc orphelin sous une garde exclusive : deux
// repreneurs ne suppriment jamais l'un le verrou du banc que l'autre vient de
// prendre. Rend "taken", "retry" (l'état a changé), ou le refus.
//
// Une garde dont le repreneur est mort pendant sa reprise n'est jamais
// retirée ici : la retirer sans course exigerait une seconde garde. Le refus
// demande de la retirer à la main ; un détenteur vivant n'est jamais dépossédé.
function takeOver(file: string, orphan: string, text: string): "taken" | "retry" | { message: string; holder: BenchLockHolder } {
  const guard = `${file}.takeover`;
  if (!createExclusive(guard, text)) {
    const held = readText(guard);
    if (held === undefined) return "retry";
    const other = parseHolder(guard, held);
    if (!isOrphan(other)) return { holder: other, message: `${heldMessage(other)} (taking over an orphan bench lock)` };
    return { holder: other, message: `${heldMessage(other)} (died while taking over an orphan bench lock): remove ${guard}, then try again` };
  }
  try {
    if (readText(file) !== orphan) return "retry";
    unlinkSync(file);
    return createExclusive(file, text) ? "taken" : "retry";
  } finally {
    unlinkSync(guard);
  }
}

function readText(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function parseHolder(file: string, text: string): BenchLockHolder {
  try {
    return JSON.parse(text) as BenchLockHolder;
  } catch {
    throw new Error(`The bench lock ${file} is not readable: remove it once no bench tool runs`);
  }
}

// Identité d'un processus vivant, ou undefined si aucun processus ne porte ce
// PID. `ps` en anglais et en UTC : la même valeur d'un appel à l'autre.
function processIdentity(pid: number): ProcessIdentity | undefined {
  const ps = (column: string) =>
    spawnSync("ps", ["-ww", "-o", `${column}=`, "-p", String(pid)], { encoding: "utf8", env: { ...process.env, LC_ALL: "C", TZ: "UTC" } });
  const started = ps("lstart");
  if (started.error) throw started.error;
  const startedAt = started.stdout.trim();
  if (started.status !== 0 || startedAt === "") return undefined;
  const command = ps("args").stdout.trim();
  return { pid, startedAt, command };
}

// Création exclusive et atomique : le fichier apparaît complet, ou la création
// échoue s'il existe déjà (false). Le brouillon porte le PID : un brouillon
// laissé par un processus mort de même PID est simplement réécrit.
function createExclusive(file: string, text: string): boolean {
  const draft = `${file}.${process.pid}.draft`;
  writeFileSync(draft, text);
  try {
    linkSync(draft, file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    unlinkSync(draft);
  }
}

// Ne supprime que le verrou du banc que ce processus a écrit.
function release(file: string, text: string): void {
  if (readText(file) === text) unlinkSync(file);
}
