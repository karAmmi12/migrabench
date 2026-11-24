// Marqueur du Seam A (spec de l'étape 3, « Journal d'accès », décision Q14) :
// `npm test` en tire un à chaque exécution, et les requêtes des tests du
// Seam A vers le legacy le portent dans leur User-Agent. Une ligne du journal
// d'accès d'une mesure qui en porte un rend la mesure invalide
// (`marker-out-of-place`) : un `npm test` lancé pendant une mesure est un
// incident du banc, pas une faute du candidat.
//
// Chaque marqueur est un fichier vide, nommé par le marqueur, dans le dossier
// d'état du banc : commun à toute la machine comme la pile et le verrou du
// banc, hors du dépôt, donc hors de la copie du candidat. Le candidat ne peut
// ni en recevoir un ni en fabriquer un que le runner reconnaisse.
import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BENCH_STATE_DIR } from "./bench-lock.ts";

export const SEAM_A_MARKERS_DIR = join(BENCH_STATE_DIR, "seam-a-markers");

// Au-delà, un marqueur ne peut plus concerner une mesure en cours : aucune
// mesure ne dure une semaine. Purgé au prochain enregistrement.
export const SEAM_A_MARKER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const MARKER = /^[0-9a-f]{64}$/;

// User-Agent des requêtes des tests du Seam A vers le legacy.
export function seamAUserAgent(marker: string): string {
  return `migrabench-seam-a/${marker}`;
}

// Tire un marqueur, l'enregistre et purge les marqueurs trop anciens.
export function registerSeamAMarker(dir: string = SEAM_A_MARKERS_DIR): string {
  mkdirSync(dir, { recursive: true });
  const oldest = Date.now() - SEAM_A_MARKER_MAX_AGE_MS;
  for (const marker of readSeamAMarkers(dir)) {
    const file = join(dir, marker);
    if (statSync(file).mtimeMs < oldest) rmSync(file, { force: true });
  }
  const marker = randomBytes(32).toString("hex");
  writeFileSync(join(dir, marker), "", { flag: "wx" });
  return marker;
}

// Marqueurs enregistrés, relus par le runner à la clôture d'une mesure.
export function readSeamAMarkers(dir: string = SEAM_A_MARKERS_DIR): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries.filter((entry) => MARKER.test(entry));
}
