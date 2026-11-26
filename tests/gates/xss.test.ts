// Porte XSS (spec de l'étape 4, « XSS ») : jugement des observations d'un
// écran, fonctions pures. Les écritures et les faits de chaque écran sont ceux
// relevés par la sonde de #129 sur le legacy
// (tests/fixtures/probe129-11cd11c/PROVENANCE.md).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type XssObservation, type XssSeen, XSS_DOSSIERS, XSS_WRITE_LIMIT, payloadOf, xssGate, xssResults } from "../../gates/xss.ts";
import { readJsonFixture } from "../real-fixtures.ts";

interface ProbeWrite {
  value: string;
  frameUrl: string;
}
interface ProbeFacts {
  linksNamedNumber: number;
  textNumber: number;
  innerTextHasPayload: boolean;
  fieldsWithPayload: unknown[];
}
const PROBE = readJsonFixture<{
  search: { writes: ProbeWrite[]; facts: ProbeFacts };
  eraseWrites: ProbeWrite[];
  sheet: { writesSinceSearch: ProbeWrite[]; facts: ProbeFacts };
  submission: { writes: ProbeWrite[]; facts: ProbeFacts };
}>("probe129-11cd11c/probe-output.json");

const writes = (list: ProbeWrite[]) => list.map(({ value, frameUrl }) => ({ value, url: frameUrl }));
const observed = (facts: ProbeFacts, displays: number, onScreen: ProbeWrite[]): XssSeen => ({
  reached: true,
  displays,
  writes: writes(onScreen),
  asText: { inText: facts.innerTextHasPayload, inFields: facts.fieldsWithPayload.length },
  networkIdle: true,
});
// Sur le legacy : la recherche compte ses lignes (liens du numéro), la fiche et
// la remise les éléments qui affichent le numéro. Sur la remise, la seule
// écriture de la sonde vient de la page de résultats, avant l'écran.
const LEGACY = {
  search: observed(PROBE.search.facts, PROBE.search.facts.linksNamedNumber, PROBE.search.writes),
  sheet: observed(PROBE.sheet.facts, PROBE.sheet.facts.textNumber, PROBE.sheet.writesSinceSearch),
  submission: observed(PROBE.submission.facts, PROBE.submission.facts.textNumber, []),
};
const RAW = { "gates/xss/search.json": "sha256:search" };
const outcomes = (screen: keyof typeof LEGACY, observation: XssObservation) => xssResults(screen, observation, RAW).map(({ name, outcome, examined }) => [name, outcome, examined]);

describe("xssResults, on the legacy", () => {
  // Décision de Karim (#129) : la recherche rend la charge en HTML, aucun texte
  // n'en est affiché. Le legacy échoue aux deux résultats de la recherche.
  it("fails executed and as-text on the search, one row examined", () => {
    expect(outcomes("search", LEGACY.search)).toEqual([
      ["executed/search", "failed", 1],
      ["as-text/search", "failed", 1],
    ]);
  });

  it("passes the sheet, payload in the value of a field, and the submission, payload in the text", () => {
    expect(outcomes("sheet", LEGACY.sheet)).toEqual([
      ["executed/sheet", "passed", 1],
      ["as-text/sheet", "passed", 1],
    ]);
    expect(outcomes("submission", LEGACY.submission)).toEqual([
      ["executed/submission", "passed", 1],
      ["as-text/submission", "passed", 1],
    ]);
  });

  it("gives the writes in findings and values, with the raw cited", () => {
    const [executed, asText] = xssResults("search", LEGACY.search, RAW);
    expect(executed).toMatchObject({
      gate: "xss",
      kind: "judged",
      findings: [{ screen: "search", value: "1", url: PROBE.search.writes[0]?.frameUrl }],
      values: { displays: 1, writes: 1, networkIdle: 1 },
      raw: RAW,
    });
    expect(asText).toMatchObject({ findings: [{ screen: "search", payloadAsText: false }], values: { displays: 1, inText: 0, inFields: 0 } });
  });
});

