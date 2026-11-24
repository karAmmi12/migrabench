// État des services de la pile, legacy et service d'archivage (spec de
// l'étape 3, règles `stack-failed-before-candidate` et
// `stack-down-while-candidate`, #68). Relevé par `docker inspect`, il est la
// preuve d'une pile qui n'est pas devenue saine, et permet de voir qu'un
// service est tombé pendant que le candidat tournait : arrêté, redémarré,
// remplacé ou malade.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { citedFileSha256 as digestOf } from "../shared/digest.ts";
import { spawnCommand } from "../shared/process.ts";
import { SERVICES, type StackService } from "./stack-images.ts";

export interface ServiceState {
  service: StackService;
  // Absent : aucun conteneur pour le service.
  container?: {
    id: string;
    status: string;
    running: boolean;
    exitCode: number;
    error: string;
    startedAt: string;
    restartCount: number;
    // Absent si l'image n'a pas de healthcheck.
    health?: string;
    // Dernier relevé du healthcheck.
    lastHealthCheck?: { exitCode: number; output: string };
  };
}

interface Inspected {
  Id: string;
  RestartCount: number;
  State: {
    Status: string;
    Running: boolean;
    ExitCode: number;
    Error: string;
    StartedAt: string;
    Health?: { Status: string; Log?: { ExitCode: number; Output: string }[] | null };
  };
}

// État d'un service, à partir d'un objet de `docker inspect` (ou `undefined`
// sans conteneur).
export function serviceState(service: StackService, inspected: unknown): ServiceState {
  if (inspected === undefined) return { service };
  const { Id, RestartCount, State } = inspected as Inspected;
  const last = State.Health?.Log?.at(-1);
  return {
    service,
    container: {
      id: Id,
      status: State.Status,
      running: State.Running,
      exitCode: State.ExitCode,
      error: State.Error,
      startedAt: State.StartedAt,
      restartCount: RestartCount,
      ...(State.Health === undefined ? {} : { health: State.Health.Status }),
      ...(last === undefined ? {} : { lastHealthCheck: { exitCode: last.ExitCode, output: last.Output.trim() } }),
    },
  };
}

// Chaque service a un conteneur en marche et sain.
export function isHealthy(states: readonly ServiceState[]): boolean {
  return states.every(({ container }) => container !== undefined && container.running && container.health === "healthy");
}

// Une ligne par service : la preuve de l'état de la pile.
export function describeStack(states: readonly ServiceState[]): string {
  return states.map(describeService).join("\n");
}

function describeService({ service, container }: ServiceState): string {
  if (container === undefined) return `${service}: no container`;
  const { id, status, exitCode, error, health, startedAt, restartCount, lastHealthCheck } = container;
  const parts = [`${service}: container ${id.slice(0, 12)} ${status}`, `exit code ${exitCode}`];
  if (error !== "") parts.push(`error ${error}`);
  if (health !== undefined) parts.push(`health ${health}`);
  parts.push(`started ${startedAt}`, `restarts ${restartCount}`);
  const line = parts.join(", ");
  return health !== undefined && health !== "healthy" && lastHealthCheck !== undefined
    ? `${line}; last health check: exit ${lastHealthCheck.exitCode}: ${lastHealthCheck.output}`
    : line;
}

export interface StackDown {
  services: StackService[];
  // Chaque service tombé, la raison, puis son état.
  detail: string;
}

// Services tombés entre deux relevés : le premier pris quand la pile venait
// d'être recréée et saine, le second à la fin de l'oracle. Un service tombé
// est absent, remplacé, arrêté, redémarré ou malade.
export function stackDown(before: readonly ServiceState[], after: readonly ServiceState[]): StackDown | undefined {
  const down = after.flatMap((state) => {
    const reason = downReason(before.find(({ service }) => service === state.service), state);
    return reason === undefined ? [] : [{ state, reason }];
  });
  if (down.length === 0) return undefined;
  return {
    services: down.map(({ state }) => state.service),
    detail: down.map(({ state, reason }) => `${state.service} is down: ${reason}. ${describeService(state)}`).join("\n"),
  };
}

function downReason(before: ServiceState | undefined, { container }: ServiceState): string | undefined {
  if (container === undefined) return "no container";
  if (before?.container === undefined || before.container.id !== container.id) return "container replaced";
  if (!container.running) return "not running";
  if (container.startedAt !== before.container.startedAt || container.restartCount !== before.container.restartCount) return "restarted";
  if (container.health !== undefined && container.health !== "healthy") return container.health;
  return undefined;
}

// Relève l'état du legacy et du service d'archivage, conteneurs arrêtés
// compris, dans le projet Compose de la pile.
export async function stackStates(): Promise<ServiceState[]> {
  const states: ServiceState[] = [];
  for (const service of SERVICES) {
    const { stdout } = await spawnCommand("docker", ["compose", "ps", "--all", "--quiet", service]);
    const id = stdout.trim().split("\n")[0] ?? "";
    if (id === "") {
      states.push(serviceState(service, undefined));
      continue;
    }
    const [inspected] = JSON.parse((await spawnCommand("docker", ["inspect", id])).stdout) as unknown[];
    states.push(serviceState(service, inspected));
  }
  return states;
}

// Sorties de chaque service nommé, ajoutées aux bruts (`stack/<service>.log`) :
// rend leurs empreintes, par leur chemin dans `rawDir`. Un relevé en échec
// n'empêche pas l'issue qu'il accompagne : le brut garde le message.
export async function saveServiceLogs(rawDir: string, services: readonly StackService[]): Promise<Record<string, string>> {
  const raw: Record<string, string> = {};
  await mkdir(join(rawDir, "stack"), { recursive: true });
  for (const service of services) {
    const path = `stack/${service}.log`;
    await spawnCommand("docker", ["compose", "logs", "--no-color", "--timestamps", service], { logFile: join(rawDir, path), allowFailure: true });
    raw[path] = await digestOf(join(rawDir, path));
  }
  return raw;
}
