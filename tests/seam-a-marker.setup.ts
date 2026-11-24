// Configuration globale de Vitest : chaque exécution de `npm test` tire un
// marqueur du Seam A, l'enregistre dans le dossier d'état du banc et le
// fournit aux tests (`inject("seamAMarker")`). Les requêtes des tests du
// Seam A vers le legacy le portent dans leur User-Agent (legacy-client.ts) :
// une mesure qui en trouve un dans son journal d'accès est invalide
// (`marker-out-of-place`, shared/seam-a-marker.ts).
import type { TestProject } from "vitest/node";
import { registerSeamAMarker } from "../shared/seam-a-marker.ts";

declare module "vitest" {
  export interface ProvidedContext {
    seamAMarker: string;
  }
}

export default function setup(project: TestProject): void {
  project.provide("seamAMarker", registerSeamAMarker());
}
