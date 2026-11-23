// Emplacements d'une mesure, depuis la racine du dépôt.
import { fileURLToPath } from "node:url";

// Racine du dépôt, sans barre finale.
export const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");

// Dossiers des mesures de diagnostic, un par mesure, ignorés par Git.
export const DIAGNOSTIC_DIR_FROM_ROOT = "results/diagnostic";

// Bruts d'une mesure (ADR 0005), sous le même identifiant que son dossier.
export const ARTIFACTS_DIR_FROM_ROOT = ".oracle-artifacts";
