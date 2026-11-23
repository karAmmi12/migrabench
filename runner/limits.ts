// Délais et limites appliqués au candidat (spec de l'étape 3, « Candidat
// d'étalonnage »), enregistrés dans `environment.limits`.
//
// Tant qu'aucun résultat d'étalonnage de CI n'est versionné, le runner
// applique le plafond de sécurité ci-dessous et le marque provisoire. Ces
// valeurs sont des paramètres déclarés du banc, pas des mesures : elles
// bornent un candidat qui ne termine pas ou qui épuise la machine.
// `migrabench calibrate` mesure sous ce même plafond, sans autre délai.
import type { Multiples } from "./calibration.ts";

const GIB = 1024 ** 3;

export const SAFETY_CAP: Readonly<Limits> = {
  // Délai global de la construction : téléchargement, `npm ci` et `build`.
  buildTimeoutMs: 10 * 60_000,
  // Délai entre le démarrage du candidat et sa première réponse HTTP.
  readyTimeoutMs: 60_000,
  // Limites de chaque conteneur de la construction.
  buildMemoryBytes: 4 * GIB,
  buildCpus: 2,
};

export interface Limits {
  buildTimeoutMs: number;
  readyTimeoutMs: number;
  buildMemoryBytes: number;
  buildCpus: number;
}

// Résultat d'étalonnage appliqué à une mesure : son chemin depuis la racine
// du dépôt, son empreinte, ses multiples et les limites qui en sortent.
export interface AppliedCalibration {
  file: string;
  digest: string;
  multiples: Multiples;
  limits: Limits;
}

export interface MeasureLimitsInput {
  safetyCap: Limits;
  // Absent tant qu'aucun étalonnage de CI n'est versionné.
  calibration?: AppliedCalibration | undefined;
  // Plafond des délais imposé par `--timeout-cap-ms`, pour une mesure de
  // diagnostic seulement (une mesure prévue pour compter le refuse). Il ne
  // peut que réduire les délais, et il est enregistré comme valeur imposée. Il
  // sert à mesurer un candidat qui ne termine pas sans attendre tout le délai.
  timeoutCapMs?: number | undefined;
}

// Délais et limites appliqués à une mesure, et leur forme enregistrée dans
// `environment.limits` : les valeurs appliquées et leur source. Avec un
// étalonnage, le résultat cité par son empreinte et ses multiples ; sans
// étalonnage, le plafond de sécurité, marqué provisoire.
export function measureLimits({ safetyCap, calibration, timeoutCapMs }: MeasureLimitsInput) {
  const base = calibration?.limits ?? safetyCap;
  const source =
    calibration === undefined
      ? { provisional: true, source: "safety-cap" }
      : { provisional: false, source: "calibration", calibration: { file: calibration.file, digest: calibration.digest }, multiples: calibration.multiples };
  if (timeoutCapMs === undefined) return { limits: base, record: { ...source, ...base } };
  if (!Number.isInteger(timeoutCapMs) || timeoutCapMs <= 0) {
    throw new Error("--timeout-cap-ms must be a positive whole number of milliseconds");
  }
  const longest = Math.max(base.buildTimeoutMs, base.readyTimeoutMs);
  if (timeoutCapMs > longest) throw new Error(`--timeout-cap-ms only lowers the timeouts: at most ${longest}`);
  const limits: Limits = {
    ...base,
    buildTimeoutMs: Math.min(base.buildTimeoutMs, timeoutCapMs),
    readyTimeoutMs: Math.min(base.readyTimeoutMs, timeoutCapMs),
  };
  return { limits, record: { ...source, ...limits, imposedTimeoutCapMs: timeoutCapMs } };
}
