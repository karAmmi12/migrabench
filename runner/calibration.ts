// Résultat d'étalonnage (spec de l'étape 3, « Candidat d'étalonnage ») :
// fonctions pures qui tirent les valeurs de chaque relevé du candidat
// d'étalonnage, leur dispersion et les limites d'une mesure.
import type { BuildStep } from "./build-outcome.ts";
import type { Limits } from "./limits.ts";
import type { ResourceUsage } from "./resource-usage.ts";

// Multiples déclarés : paramètres du banc, pas des mesures. Ils sont copiés
// dans chaque résultat d'étalonnage, et une mesure applique ceux du résultat
// qu'elle cite.
export interface Multiples {
  // Délais de construction et de disponibilité.
  timeouts: number;
  // Limites de mémoire et de CPU.
  resources: number;
}

// Multiples déclarés du banc (décidés pour #72) :
// - délais × 5 : la durée d'un même job varie d'une exécution à l'autre sur
//   les runners GitHub, jusqu'à 2,3 fois sans changement de code (job
//   `oracle`, 119 s puis 273 s, exécutions citées dans
//   docs/formation/journal/76-ci-reduire-consommation-minutes.md). Un délai
//   dépassé est un échec du candidat, jamais une mesure invalide : un faux
//   échec coûte bien plus qu'une attente plus longue ;
// - mémoire et CPU × 2 : ils dépendent du code construit, pas de la machine.
// Le résultat enregistre le minimum et le maximum des relevés, pour vérifier
// que la marge couvre leur dispersion.
export const DECLARED_MULTIPLES: Readonly<Multiples> = { timeouts: 5, resources: 2 };

// Nombre de relevés d'un étalonnage, paramètre déclaré du banc.
export const CALIBRATION_READINGS = 5;

// Un relevé : la construction entière (délai global) et chacune
// de ses étapes, chacune dans son conteneur ; le démarrage jusqu'à la
// disponibilité.
export interface CalibrationReading {
  build: { durationMs: number; steps: ({ step: BuildStep; durationMs: number } & ResourceUsage)[] };
  start: { readyMs: number } & ResourceUsage;
}

// CPU : nombre moyen de cœurs occupés, temps CPU divisé par la durée.
export interface ReadingValues {
  buildDurationMs: number;
  buildPeakMemoryBytes: number;
  buildCpus: number;
  readyDurationMs: number;
  startPeakMemoryBytes: number;
  startCpus: number;
}

// Les limites de mémoire et de CPU s'appliquent à chaque conteneur de la
// construction : c'est l'étape la plus gourmande qui compte.
export function readingValues({ build, start }: CalibrationReading): ReadingValues {
  return {
    buildDurationMs: build.durationMs,
    buildPeakMemoryBytes: Math.max(...build.steps.map((step) => step.peakMemoryBytes)),
    buildCpus: Math.max(...build.steps.map((step) => cpus(step.cpuSeconds, step.durationMs))),
    readyDurationMs: start.readyMs,
    startPeakMemoryBytes: start.peakMemoryBytes,
    startCpus: cpus(start.cpuSeconds, start.readyMs),
  };
}

export interface CalibrationSummary {
  minimum: ReadingValues;
  maximum: ReadingValues;
  limits: Limits;
}

const MIB = 1024 ** 2;

// Limites = maximum relevé × multiple, arrondies vers le haut : délais à la
// milliseconde, mémoire au Mio, CPU au centième (`docker run --cpus`).
export function calibrationSummary(readings: readonly ReadingValues[], multiples: Multiples): CalibrationSummary {
  if (readings.length === 0) throw new Error("A calibration needs at least one reading");
  const minimum = combine(readings, Math.min);
  const maximum = combine(readings, Math.max);
  return {
    minimum,
    maximum,
    limits: {
      buildTimeoutMs: ceilTo(maximum.buildDurationMs * multiples.timeouts, 1),
      readyTimeoutMs: ceilTo(maximum.readyDurationMs * multiples.timeouts, 1),
      buildMemoryBytes: ceilTo(maximum.buildPeakMemoryBytes * multiples.resources, MIB),
      buildCpus: ceilTo(maximum.buildCpus * multiples.resources, 0.01),
    },
  };
}

function cpus(cpuSeconds: number, durationMs: number): number {
  return cpuSeconds / (durationMs / 1_000);
}

function combine(readings: readonly ReadingValues[], pick: (...values: number[]) => number): ReadingValues {
  const keys = Object.keys(readings[0]!) as (keyof ReadingValues)[];
  return Object.fromEntries(keys.map((key) => [key, pick(...readings.map((reading) => reading[key]))])) as unknown as ReadingValues;
}

// Arrondi vers le haut au multiple de `unit`, sans compter un écart de
// virgule flottante (1,8 × 2 vaut 3,6, pas 3,61).
function ceilTo(value: number, unit: number): number {
  return Number((Math.ceil(value / unit - 1e-9) * unit).toFixed(6));
}

// Un résultat d'étalonnage lu, avec son chemin depuis la racine du dépôt.
export interface CalibrationFile<R extends CalibrationIdentity = CalibrationIdentity> {
  file: string;
  record: R;
}

export interface CalibrationIdentity {
  calibratedAt: string;
  environment: { ciRun?: unknown };
}

// Résultat que les mesures appliquent : le plus récent des étalonnages faits
// en CI, l'environnement des mesures comptées. Un étalonnage local sert à la
// mise au point : il n'est jamais choisi, même plus récent.
export function chooseCalibration<R extends CalibrationIdentity>(files: readonly CalibrationFile<R>[]): CalibrationFile<R> | undefined {
  return files
    .filter(({ record }) => record.environment.ciRun !== undefined)
    .reduce<CalibrationFile<R> | undefined>((latest, entry) => (latest === undefined || entry.record.calibratedAt > latest.record.calibratedAt ? entry : latest), undefined);
}
