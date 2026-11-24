// Constat de démarrage des candidats de fixtures/ (#66), lu dans le brut
// `start.log` d'une mesure. Chaque démarrage du service `candidate` écrit une
// ligne `migrabench start report <JSON>` sur sa sortie, que le runner reporte
// dans `start.log` à chaque arrêt. Fonctions pures : elles rendent les
// problèmes, vides quand le constat tient.

const MARKER = "migrabench start report ";

// Tentatives du candidat défectueux 5 « sonde d'isolation » (spec de
// l'étape 3, « Candidats défectueux »), toutes à voir refusées.
export const PROBE_ATTEMPTS = ["write-code", "read-docker-socket", "reach-internal-api-during-build", "read-archive-salt", "run-as-root"] as const;

// Variables transmises au démarrage (spec de l'étape 3, « Exécution du
// candidat ») et celles qui ne le sont jamais.
const START_VARIABLES = ["PORT", "LEGACY_API_URL", "ARCHIVE_URL", "ARCHIVE_TOKEN", "USERS_FILE"];
const FORBIDDEN_VARIABLES = ["ARCHIVE_SALT"];

interface ProbeReport {
  attempts: { attempt: string; refused: boolean; detail: string }[];
}

interface ReferenceReport {
  // Noms des variables reçues, jamais leurs valeurs.
  variables: string[];
  // `ok`, ou l'erreur de l'écriture dans le dossier temporaire.
  tmpWrite: string;
}

export function probeReportProblems(startLog: string): string[] {
  return eachReport<ProbeReport>(startLog, ({ attempts }) =>
    PROBE_ATTEMPTS.flatMap((name) => {
      const found = attempts.find((entry) => entry.attempt === name);
      if (found === undefined) return [`${name} is missing`];
      return found.refused ? [] : [`${name} was not refused: ${found.detail}`];
    }),
  );
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
