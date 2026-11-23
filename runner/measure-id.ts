// Identifiant de la mesure (spec de l'étape 3, « Contenu de measure.json ») :
// <horodatage>-<commit court>-<nom du candidat>, le nom étant le chemin du
// candidat sous candidates/ ou fixtures/, barres remplacées par des tirets.
// Il nomme le dossier de la mesure et celui de ses bruts.
import { posix } from "node:path";
import { timestamp } from "../oracle/ci-run.ts";

const CANDIDATE_ROOTS = ["candidates", "fixtures"] as const;

export function measureId(startedAt: Date, benchCommit: string, candidate: string): string {
  return `${timestamp(startedAt)}-${benchCommit.slice(0, 7)}-${candidateName(candidate)}`;
}

// Nom du candidat dans l'identifiant ; refuse un dossier hors de candidates/ et fixtures/.
export function candidateName(candidate: string): string {
  const [root, ...rest] = posix.normalize(candidate).replace(/\/$/, "").split("/");
  if (!CANDIDATE_ROOTS.some((allowed) => allowed === root) || rest.length === 0 || rest.includes("..")) {
    throw new Error(`The candidate must be a directory under candidates/ or fixtures/: ${candidate}`);
  }
  return rest.join("-");
}
