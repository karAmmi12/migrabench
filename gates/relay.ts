// Porte du relais (spec de l'étape 4, « Porte du relais ») : un candidat ne
// touche pas le port 8080 du legacy. Elle lit le journal d'accès du legacy,
// figé et contrôlé à la clôture après la requête témoin `end`
// (runner/witness.ts) : seul le port 8080 y est journalisé.
//
// - `examined` : les lignes lues de `start-1` à `end`, témoins et healthcheck
//   compris ;
// - `findings` : toute ligne qui n'est ni une requête témoin ni le
//   healthcheck, quel que soit son chemin (le legacy ne sert aucune
//   ressource statique, #70). Chaque constat donne son numéro de ligne dans le
//   journal et la ligne ;
// - `values` : aucune clé.
//
// Le healthcheck est écarté par son adresse source seulement, jamais par son
// User-Agent, que le candidat pourrait fabriquer.
import { readFile } from "node:fs/promises";
import type { WitnessPosition } from "../runner/access-log.ts";
import type { GateContext } from "./context.ts";
import type { Gate } from "./registry.ts";
import { judged } from "./result.ts";

// Adresse source du healthcheck du legacy (docker-compose.yml), lancé dans
// son conteneur : `%a` de la valve d'accès.
const HEALTHCHECK_ADDRESS = "0:0:0:0:0:0:0:1";
// Délai de conception : la lecture d'un fichier.
const RELAY_TIMEOUT_MS = 30_000;

export interface RelayFinding {
  // Numéro de la ligne dans le journal, à partir de 1.
  line: number;
  entry: string;
}

// Lit la fenêtre de la première requête témoin (`start-1`) à la dernière
// (`end`), positions données par le contrôle du journal.
export function examineRelay({ log, witnesses }: { log: string; witnesses: readonly WitnessPosition[] }): { examined: number; findings: RelayFinding[] } {
  const first = witnesses[0]?.line;
  const last = witnesses.at(-1)?.line;
  if (first === undefined || last === undefined) throw new Error("The access log has no witness request");
  const lines = log.split("\n").filter((entry) => entry !== "");
  const witnessLines = new Set(witnesses.map(({ line }) => line));
  const findings: RelayFinding[] = [];
  for (let line = first; line <= last; line++) {
    const entry = lines[line - 1] ?? "";
    if (!witnessLines.has(line) && sourceAddress(entry) !== HEALTHCHECK_ADDRESS) findings.push({ line, entry });
  }
  return { examined: last - first + 1, findings };
}

// `%a` est le troisième champ de la ligne (fixtures/legacy-app/access-log/).
function sourceAddress(entry: string): string | undefined {
  return entry.split(" ")[2];
}

type CheckedAccessLog = NonNullable<GateContext["accessLog"]>;

export const relayGate: Gate<CheckedAccessLog> = {
  name: "relay",
  group: "relay",
  results: { "legacy-port-untouched": "judged" },
  timeoutMs: RELAY_TIMEOUT_MS,
  // Le journal contrôlé est une entrée du banc : sans lui, rien n'est lu du candidat.
  prepare: async ({ accessLog }) => {
    if (accessLog === undefined) throw new Error("No access log checked ok for the relay gate");
    return accessLog;
  },
  examine: async (_context, { file, digest, witnesses }) => {
    const { examined, findings } = examineRelay({ log: await readFile(file, "utf8"), witnesses });
    return [judged({ gate: "relay", name: "legacy-port-untouched", examined, passed: findings.length === 0, findings, raw: { "access.log": digest } })];
  },
};
