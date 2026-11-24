// Journal d'accès d'une mesure (spec de l'étape 3, « Journal d'accès ») :
// repérage des requêtes témoins par le marqueur et contrôle de leur moment.
import { describe, expect, it } from "vitest";
import { checkAccessLog, witnessPath } from "../../runner/access-log.ts";

const MARKER = "a1".repeat(32);
const OTHER_MARKER = "b2".repeat(32);
const SEAM_A_MARKER = "c3".repeat(32);

// Une ligne au format de la valve du legacy (fixtures/legacy-app/access-log.xml).
function line(path: string, userAgent = "Mozilla/5.0"): string {
  return `2026-11-24T15:12:57.509+0000 172.18.0.3:8080 172.18.0.1 "GET ${path} HTTP/1.1" 401 "${userAgent}"`;
}

const witness = (name: string, marker = MARKER) => line(witnessPath(marker, name), "node");
const log = (...lines: string[]) => `${lines.join("\n")}\n`;

describe("checkAccessLog", () => {
  it("finds the expected witness requests, in order, with their line numbers", () => {
    const result = checkAccessLog({
      log: log(line("/"), witness("start-1"), line("/recherche.do"), line("/fiche.do?number=D-0001"), witness("end")),
      marker: MARKER,
      expected: ["start-1", "end"],
      seamAMarkers: [],
    });
    expect(result).toEqual({
      outcome: "ok",
      lines: 5,
      witnesses: [
        { name: "start-1", line: 2 },
        { name: "end", line: 5 },
      ],
    });
  });

  it("is access-log-inactive when an expected witness request is missing, with the log lines as evidence", () => {
    const result = checkAccessLog({ log: log(witness("start-1"), line("/recherche.do")), marker: MARKER, expected: ["start-1", "end"], seamAMarkers: [] });
    expect(result.outcome).toBe("access-log-inactive");
    if (result.outcome === "ok") return;
    expect(result.evidence).toContain("Missing witness request end");
    expect(result.evidence).toContain(witness("start-1"));
  });

  it("is access-log-inactive on an empty log", () => {
    expect(checkAccessLog({ log: "", marker: MARKER, expected: ["start-1"], seamAMarkers: [] })).toMatchObject({ outcome: "access-log-inactive", lines: 0 });
  });

  // Le candidat ne connaît pas le marqueur, mais le contrôle n'en dépend pas :
  // un chemin de requête témoin avec un marqueur inventé ne compte pas.
  it("does not count a witness request with an invented marker as a witness", () => {
    const invented = "0".repeat(64);
    const result = checkAccessLog({
      log: log(witness("start-1", invented), line("/recherche.do"), witness("end", invented)),
      marker: MARKER,
      expected: ["start-1", "end"],
      seamAMarkers: [],
    });
    expect(result.outcome).toBe("access-log-inactive");
  });

  it("does not count a request whose path only contains the marker as a witness", () => {
    const result = checkAccessLog({
      log: log(line(`/x${witnessPath(MARKER, "start-1")}`)),
      marker: MARKER,
      expected: ["start-1"],
      seamAMarkers: [],
    });
    expect(result.outcome).not.toBe("ok");
  });

  it.each([
    ["a request carrying the marker between the witness requests", [witness("start-1"), line(`/recherche.do?q=${MARKER}`), witness("end")]],
    ["the marker in the User-Agent", [witness("start-1"), line("/recherche.do", MARKER), witness("end")]],
    ["a repeated witness request", [witness("start-1"), witness("start-1"), witness("end")]],
    ["a witness request of an unexpected moment", [witness("start-1"), witness("start-2"), witness("end")]],
    ["witness requests in the wrong order", [witness("end"), witness("start-1"), witness("end")]],
  ])("is marker-out-of-place on %s, with the line as evidence", (_, lines) => {
    const result = checkAccessLog({ log: log(...lines), marker: MARKER, expected: ["start-1", "end"], seamAMarkers: [] });
    expect(result.outcome).toBe("marker-out-of-place");
    if (result.outcome === "ok") return;
    expect(result.evidence).toMatch(/^\d+: .*a1a1/m);
  });

  it("ignores the marker of another measure", () => {
    const result = checkAccessLog({
      log: log(witness("start-1", OTHER_MARKER), witness("start-1"), line(`/recherche.do?q=${OTHER_MARKER}`), witness("end"), witness("end", OTHER_MARKER)),
      marker: MARKER,
      expected: ["start-1", "end"],
      seamAMarkers: [],
    });
    expect(result).toMatchObject({ outcome: "ok", lines: 5, witnesses: [{ name: "start-1", line: 2 }, { name: "end", line: 4 }] });
  });

  // Un `npm test` lancé pendant la mesure : incident du banc, pas du candidat.
  it("is marker-out-of-place when a line carries a Seam A marker, with the line as evidence", () => {
    const seamA = line("/recherche.do", `migrabench-seam-a/${SEAM_A_MARKER}`);
    const result = checkAccessLog({
      log: log(witness("start-1"), seamA, witness("end")),
      marker: MARKER,
      expected: ["start-1", "end"],
      seamAMarkers: [OTHER_MARKER, SEAM_A_MARKER],
    });
    expect(result.outcome).toBe("marker-out-of-place");
    if (result.outcome === "ok") return;
    expect(result.evidence).toContain(`2: ${seamA}`);
  });

  it("is marker-out-of-place for a Seam A marker even when a witness request is missing", () => {
    const result = checkAccessLog({
      log: log(witness("start-1"), line("/", `migrabench-seam-a/${SEAM_A_MARKER}`)),
      marker: MARKER,
      expected: ["start-1", "end"],
      seamAMarkers: [SEAM_A_MARKER],
    });
    expect(result.outcome).toBe("marker-out-of-place");
  });
});
