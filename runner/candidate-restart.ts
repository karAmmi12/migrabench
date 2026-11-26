// Démarrage du candidat sur une pile saine, et redémarrage du legacy demandé
// par une porte (spec de l'étape 4, « Registre, contexte et ordre »). Sorti
// de runner/measure.ts pour être testé sous faux `docker`
// (tests/runner/candidate-restart.test.ts).
//
// - `readyCandidate` : candidat arrêté, requête témoin `start-N` suivante et
//   contrôle de la chaîne des témoins, état de la pile relevé, puis candidat
//   recréé et attendu. Après chaque recréation de la pile : celle de
//   l'oracle, puis chaque redémarrage du legacy.
// - `restartLegacy` : recrée le legacy et le service d'archivage, puis
//   `readyCandidate`. Un échec lève StackIncident avec l'issue du démarrage :
//   pile en échec, mesure invalide ; candidat qui ne redevient pas
//   disponible, échec du candidat (décision de Karim, #124).
import { StackIncident } from "../gates/context.ts";
import { recreateStack, StackFailed } from "../oracle/execute.ts";
import { StackNotFromCopy } from "../oracle/stack-images.ts";
import { type ServiceState, stackStates } from "../oracle/stack-state.ts";
import { checkAccessLog } from "./access-log.ts";
import { type CandidateService, type StartFailure, startCandidate, stopCandidate, waitUntilReady } from "./candidate-runtime.ts";
import { sendWitness, witnessEvidence } from "./witness.ts";

// Le candidat n'a pas démarré. `detail` : la preuve d'une issue qui rend la
// mesure invalide.
export class CandidateNotStarted extends Error {
  readonly outcome: "access-log-inactive" | StartFailure;
  readonly detail: string | undefined;
  constructor(outcome: CandidateNotStarted["outcome"], detail?: string) {
    super(`The candidate did not start: ${outcome}`);
    this.outcome = outcome;
    this.detail = detail;
  }
}

export interface CandidateStarterOptions {
  service: CandidateService;
  // Sel de la mesure, repassé au service d'archivage recréé.
  salt: string;
  // Journal d'accès vivant du legacy, et marqueur de la mesure.
  accessLogDir: string;
  marker: string;
  readyTimeoutMs: number;
  // Requêtes témoins de début déjà envoyées : la suivante y est ajoutée.
  startWitnesses: string[];
  // Adresses du legacy (requêtes témoins) et du candidat : celles du banc par
  // défaut, remplacées par les tests.
  legacyUrl?: string;
  candidateUrl?: string;
}

export interface CandidateStarter {
  readyCandidate(): Promise<void>;
  restartLegacy(): Promise<void>;
  // État de la pile saine, candidat arrêté, relevé au dernier démarrage.
  stackBefore(): ServiceState[];
}

export function candidateStarter({ service, salt, accessLogDir, marker, readyTimeoutMs, startWitnesses, legacyUrl, candidateUrl }: CandidateStarterOptions): CandidateStarter {
  let stackBefore: ServiceState[] = [];
  const readyCandidate = async (): Promise<void> => {
    await stopCandidate(service);
    const name = `start-${startWitnesses.length + 1}`;
    startWitnesses.push(name);
    const witness = await sendWitness(name, { accessLogDir, marker, ...(legacyUrl === undefined ? {} : { legacyUrl }) });
    const check = checkAccessLog({ log: witness.log, marker, expected: startWitnesses, seamAMarkers: [] });
    if (check.outcome === "access-log-inactive") throw new CandidateNotStarted(check.outcome, witnessEvidence(witness, check));
    stackBefore = await stackStates();
    await startCandidate(service);
    const ready = await waitUntilReady(service, readyTimeoutMs, candidateUrl);
    if (ready !== "ok") throw new CandidateNotStarted(ready);
  };
  const restartLegacy = async (): Promise<void> => {
    try {
      await recreateStack(salt, accessLogDir);
      await readyCandidate();
    } catch (error) {
      if (error instanceof StackFailed) throw new StackIncident("stack-failed-before-candidate", error.message);
      if (error instanceof StackNotFromCopy) throw new StackIncident("stack-not-from-this-copy", error.message);
      if (error instanceof CandidateNotStarted) throw new StackIncident(error.outcome, error.detail);
      throw error;
    }
  };
  return { readyCandidate, restartLegacy, stackBefore: () => stackBefore };
}
