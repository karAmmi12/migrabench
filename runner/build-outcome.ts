// Issue de la phase de construction (spec de l'étape 3, « Phases d'une mesure
// et leurs issues ») : fonctions pures, sans Docker.

// Codes d'erreur de npm reconnus comme une erreur réseau : connexion refusée ou
// coupée, DNS. Un délai réseau n'en fait pas partie : `fetch-timeout` se règle,
// et une construction lente est un échec du candidat.
const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"]);
const SERVER_ERROR_CODE = /^E5\d\d$/;

// Ligne de l'erreur finale de npm qui nomme la requête en échec, selon sa forme :
// `request to <url> failed, reason: …` (réseau) ou `5xx <message> - GET <url>`.
const NETWORK_LINE = /^\d+ error (?:network |FetchError: )?request to (\S+) failed, reason: /;
const SERVER_ERROR_LINE = /^\d+ error 5\d\d .* - [A-Z]+ (\S+)$/;

// Ligne du journal de npm qui prouve une erreur réseau sur une requête précise
// vers le registre imposé, ou `undefined`. Lue dans l'erreur finale de npm
// (lignes `<n> error …`), jamais dans les tentatives intermédiaires.
export function registryNetworkError(log: string, registry: string): string | undefined {
  const lines = log.split("\n");
  const code = lines.map((line) => /^\d+ error code (\S+)$/.exec(line)?.[1]).find((value) => value !== undefined);
  if (code === undefined) return undefined;
  const pattern = NETWORK_CODES.has(code) ? NETWORK_LINE : SERVER_ERROR_CODE.test(code) ? SERVER_ERROR_LINE : undefined;
  if (pattern === undefined) return undefined;
  return lines.find((line) => pattern.exec(line)?.[1]?.startsWith(registry));
}

import type { RunnerErrorOutcome } from "./verdict.ts";

// Étapes de la construction, chacune dans son conteneur :
// - `fetch` : `npm ci --ignore-scripts`, dans une copie du candidat sans son
//   `.npmrc`. Seule étape qui a accès au réseau, et aucun code du candidat n'y
//   tourne : une erreur réseau y vient du registre, jamais du candidat ;
// - `install` : `npm ci --offline`, scripts d'installation actifs, sans réseau ;
// - `build` : la commande de construction déclarée, sans réseau.
export type BuildStep = "fetch" | "install" | "build";

export interface BuildStepRun {
  step: BuildStep;
  exitCode: number;
  // Docker a démarré le conteneur de l'étape (#68). Sinon, `docker run` a
  // échoué de lui-même (code 125 : image absente, démon injoignable), et
  // aucune commande de l'étape n'a tourné.
  started: boolean;
  // Arrêtée par le banc : le délai global de construction est écoulé.
  timedOut: boolean;
  // Tuée par la limite de mémoire du conteneur.
  oomKilled: boolean;
  // Journal de npm de l'étape, vide pour `build`.
  npmLog: string;
  // Sorties de `docker run` pour l'étape : le message de Docker s'il n'a pas
  // démarré le conteneur.
  log: string;
}

export type BuildStepOutcome =
  | { outcome: "ok" }
  | {
      outcome: "build-failed" | "build-timeout" | "build-resource-limit" | "registry-network-error" | RunnerErrorOutcome;
      detail: string;
    };

// Un délai ou une limite dépassés sont toujours un échec du candidat (règle 7) ;
// seule une erreur du registre pendant `fetch`, prouvée, rend la mesure invalide.
// Un conteneur que Docker n'a jamais démarré est une erreur du banc (#68) :
// avant le lancement de `npm ci` pour `fetch`, une panne pendant que le
// candidat tourne ensuite.
export function buildStepOutcome({ step, exitCode, started, timedOut, oomKilled, npmLog, log }: BuildStepRun, registry: string): BuildStepOutcome {
  if (!started) {
    return {
      outcome: step === "fetch" ? "runner-error-before-candidate" : "stack-down-while-candidate",
      detail: `Docker did not start the ${step} container (docker run exited with code ${exitCode}): ${log.trim()}`,
    };
  }
  if (timedOut) return { outcome: "build-timeout", detail: `${step} was stopped: the global build timeout ran out` };
  if (oomKilled) return { outcome: "build-resource-limit", detail: `${step} was killed: memory limit reached` };
  if (exitCode === 0) return { outcome: "ok" };
  const evidence = step === "fetch" ? registryNetworkError(npmLog, registry) : undefined;
  if (evidence !== undefined) return { outcome: "registry-network-error", detail: evidence };
  return { outcome: "build-failed", detail: `${step} exited with code ${exitCode}` };
}
