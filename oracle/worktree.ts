// État de l'arbre de travail enregistré dans le résultat (`worktree`).
// Propre : aucune modification d'un fichier versionné, et aucun fichier non
// suivi hors des nouveaux résultats de results/oracle/ et des nouvelles
// mesures prévues pour compter de results/counted/ (#73). Un résultat déjà
// versionné reste un fichier versionné : le modifier rend l'arbre modifié.
import { COUNTED_DIR_FROM_ROOT } from "../shared/root.ts";

export type WorktreeState = "clean" | "dirty";

export const RESULTS_DIR_FROM_ROOT = "results/oracle";

// Dossiers dont les nouveaux fichiers, non suivis, laissent l'arbre propre.
const NEW_RESULTS_DIRS = [RESULTS_DIR_FROM_ROOT, COUNTED_DIR_FROM_ROOT];

// Arguments de `git status` dont worktreeState lit la sortie : -z évite que
// git cite les chemins ; untracked-files=all liste chaque fichier non suivi,
// au lieu de résumer un dossier entièrement non suivi.
export const GIT_STATUS_ARGS = ["status", "--porcelain=v1", "-z", "--untracked-files=all"] as const;

export function worktreeState(porcelain: string): WorktreeState {
  const entries = porcelain.split("\0");
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] ?? "";
    if (entry === "") continue;
    const code = entry.slice(0, 2);
    // Renommage ou copie : avec -z, le chemin source suit dans l'entrée suivante.
    if (code.includes("R") || code.includes("C")) index++;
    const path = entry.slice(3);
    if (code !== "??" || !NEW_RESULTS_DIRS.some((dir) => path.startsWith(`${dir}/`))) return "dirty";
  }
  return "clean";
}
