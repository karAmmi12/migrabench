// Délais et limites appliqués au candidat (spec de l'étape 3, « Candidat
// d'étalonnage »), enregistrés dans `environment.limits`.
//
// Tant qu'aucun résultat d'étalonnage n'existe (#72), le runner applique le
// plafond de sécurité ci-dessous et le marque provisoire. Ces valeurs sont des
// paramètres déclarés du banc, pas des mesures : elles bornent un candidat qui
// ne termine pas ou qui épuise la machine, et l'étalonnage les remplacera.

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

// Délais et limites appliqués à une mesure, et leur forme enregistrée dans
// `environment.limits` : les valeurs appliquées et leur source. Sans
// étalonnage, ni multiple ni empreinte de résultat d'étalonnage.
//
// `timeoutCapMs` : plafond des délais imposé par `--timeout-cap-ms`, pour une
// mesure de diagnostic seulement (une mesure prévue pour compter le refuse).
// Il ne peut que réduire les délais, et il est enregistré comme valeur imposée.
// Il sert à mesurer un candidat qui ne termine pas sans attendre tout le délai.
export function measureLimits(cap: Limits, timeoutCapMs?: number) {
  if (timeoutCapMs === undefined) return { limits: cap, record: { provisional: true, source: "safety-cap", ...cap } };
  if (!Number.isInteger(timeoutCapMs) || timeoutCapMs <= 0) {
    throw new Error("--timeout-cap-ms must be a positive whole number of milliseconds");
  }
  const longest = Math.max(cap.buildTimeoutMs, cap.readyTimeoutMs);
  if (timeoutCapMs > longest) throw new Error(`--timeout-cap-ms only lowers the timeouts: at most ${longest}`);
  const limits: Limits = {
    ...cap,
    buildTimeoutMs: Math.min(cap.buildTimeoutMs, timeoutCapMs),
    readyTimeoutMs: Math.min(cap.readyTimeoutMs, timeoutCapMs),
  };
  return { limits, record: { provisional: true, source: "safety-cap", ...limits, imposedTimeoutCapMs: timeoutCapMs } };
}
