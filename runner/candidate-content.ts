// Contenu mesuré du candidat (spec de l'étape 3, « Exécution du candidat ») :
// la copie de la préparation emporte le dossier du candidat sans node_modules
// ni artefacts de construction déjà présents ; contentDigest est l'empreinte
// de ce même contenu, relevée avant la copie (`candidate.contentDigest`).
import { cited, sha256 } from "../shared/digest.ts";

// Dossiers d'artefacts de construction, à la racine du candidat seulement :
// plus bas, un dossier `build` peut être du code source.
const BUILD_ARTIFACT_DIRS = new Set(["dist", "build"]);

// Chemin relatif au dossier du candidat, séparé par des barres.
export function isCopied(path: string): boolean {
  const segments = path.split("/");
  if (segments.includes("node_modules")) return false;
  return !BUILD_ARTIFACT_DIRS.has(segments[0] ?? "");
}

// Copie du téléchargement (`npm ci --ignore-scripts`, seule étape de la
// construction qui a accès au réseau) : sans le `.npmrc` de la racine, le seul
// que npm lit pour le projet. Un proxy, un délai réseau ou un registre de portée
// qu'il déclarerait ne peut donc pas fabriquer une erreur du registre imposé.
export function isFetchedWith(path: string): boolean {
  return path !== ".npmrc";
}

export interface CandidateFile {
  // Chemin relatif au dossier du candidat, séparé par des barres.
  path: string;
  // Empreinte SHA-256 du fichier, en hexadécimal.
  sha256: string;
}

// Empreinte de la liste triée des chemins et de leurs empreintes, une ligne
// par fichier au format de `sha256sum` : `<empreinte>  <chemin>`.
export function contentDigest(files: readonly CandidateFile[]): string {
  const lines = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((file) => `${file.sha256}  ${file.path}\n`);
  return cited(sha256(lines.join("")));
}