describe("xssResults, against a candidate", () => {
  // Les écritures après la charge, effacement compris, restent signalées.
  it("keeps every write, an erasing one included", () => {
    const [executed] = xssResults("search", { ...LEGACY.search, writes: writes([...PROBE.search.writes, ...PROBE.eraseWrites]) }, {});
    expect(executed?.outcome).toBe("failed");
    expect(executed?.findings.map((finding) => (finding as { value: string }).value)).toEqual(["1", "undefined", "after-overwrite"]);
  });

  it("bounds the length of a written value", () => {
    const [executed] = xssResults("sheet", { ...LEGACY.sheet, writes: [{ value: "x".repeat(XSS_WRITE_LIMIT + 10), url: "http://candidate/" }] }, {});
    expect((executed?.findings[0] as { value: string }).value).toBe(`${"x".repeat(XSS_WRITE_LIMIT)}…`);
  });

  it("passes as-text when the payload is in the text, and says when the network never went idle", () => {
    const [executed, asText] = xssResults("search", { ...LEGACY.search, writes: [], asText: { inText: true, inFields: 0 }, networkIdle: false }, {});
    expect(executed).toMatchObject({ outcome: "passed", values: { networkIdle: 0 } });
    expect(asText).toMatchObject({ outcome: "passed", findings: [], values: { inText: 1 } });
  });

  it("is not-evaluable when the row is absent", () => {
    expect(outcomes("search", { ...LEGACY.search, displays: 0 })).toEqual([
      ["executed/search", "not-evaluable", 0],
      ["as-text/search", "not-evaluable", 0],
    ]);
    expect(xssResults("search", { ...LEGACY.search, displays: 0 }, {})[1]?.findings).toContainEqual({ screen: "search", dossier: "D-0101", displays: 0 });
  });

  it("is not-evaluable when the screen is not reached, and says where the navigation failed", () => {
    const results = xssResults("submission", { reached: false, step: "remise D-0118", message: "locator.click: Timeout 30000ms exceeded" }, {});
    expect(results.map(({ outcome, examined }) => [outcome, examined])).toEqual([
      ["not-evaluable", 0],
      ["not-evaluable", 0],
    ]);
    expect(results[0]?.findings).toEqual([{ screen: "submission", unreached: "remise D-0118", message: "locator.click: Timeout 30000ms exceeded" }]);
  });
});

describe("xss gate", () => {
  it("declares six judged results, executed then as-text, screen by screen", () => {
    expect(xssGate).toMatchObject({ name: "xss", group: "browser-read" });
    expect(Object.entries(xssGate.results)).toEqual([
      ["executed/search", "judged"],
      ["as-text/search", "judged"],
      ["executed/sheet", "judged"],
      ["as-text/sheet", "judged"],
      ["executed/submission", "judged"],
      ["as-text/submission", "judged"],
    ]);
  });

  it("reads D-0101 for the search and the sheet, D-0118 for the submission", () => {
    expect(XSS_DOSSIERS).toEqual({ search: "D-0101", sheet: "D-0101", submission: "D-0118" });
  });
});

describe("payloadOf", () => {
  const dataset = readFileSync(new URL("../../fixtures/legacy-app/src/main/resources/dossiers.json", import.meta.url), "utf8");

  it("reads the payload of the dossiers of gate:xss in the dataset", () => {
    expect(payloadOf(dataset)).toEqual({ payload: '<img src=x onerror="window.__mbXss=1">', subjects: { "D-0101": "Dossier réservé à la porte XSS", "D-0118": "Second dossier réservé à la porte XSS" } });
  });

  it("refuses dossiers of gate:xss that do not carry the same payload", () => {
    const parsed = JSON.parse(dataset) as { dossiers: { number: string; applicant: string }[] };
    const changed = { ...parsed, dossiers: parsed.dossiers.map((dossier) => (dossier.number === "D-0118" ? { ...dossier, applicant: "Martin Leroy" } : dossier)) };
    expect(() => payloadOf(JSON.stringify(changed))).toThrow("D-0118 does not carry the payload of D-0101");
  });
});
