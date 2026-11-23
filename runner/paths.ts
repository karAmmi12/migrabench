// Emplacement des mesures de diagnostic, depuis la racine du dépôt : un
// dossier par mesure, ignoré par Git. Les bruts d'une mesure vont sous
// ARTIFACTS_DIR_FROM_ROOT (shared/root.ts), sous le même identifiant.
export const DIAGNOSTIC_DIR_FROM_ROOT = "results/diagnostic";

// Résultats d'étalonnage faits en CI, versionnés : les seuls qu'une mesure
// applique (runner/calibration-results.ts).
export const CALIBRATION_DIR_FROM_ROOT = "results/calibration";

// Étalonnages lancés hors CI, pour la mise au point : ignorés par Git, comme
// les mesures de diagnostic, et jamais appliqués à une mesure.
export const LOCAL_CALIBRATION_DIR_FROM_ROOT = `${DIAGNOSTIC_DIR_FROM_ROOT}/calibration`;
