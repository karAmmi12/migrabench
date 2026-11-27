// Registre des portes (spec de l'étape 4, « Registre, contexte et ordre ») :
// les portes d'une mesure, dans un ordre fixe, et leur exécution. Ajouter une
// porte : un module sous gates/ et une ligne dans GATES, à sa place.
//
// Une porte sépare sa préparation (avant de lire quoi que ce soit du
// candidat) de son examen. Le registre pose `stage` selon la partie qui a levé
// l'erreur, jamais d'après le message (ADR 0008).
import { type GateContext, StackIncident } from "./context.ts";
import { accessibilityGate } from "./accessibility.ts";
import { lighthouseGate } from "./lighthouse.ts";
import { relayGate } from "./relay.ts";
import { witnessValueGate } from "./witness-value.ts";
import { xssGate } from "./xss.ts";
import { type GateErrorCause, type GateErrorStage, type GateResult, type GateResultKind, errored } from "./result.ts";

// Groupes, dans l'ordre où leurs portes tournent : celles qui ne lisent que
// des fichiers, celles à navigateur qui ne font que lire, celles qui écrivent,
// puis la porte du relais, après la requête témoin `end` et le contrôle du
// journal d'accès.
export const GATE_GROUPS = ["files", "browser-read", "writes", "relay"] as const;
export type GateGroup = (typeof GATE_GROUPS)[number];

// Délai global de la phase `gates`, de conception et généreux, étalonné par
// #100.
export const GATES_PHASE_TIMEOUT_MS = 30 * 60_000;

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
  // Outils que la porte épingle et leur version installée, enregistrés dans
  // l'environnement de la mesure (`gateTools`), par exemple `axe-core`.
  tools?(): Record<string, string>;
}

// Portes de la mesure, dans l'ordre fixe.
export const GATES: readonly Gate[] = [witnessValueGate as Gate, accessibilityGate as Gate, xssGate as Gate, lighthouseGate as Gate, relayGate as Gate];

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

// Outils épinglés par les portes, pour l'environnement de la mesure. Un même
// outil ne peut pas y avoir deux versions.
export function gateTools(gates: readonly Gate[]): Record<string, string> {
  const tools: Record<string, string> = {};
  const pinnedBy: Record<string, string> = {};
  for (const gate of gates) {
    for (const [tool, version] of Object.entries(gate.tools?.() ?? {})) {
      const known = tools[tool];
      if (known !== undefined && known !== version) throw new Error(`Tool ${tool} is pinned at ${known} by gate ${pinnedBy[tool]} and at ${version} by gate ${gate.name}`);
      tools[tool] = version;
      pinnedBy[tool] = gate.name;
    }
  }
  return tools;
}

// Portes de la phase `gates`, pendant que le candidat tourne, ou de la
// clôture, après la requête témoin `end` : la porte du relais.
export function gatesOf(gates: readonly Gate[], phase: "gates" | "closing"): Gate[] {
  const inClosing = (gate: Gate) => gate.group === "relay";
  return gates.filter((gate) => (phase === "closing" ? inClosing(gate) : !inClosing(gate)));
}

export interface RunGatesOptions {
  // Échéance de la phase (horodatage en ms) : une porte qui l'atteint est
  // arrêtée, et une porte atteinte après elle ne tourne pas.
  deadline?: number;
  // Après chaque porte : le relevé de l'état de la pile par le runner. Son
  // erreur arrête les portes et est levée telle quelle.
  afterEach?: (gate: Gate) => Promise<void>;
  // Liste où ranger les résultats au fil des portes : ceux des portes déjà
  // passées y restent si une erreur arrête les suivantes.
  results?: GateResult[];
}

// Lance les portes une à une, dans l'ordre donné. Une panne de la pile
// (StackIncident) et des résultats qui ne correspondent pas à la déclaration
// de la porte (une erreur du banc) sont levés.
export async function runGates(gates: readonly Gate[], context: Omit<GateContext, "signal">, { deadline, afterEach, results = [] }: RunGatesOptions = {}): Promise<GateResult[]> {
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
  if (remaining <= 0) return fail("on-candidate", "gates-phase-timeout", `Gate ${gate.name} not run: the gates phase exceeded its deadline`);
  const timeoutMs = Math.min(gate.timeoutMs, remaining);
  // L'échéance de la phase vient avant le délai de la porte : elle ne rend
  // jamais la mesure invalide (règle 7), le temps ayant été pris par les
  // portes précédentes.
  const cutByPhase = remaining < gate.timeoutMs;
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new GateTimeout(cutByPhase ? `Gate ${gate.name} cut by the gates phase deadline after ${timeoutMs} ms` : `Gate ${gate.name} exceeded its timeout of ${timeoutMs} ms`));
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
    const message = error instanceof Error ? error.message : String(error);
    // Coupée par l'échéance de la phase : pendant la préparation, elle n'a
    // rien examiné (`gates-phase-timeout`) ; pendant l'examen, elle a pu en
    // examiner une partie (`timeout`). Toujours `on-candidate`.
    if (error instanceof GateTimeout && cutByPhase) return fail("on-candidate", stage === "before-candidate" ? "gates-phase-timeout" : "timeout", message);
    const cause: GateErrorCause = error instanceof GateTimeout ? "timeout" : error instanceof ToolMissing ? "tool-missing" : "exception";
    return fail(stage, cause, message);
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
