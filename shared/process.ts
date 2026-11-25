// Lancement des commandes du banc depuis la racine du dépôt (Git, Docker,
// Playwright), partagé par l'oracle et le runner.
import { AsyncLocalStorage } from "node:async_hooks";
import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { ROOT } from "./root.ts";

export interface SpawnOptions {
  // Variables ajoutées à l'environnement du processus courant.
  env?: Record<string, string>;
  // Sorties affichées dans le terminal au lieu d'être capturées ; avec
  // `logFile`, affichées et ajoutées au fichier.
  inherit?: boolean;
  // Fichier où ajouter la sortie standard et la sortie d'erreur mêlées (brut d'une phase).
  logFile?: string;
  // Rendre le code au lieu de rejeter quand la commande échoue.
  allowFailure?: boolean;
  // Lancée par une tâche interruptible (#71) : la commande tourne dans son
  // propre groupe de processus, que l'interruption arrête en entier. Hors
  // d'une tâche interruptible, l'option est sans effet : Ctrl+C doit atteindre
  // la commande par le groupe de premier plan, faute de relais.
  processGroup?: boolean;
  // Signal d'abandon : la commande est alors arrêtée par SIGKILL, et son
  // code rendu comme celui d'une commande en échec.
  abort?: AbortSignal;
}

export interface SpawnResult {
  code: number;
  // Sortie standard capturée, vide avec `inherit` seul.
  stdout: string;
  // Sortie d'erreur capturée, vide avec `inherit` seul.
  stderr: string;
}

export function spawnCommand(
  command: string,
  args: readonly string[],
  { env = {}, inherit = false, logFile, allowFailure = false, processGroup = false, abort }: SpawnOptions = {},
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const scope = interruptible.getStore();
    if (scope?.interruptedBy !== undefined) return reject(new CommandsInterrupted(scope.interruptedBy));
    const tee = inherit && logFile !== undefined;
    const output = inherit && !tee ? "inherit" : "pipe";
    const detached = processGroup && scope !== undefined;
    const child = spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", output, output], detached });
    const log = logFile === undefined ? undefined : createWriteStream(logFile, { flags: "a" });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      log?.write(chunk);
      if (tee) process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      log?.write(chunk);
      if (tee) process.stderr.write(chunk);
    });
    scope?.children.add(child);
    if (detached && child.pid !== undefined) scope?.groups.add(child.pid);
    const stop = () => child.kill("SIGKILL");
    if (abort?.aborted) stop();
    else abort?.addEventListener("abort", stop, { once: true });
    child.on("error", reject);
    child.on("close", (code) => {
      scope?.children.delete(child);
      abort?.removeEventListener("abort", stop);
      const done = () => {
        if (code === 0 || allowFailure) resolve({ code: code ?? 1, stdout, stderr });
        else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}${stderr === "" ? "" : `: ${stderr.trim()}`}`));
      };
      if (log === undefined) done();
      else log.end(done);
    });
  });
}

// Sortie standard d'une commande qui doit réussir, sans les blancs des bords.
export async function stdoutOf(command: string, args: readonly string[]): Promise<string> {
  return (await spawnCommand(command, args)).stdout.trim();
}

// Commandes interruptibles (#71) : celles qu'une tâche lance, directement ou
// par ses rappels et ses minuteries, depuis `run`. `interrupt` relaie le
// signal reçu à celles qui tournent (à tout leur groupe pour celles lancées
// avec `processGroup`), et toute commande lancée ensuite par la tâche est
// refusée : la tâche ne peut plus rien démarrer. `kill` arrête par SIGKILL ce
// qui reste, groupes compris, même ce qui a survécu au chef de son groupe.
// Les commandes lancées hors de la tâche restent permises.
interface InterruptibleScope {
  children: Set<ChildProcess>;
  // Groupes de processus créés par la tâche, gardés après la fin de leur chef.
  groups: Set<number>;
  interruptedBy?: NodeJS.Signals;
}

const interruptible = new AsyncLocalStorage<InterruptibleScope>();

interface InterruptibleCommands<T> {
  result: Promise<T>;
  interrupt: (signal: NodeJS.Signals) => void;
  kill: () => void;
}

export function interruptibleCommands<T>(run: () => Promise<T>): InterruptibleCommands<T> {
  const scope: InterruptibleScope = { children: new Set(), groups: new Set() };
  const send = (signal: NodeJS.Signals) => {
    for (const group of scope.groups) signalGroup(group, signal);
    for (const child of scope.children) if (child.pid === undefined || !scope.groups.has(child.pid)) child.kill(signal);
  };
  return {
    result: interruptible.run(scope, run),
    interrupt: (signal) => {
      scope.interruptedBy ??= signal;
      send(signal);
    },
    kill: () => {
      scope.interruptedBy ??= "SIGKILL";
      send("SIGKILL");
    },
  };
}

// Un groupe déjà vide n'est pas une erreur.
function signalGroup(group: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-group, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

class CommandsInterrupted extends Error {
  constructor(signal: NodeJS.Signals) {
    super(`Command refused: interrupted by ${signal}`);
    this.name = "CommandsInterrupted";
  }
}
