// Journal d'accès d'une mesure (spec de l'étape 3, « Journal d'accès ») :
// repérage des requêtes témoins par le marqueur et contrôle de leur moment.
//
// Le journal est la copie du vrai `access.log` de la mesure comptée du
// candidat de référence (exécution 45624689673,
// tests/fixtures/ci45624689673/PROVENANCE.md) : 212 lignes, requêtes témoins
// aux lignes 2 (start-1) et 212 (end). Le marqueur est celui de son
// measure.json. Chaque variante insère ou retire des lignes du vrai journal,
// bâties sur ses vraies lignes.
import { describe, expect, it } from "vitest";
import { checkAccessLog, witnessPath } from "../../runner/access-log.ts";
import { MEASURES, readFixture, readMeasure } from "../real-fixtures.ts";

const ACCESS_LOG = readFixture(`${MEASURES.reference.artifacts}/access.log`);
const MEASURE = readMeasure(MEASURES.reference);
const MARKER = MEASURE.marker;
const OTHER_MARKER = "b2".repeat(32);
const SEAM_A_MARKER = "c3".repeat(32);

// Lignes du vrai journal, sans la fin de ligne finale.
const LINES = ACCESS_LOG.slice(0, -1).split("\n");
const START_WITNESS = LINES[1]!;
const END_WITNESS = LINES.at(-1)!;
// Requête du candidat (relais) vers le legacy, ligne 3.
const REQUEST = LINES[2]!;

// Une ligne du journal, bâtie sur la ligne 3 : son chemin et son User-Agent remplacés.
function line(path: string, userAgent = "node"): string {
  return REQUEST.replace('"GET / HTTP/1.1"', `"GET ${path} HTTP/1.1"`).replace(/"node"$/, `"${userAgent}"`);
}

// Requête témoin, bâtie sur celle de la ligne 2.
const witness = (name: string, marker = MARKER) => START_WITNESS.replace(witnessPath(MARKER, "start-1"), witnessPath(marker, name));

const log = (lines: string[]) => `${lines.join("\n")}\n`;
// Le vrai journal, `lines` insérées avant la ligne d'index `at` (base 0).
const inserted = (at: number, ...lines: string[]) => log([...LINES.slice(0, at), ...lines, ...LINES.slice(at)]);

const check = (text: string, seamAMarkers: string[] = []) => checkAccessLog({ log: text, marker: MARKER, expected: ["start-1", "end"], seamAMarkers });

describe("checkAccessLog", () => {
  // Ce que le banc en a écrit dans le measure.json de la mesure.
  it("finds the expected witness requests, in order, with their line numbers", () => {
    const { lines, witnesses } = MEASURE.accessLog!;

    expect(check(ACCESS_LOG)).toEqual({ outcome: "ok", lines, witnesses });
    expect(witnesses).toEqual([
      { name: "start-1", line: 2 },
      { name: "end", line: 212 },
    ]);
  });

  it("is access-log-inactive when an expected witness request is missing, with the log lines as evidence", () => {
    const result = check(log(LINES.slice(0, -1)));

    expect(result.outcome).toBe("access-log-inactive");
    if (result.outcome === "ok") return;
    expect(result.evidence).toContain("Missing witness request end");
    expect(result.evidence).toContain(START_WITNESS);
  });

  it("is access-log-inactive on an empty log", () => {
    expect(checkAccessLog({ log: "", marker: MARKER, expected: ["start-1"], seamAMarkers: [] })).toMatchObject({ outcome: "access-log-inactive", lines: 0 });
  });

  // Le candidat ne connaît pas le marqueur, mais le contrôle n'en dépend pas :
  // un chemin de requête témoin avec un marqueur inventé ne compte pas.
  it("does not count a witness request with an invented marker as a witness", () => {
    expect(check(ACCESS_LOG.replaceAll(MARKER, "0".repeat(64))).outcome).toBe("access-log-inactive");
  });

  it("does not count a request whose path only contains the marker as a witness", () => {
    const result = checkAccessLog({ log: log([line(`/x${witnessPath(MARKER, "start-1")}`)]), marker: MARKER, expected: ["start-1"], seamAMarkers: [] });

    expect(result.outcome).not.toBe("ok");
  });

  it.each([
    ["a request carrying the marker between the witness requests", inserted(2, line(`/recherche.do?q=${MARKER}`))],
    ["the marker in the User-Agent", inserted(2, line("/recherche.do", MARKER))],
    ["a repeated witness request", inserted(2, START_WITNESS)],
    ["a witness request of an unexpected moment", inserted(2, witness("start-2"))],
    ["witness requests in the wrong order", inserted(0, END_WITNESS)],
  ])("is marker-out-of-place on %s, with the line as evidence", (_, text) => {
    const result = check(text);

    expect(result.outcome).toBe("marker-out-of-place");
    if (result.outcome === "ok") return;
    expect(result.evidence).toMatch(new RegExp(`^\\d+: .*${MARKER}`, "m"));
  });

  it("ignores the marker of another measure", () => {
    const text = log([witness("start-1", OTHER_MARKER), ...LINES.slice(0, 2), line(`/recherche.do?q=${OTHER_MARKER}`), ...LINES.slice(2), witness("end", OTHER_MARKER)]);

    expect(check(text)).toMatchObject({ outcome: "ok", lines: 215, witnesses: [{ name: "start-1", line: 3 }, { name: "end", line: 214 }] });
  });

  // Un `npm test` lancé pendant la mesure : incident du banc, pas du candidat.
  it("is marker-out-of-place when a line carries a Seam A marker, with the line as evidence", () => {
    const seamA = line("/recherche.do", `migrabench-seam-a/${SEAM_A_MARKER}`);

    const result = check(inserted(2, seamA), [OTHER_MARKER, SEAM_A_MARKER]);

    expect(result.outcome).toBe("marker-out-of-place");
    if (result.outcome === "ok") return;
    expect(result.evidence).toContain(`3: ${seamA}`);
  });

  it("is marker-out-of-place for a Seam A marker even when a witness request is missing", () => {
    const text = log([...LINES.slice(0, -1), line("/", `migrabench-seam-a/${SEAM_A_MARKER}`)]);

    expect(check(text, [SEAM_A_MARKER]).outcome).toBe("marker-out-of-place");
  });
});
