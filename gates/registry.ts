// Registre des portes (spec de l'étape 4, « Registre, contexte et ordre ») :
// les portes d'une mesure, dans un ordre fixe, et leur exécution. Ajouter une
// porte : un module sous gates/ et une ligne dans GATES, à sa place.
//
// Une porte sépare sa préparation (avant de lire quoi que ce soit du
// candidat) de son examen. Le registre pose `stage` selon la partie qui a levé
// l'erreur, jamais d'après le message (ADR 0008).
import { type GateContext, StackIncident } from "./context.ts";
import { relayGate } from "./relay.ts";
import { type GateErrorCause, type GateErrorStage, type GateResult, type GateResultKind, errored } from "./result.ts";

// Groupes, dans l'ordre où leurs portes tournent : celles qui ne lisent que
// des fichiers, celles à navigateur qui ne font que lire, celles qui écrivent,
// puis la porte du relais, après la requête témoin `end` et le contrôle du
// journal d'accès.
export const GATE_GROUPS = ["files", "browser-read", "writes", "relay"] as const;
export type GateGroup = (typeof GATE_GROUPS)[number];

export interface Gate<Prepared = unknown> {
  name: string;
  group: GateGroup;
  // Résultats nommés de la porte et leur sorte.
  results: Readonly<Record<string, GateResultKind>>;
  // Délai de conception, généreux, pour la préparation et l'examen ensemble.
  timeoutMs: number;
  // Préparation, avant le candidat : une erreur y rend la mesure invalide.
  prepare?(context: GateContext): Promise<Prepared>;
  // Examen du candidat : une erreur y est un échec distinct (`errored`).
  examine(context: GateContext, prepared: Prepared): Promise<GateResult[]>;
}

// Portes de la mesure, dans l'ordre fixe.
export const GATES: readonly Gate[] = [relayGate as Gate];

// Outil d'analyse absent : cause `tool-missing`, à l'étape où il manque.
export class ToolMissing extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolMissing";
  }
}

// Refuse un registre dont l'ordre n'est pas celui des groupes, ou qui nomme
// deux fois la même porte.
export function checkGateOrder(gates: readonly Gate[]): void {
  const seen = new Set<string>();
  gates.forEach((gate, index) => {
    if (seen.has(gate.name)) throw new Error(`Gate ${gate.name} is registered twice`);
    seen.add(gate.name);
    const previous = gates[index - 1];
    if (previous !== undefined && GATE_GROUPS.indexOf(gate.group) < GATE_GROUPS.indexOf(previous.group)) {
      throw new Error(`Gate ${gate.name} (${gate.group}) comes after gate ${previous.name} (${previous.group})`);
    }
  });
}
checkGateOrder(GATES);

// Portes de la phase `gates`, pendant que le candidat tourne, ou de la
// clôture, après la requête témoin `end` : la porte du relais.
export function gatesOf(gates: readonly Gate[], phase: "gates" | "closing"): Gate[] {
  return gates.filter(({ group }) => (group === "relay") === (phase === "closing"));
}

export interface RunGatesOptions {
  // Échéance de la phase (horodatage en ms) : une porte qui l'atteint est
  // arrêtée, et une porte atteinte après elle ne tourne pas.
  deadline?: number;
  // Après chaque porte : le relevé de l'état de la pile par le runner. Son
  // erreur arrête les portes et est levée telle quelle.
  afterEach?: (gate: Gate) => Promise<void>;
}

// Lance les portes une à une, dans l'ordre donné. Une panne de la pile
// (StackIncident) et des résultats qui ne correspondent pas à la déclaration
// de la porte (une erreur du banc) sont levés.
export async function runGates(gates: readonly Gate[], context: Omit<GateContext, "signal">, { deadline, afterEach }: RunGatesOptions = {}): Promise<GateResult[]> {
  const results: GateResult[] = [];
  for (const gate of gates) {
    results.push(...(await runGate(gate, context, deadline)));
    await afterEach?.(gate);
  }
  return results;
}

class GateTimeout extends Error {}

async function runGate(gate: Gate, context: Omit<GateContext, "signal">, deadline: number | undefined): Promise<GateResult[]> {
  const fail = (stage: GateErrorStage, cause: GateErrorCause, message: string) =>
    Object.entries(gate.results).map(([name, kind]) => errored({ gate: gate.name, name, kind, error: { stage, cause, message } }));
  const remaining = deadline === undefined ? Infinity : deadline - Date.now();
  if (remaining <= 0) return fail("on-candidate", "timeout", `Gate ${gate.name} not run: the gates phase exceeded its deadline`);
  const timeoutMs = Math.min(gate.timeoutMs, remaining);
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new GateTimeout(`Gate ${gate.name} exceeded its timeout of ${timeoutMs} ms`));
    }, timeoutMs);
  });
  const gateContext: GateContext = { ...context, signal: controller.signal };
  let stage: GateErrorStage = "before-candidate";
  let results: GateResult[];
  try {
    const prepared = await Promise.race([gate.prepare?.(gateContext), timedOut]);
    stage = "on-candidate";
    results = await Promise.race([gate.examine(gateContext, prepared), timedOut]);
  } catch (error) {
    if (error instanceof StackIncident) throw error;
    const cause: GateErrorCause = error instanceof GateTimeout ? "timeout" : error instanceof ToolMissing ? "tool-missing" : "exception";
    return fail(stage, cause, error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
  checkDeclared(gate, results);
  return results;
}

// Les résultats rendus sont exactement ceux que la porte déclare, de la
// sorte déclarée.
function checkDeclared(gate: Gate, results: readonly GateResult[]): void {
  const expected = Object.keys(gate.results);
  for (const result of results) {
    if (result.gate !== gate.name) throw new Error(`Gate ${gate.name} returned a result of gate ${result.gate}`);
    const declared = gate.results[result.name];
    if (declared !== undefined && declared !== result.kind) throw new Error(`Gate ${gate.name} returned ${result.name} as ${result.kind}, declared ${declared}`);
  }
  const returned = results.map(({ name }) => name);
  if (returned.length !== expected.length || expected.some((name) => !returned.includes(name))) {
    throw new Error(`Gate ${gate.name} returned ${returned.join(", ")}, expected ${expected.join(", ")}`);
  }
}

// Délai global de la phase `gates`, de conception et généreux, étalonné par
// #100.
export const GATES_PHASE_TIMEOUT_MS = 30 * 60_000;
