// Journal d'accès d'une mesure (spec de l'étape 3, « Journal d'accès ») :
// fonction pure qui lit le journal brut du legacy, repère les requêtes témoins
// par le marqueur de la mesure et contrôle leur moment. La porte du relais
// (étape 4) le réutilise.

// Chemin d'une requête témoin : le marqueur, puis le moment (`start-1`,
// `start-2` après chaque recréation de la pile, `end`).
export function witnessPath(marker: string, name: string): string {
  return `/migrabench-witness/${marker}/${name}`;
}

export interface AccessLogInput {
  // Contenu du journal brut.
  log: string;
  marker: string;
  // Requêtes témoins envoyées par le runner, dans l'ordre.
  expected: readonly string[];
  // Marqueurs tirés par `npm test` (shared/seam-a-marker.ts).
  seamAMarkers: readonly string[];
}

export interface WitnessPosition {
  name: string;
  // Numéro de la ligne dans le journal, à partir de 1.
  line: number;
}

export type AccessLogCheck =
  | { outcome: "ok"; lines: number; witnesses: WitnessPosition[] }
  // Invalide : `evidence` porte la raison et les lignes du journal en preuve.
  | { outcome: "access-log-inactive" | "marker-out-of-place"; lines: number; witnesses: WitnessPosition[]; evidence: string };

// Ordre des contrôles : un marqueur du Seam A d'abord (un `npm test` pendant
// la mesure explique aussi une requête témoin manquante, s'il a redémarré le
// legacy), puis chaque requête témoin attendue, puis toute autre ligne qui
// porte le marqueur de la mesure.
export function checkAccessLog({ log, marker, expected, seamAMarkers }: AccessLogInput): AccessLogCheck {
  const lines = log.split("\n").filter((entry) => entry !== "");
  const seamA = numbered(lines, (entry) => seamAMarkers.some((seamAMarker) => entry.includes(seamAMarker)));
  if (seamA.length > 0) {
    return { outcome: "marker-out-of-place", lines: lines.length, witnesses: [], evidence: ["Lines carrying a Seam A marker during the measure:", ...seamA].join("\n") };
  }
  const witnesses: WitnessPosition[] = [];
  // Une requête témoin n'est reconnue que par son chemin exact, avec le
  // marqueur de la mesure : un autre marqueur, inventé ou d'une autre mesure,
  // ne compte pas.
  let from = 0;
  for (const name of expected) {
    const index = lines.findIndex((entry, at) => at >= from && requestPath(entry) === witnessPath(marker, name));
    if (index === -1) {
      return { outcome: "access-log-inactive", lines: lines.length, witnesses, evidence: inactiveEvidence(name, lines, marker) };
    }
    witnesses.push({ name, line: index + 1 });
    from = index + 1;
  }
  // Le marqueur n'apparaît qu'aux moments prévus : toute autre ligne qui le
  // porte, n'importe où (chemin, requête, User-Agent), est hors de son moment.
  const witnessLines = new Set(witnesses.map(({ line }) => line));
  const outOfPlace = numbered(lines, (entry, line) => !witnessLines.has(line) && entry.includes(marker));
  if (outOfPlace.length > 0) {
    return { outcome: "marker-out-of-place", lines: lines.length, witnesses, evidence: ["Lines carrying the marker outside the witness requests:", ...outOfPlace].join("\n") };
  }
  return { outcome: "ok", lines: lines.length, witnesses };
}

function inactiveEvidence(name: string, lines: readonly string[], marker: string): string {
  const carrying = numbered(lines, (entry) => entry.includes(marker));
  return [
    `Missing witness request ${name} in the access log (${lines.length} lines).`,
    carrying.length === 0 ? "No line of the access log carries the marker." : "Lines carrying the marker:",
    ...carrying,
  ].join("\n");
}

// Lignes retenues, précédées de leur numéro dans le journal (à partir de 1).
function numbered(lines: readonly string[], keep: (entry: string, line: number) => boolean): string[] {
  return lines.flatMap((entry, index) => (keep(entry, index + 1) ? [`${index + 1}: ${entry}`] : []));
}

// Chemin de la ligne de requête `"GET <chemin> HTTP/1.1"`, s'il y en a une.
function requestPath(entry: string): string | undefined {
  return /"GET (\S+) HTTP\/[\d.]+"/.exec(entry)?.[1];
}
