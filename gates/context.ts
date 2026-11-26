// Contexte d'une porte (spec de l'étape 4, « Registre, contexte et ordre ») :
// ce que le runner fournit à chaque porte. Une porte ne touche jamais Docker
// ni la chaîne des requêtes témoins : elle passe par ce contexte.
import type { WitnessPosition } from "../runner/access-log.ts";

export interface InternalApiResponse {
  status: number;
  body: string;
}

export interface GateContext {
  // Adresse du candidat vue du banc.
  candidateUrl: string;
  // Dossier du candidat tel qu'il a été remis, et sa copie construite.
  candidateDir: string;
  builtCopyDir: string;
  // Résultat de l'oracle de la mesure et HAR de ses scénarios.
  oracle: { resultFile: string; harFiles: readonly string[] };
  // Journal d'accès figé à la clôture, avec la position des requêtes
  // témoins : présent pour les portes de la clôture seulement (la porte du
  // relais), une fois le journal contrôlé `ok`.
  accessLog?: { file: string; digest: string; witnesses: readonly WitnessPosition[] };
  // Client de l'API interne du legacy, en lecture seulement.
  internalApi: { get(path: string): Promise<InternalApiResponse> };
  // Redémarre le legacy, recrée le candidat, attend qu'ils soient sains et
  // envoie la requête témoin `start-N` suivante. Un échec lève StackIncident.
  restartLegacy(): Promise<void>;
  // Interrompu au délai de la porte : une porte qui le peut s'arrête alors.
  signal: AbortSignal;
}

// Issues d'un redémarrage du legacy qui échoue : celles de la phase de
// démarrage (runner/verdict.ts).
export type StackIncidentOutcome = "stack-failed-before-candidate" | "stack-not-from-this-copy" | "access-log-inactive" | "start-exited" | "start-not-ready";

// Panne de la pile pendant une porte (redémarrage du legacy qui échoue) :
// jamais une erreur de porte. Le registre la laisse passer, et le runner la
// range dans la phase en cours avec son issue et sa preuve.
export class StackIncident extends Error {
  readonly outcome: StackIncidentOutcome;
  readonly detail: string | undefined;
  constructor(outcome: StackIncidentOutcome, detail?: string) {
    super(`Stack incident during a gate: ${outcome}`);
    this.name = "StackIncident";
    this.outcome = outcome;
    this.detail = detail;
  }
}
