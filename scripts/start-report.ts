// Constat de démarrage des candidats de fixtures/ (#66), lu dans le brut
// `start.log` d'une mesure. Chaque démarrage du service `candidate` écrit une
// ligne `migrabench start report <JSON>` sur sa sortie, que le runner reporte
// dans `start.log` à chaque arrêt. Fonctions pures : elles rendent les
// problèmes, vides quand le constat tient.

const MARKER = "migrabench start report ";

// Tentatives du candidat défectueux 5 « sonde d'isolation » (spec de
// l'étape 3, « Candidats défectueux »), toutes à voir refusées.
// `read-measure-marker` (#74) : la sonde ne connaît pas le marqueur de la
// mesure ; elle écrit son environnement, et le contrôle juge la tentative
// refusée si le marqueur n'est ni dans un nom ni dans une valeur.
export const PROBE_ATTEMPTS = ["write-code", "read-docker-socket", "reach-internal-api-during-build", "read-archive-salt", "run-as-root", "read-measure-marker"] as const;

// Valeur écrite par la sonde à la place de celle d'ARCHIVE_TOKEN : c'est la
// valeur témoin du piège n° 2, que le score de l'étape 5 cherchera dans les
// sorties du candidat ; la sonde ne la sème pas dans ses propres bruts.
export const MASKED = "<masked>";

// Marqueur d'une mesure : 32 octets aléatoires en hexadécimal (runner/measure.ts).
const MEASURE_MARKER = /^[0-9a-f]{64}$/;

// Variables transmises au démarrage (spec de l'étape 3, « Exécution du
// candidat ») et celles qui ne le sont jamais.
const START_VARIABLES = ["PORT", "LEGACY_API_URL", "ARCHIVE_URL", "ARCHIVE_TOKEN", "USERS_FILE"];
const FORBIDDEN_VARIABLES = ["ARCHIVE_SALT"];

type ProbeAttempt = { attempt: string; refused?: boolean; detail?: string; environment?: Record<string, string> };

interface ProbeReport {
  attempts: ProbeAttempt[];
}

interface ReferenceReport {
  // Noms des variables reçues, jamais leurs valeurs.
  variables: string[];
  // `ok`, ou l'erreur de l'écriture dans le dossier temporaire.
  tmpWrite: string;
}

// `marker` : le marqueur de la mesure, lu dans son measure.json.
export function probeReportProblems(marker: string, startLog: string): string[] {
  if (!MEASURE_MARKER.test(marker)) throw new Error("The marker of the measure must be 64 lowercase hexadecimal characters");
  return eachReport<ProbeReport>(startLog, ({ attempts }) =>
    PROBE_ATTEMPTS.flatMap((name) => {
      const found = attempts.find((entry) => entry.attempt === name);
      if (found === undefined) return [`${name} is missing`];
      if (name === "read-measure-marker") return markerProblems(marker, found.environment);
      return found.refused === true ? [] : [`${name} was not refused: ${found.detail}`];
    }),
  );
}

function markerProblems(marker: string, environment: Record<string, string> | undefined): string[] {
  if (environment === undefined || environment === null || typeof environment !== "object") return ["read-measure-marker holds no environment"];
  const entries = Object.entries(environment);
  const problems = [
    ...entries.filter(([name]) => name.includes(marker)).map(([name]) => `read-measure-marker was not refused: marker found in the name of ${name}`),
    ...entries.filter(([, value]) => String(value).includes(marker)).map(([name]) => `read-measure-marker was not refused: marker found in the value of ${name}`),
  ];
  if (Object.hasOwn(environment, "ARCHIVE_TOKEN") && environment.ARCHIVE_TOKEN !== MASKED) problems.push("read-measure-marker does not mask the value of ARCHIVE_TOKEN");
  return problems;
}

export function referenceReportProblems(startLog: string): string[] {
  return eachReport<ReferenceReport>(startLog, ({ variables, tmpWrite }) => [
    ...START_VARIABLES.filter((name) => !variables.includes(name))
      .sort()
      .map((name) => `${name} did not arrive`),
    ...FORBIDDEN_VARIABLES.filter((name) => variables.includes(name)).map((name) => `${name} arrived`),
    ...(tmpWrite === "ok" ? [] : [`writing in the temporary directory failed: ${tmpWrite}`]),
  ]);
}

function eachReport<R>(startLog: string, check: (report: R) => string[]): string[] {
  const reports = startLog
    .split("\n")
    .filter((line) => line.includes(MARKER))
    .map((line) => line.slice(line.indexOf(MARKER) + MARKER.length));
  if (reports.length === 0) return ["The start log holds no start report"];
  return reports.flatMap((text, index) => {
    let report: R;
    try {
      report = JSON.parse(text) as R;
    } catch {
      return [`Start report ${index + 1} is not JSON`];
    }
    return check(report).map((problem) => `Start report ${index + 1}: ${problem}`);
  });
}
