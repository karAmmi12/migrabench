// Porte d'accessibilité (spec de l'étape 4, « Accessibilité (axe-core et
// tableaux de mise en page) ») : analyse des sorties d'axe et jugement des
// tableaux, fonctions pures. Les sorties d'axe sont les vraies sorties de la
// sonde de #128 sur le legacy (tests/fixtures/probe128-ec414b9/PROVENANCE.md).
// Les nombres attendus viennent de la sortie de la sonde, relevée à part
// (nœuds `passes` + `violations` + `incomplete`, toutes règles) :
// écran 1 : 329 + 2 + 0 = 331 ; écran 2 : 29 + 1 + 0 = 30 ; écran 3 : 20 + 1 + 0 = 21.
import { describe, expect, it } from "vitest";
import { accessibilityGate, type AxeOutput, axeResults, tableResults } from "../../gates/accessibility.ts";
import { readJsonFixture } from "../real-fixtures.ts";

const AXE = {
  search: readJsonFixture<AxeOutput>("probe128-ec414b9/axe-screen1.json"),
  sheet: readJsonFixture<AxeOutput>("probe128-ec414b9/axe-screen2.json"),
  submission: readJsonFixture<AxeOutput>("probe128-ec414b9/axe-screen3.json"),
};
// Bruts cités par la porte : chemins de gates/raw.ts, empreintes de test.
const RAW = {
  "gates/accessibility/axe-search.json": "sha256:search",
  "gates/accessibility/axe-sheet.json": "sha256:sheet",
  "gates/accessibility/axe-submission.json": "sha256:submission",
};
const reached = (output: AxeOutput) => ({ reached: true as const, axe: output });

describe("axeResults, on the legacy", () => {
  const results = axeResults({ search: reached(AXE.search), sheet: reached(AXE.sheet), submission: reached(AXE.submission) }, RAW);
  const byName = Object.fromEntries(results.map((result) => [result.name, result]));

  it("gives one judged result per impact, in the order critical, serious, moderate, minor", () => {
    expect(results.map(({ gate, name, kind }) => [gate, name, kind])).toEqual([
      ["accessibility", "axe/critical", "judged"],
      ["accessibility", "axe/serious", "judged"],
      ["accessibility", "axe/moderate", "judged"],
      ["accessibility", "axe/minor", "judged"],
    ]);
  });

  it("examines every node evaluated on the three screens, the same for the four results", () => {
    expect(results.map(({ examined }) => examined)).toEqual([382, 382, 382, 382]);
  });

  it("fails an impact as soon as it has one violation, with its findings and values", () => {
    expect(byName["axe/critical"]).toMatchObject({
      outcome: "failed",
      findings: [{ screen: "search", rule: "image-alt", nodes: 1 }],
      values: { violations: 1, violatingNodes: 1, incomplete: 0 },
    });
    expect(byName["axe/serious"]).toMatchObject({
      outcome: "failed",
      findings: [
        { screen: "search", rule: "html-has-lang", nodes: 1 },
        { screen: "sheet", rule: "html-has-lang", nodes: 1 },
        { screen: "submission", rule: "html-has-lang", nodes: 1 },
      ],
      values: expect.objectContaining({ violations: 3, violatingNodes: 3, incomplete: 0, "search.reached": 1, "submission.violations": 1 }),
    });
  });

  it("passes an impact without violation", () => {
    for (const name of ["axe/moderate", "axe/minor"]) {
      expect(byName[name]).toMatchObject({ outcome: "passed", findings: [], values: { violations: 0, violatingNodes: 0, incomplete: 0 } });
    }
  });

  it("cites the raw axe outputs by their digest", () => {
    expect(byName["axe/minor"]?.raw).toEqual(RAW);
  });

  it("names the target of each violating node", () => {
    expect((byName["axe/critical"]?.findings[0] as { targets: unknown }).targets).toEqual(AXE.search.violations.find(({ id }) => id === "image-alt")?.nodes.map(({ target }) => target));
  });
});

describe("axeResults, with a screen not reached", () => {
  const unreached = { reached: false as const, step: "remise D-0003", message: "locator.click: Timeout 30000ms exceeded" };
  const results = axeResults({ search: reached(AXE.search), sheet: reached(AXE.sheet), submission: unreached }, RAW);

  // Décision de Karim (#128) : un candidat n'échappe pas à axe en cassant un
  // écran. Les quatre résultats sont non évaluables, sans examen compté.
  it("makes the four results not-evaluable, and says where the navigation failed", () => {
    expect(results.map(({ outcome, examined }) => [outcome, examined])).toEqual([
      ["not-evaluable", 0],
      ["not-evaluable", 0],
      ["not-evaluable", 0],
      ["not-evaluable", 0],
    ]);
    expect(results[3]?.findings).toEqual([{ screen: "submission", unreached: "remise D-0003", message: "locator.click: Timeout 30000ms exceeded" }]);
  });

  // L'étape 5 peut encore lire ce qui a été vu sur les écrans atteints.
  it("keeps in values the numbers seen on the reached screens, screen by screen", () => {
    expect(results[1]?.values).toEqual({
      violations: 2,
      violatingNodes: 2,
      incomplete: 0,
      "search.reached": 1,
      "search.violations": 1,
      "search.violatingNodes": 1,
      "search.incomplete": 0,
      "sheet.reached": 1,
      "sheet.violations": 1,
      "sheet.violatingNodes": 1,
      "sheet.incomplete": 0,
      "submission.reached": 0,
    });
  });

  it("is not-evaluable when no screen was reached", () => {
    const none = axeResults({ search: unreached, sheet: unreached, submission: unreached }, {});
    expect(none.map(({ outcome }) => outcome)).toEqual(["not-evaluable", "not-evaluable", "not-evaluable", "not-evaluable"]);
  });
});

describe("tableResults", () => {
  // Recensement du legacy relevé par la sonde : tableaux sans
  // `role="presentation"` ni `role="none"`, et ceux contenus dans un autre.
  it("fails the legacy search screen: 4 tables where 1 is expected, 3 nested", () => {
    expect(tableResults("search", { reached: true, census: { tables: 4, nested: 3, resultLinks: 38 } })).toEqual([
      expect.objectContaining({ name: "tables-count/search", kind: "judged", outcome: "failed", examined: 1, findings: [{ screen: "search", tables: 4, expected: 1 }], values: { tables: 4 } }),
      expect.objectContaining({ name: "tables-nested/search", kind: "judged", outcome: "failed", examined: 1, findings: [{ screen: "search", nested: 3 }], values: { nested: 3 } }),
    ]);
  });

  it("fails the legacy sheet and submission screens: 3 tables where none is expected, 2 nested", () => {
    for (const screen of ["sheet", "submission"] as const) {
      expect(tableResults(screen, { reached: true, census: { tables: 3, nested: 2, resultLinks: 0 } }).map(({ outcome }) => outcome)).toEqual(["failed", "failed"]);
    }
  });

  it("passes a search screen with the results table alone, and other screens without table", () => {
    expect(tableResults("search", { reached: true, census: { tables: 1, nested: 0, resultLinks: 38 } }).map(({ outcome }) => outcome)).toEqual(["passed", "passed"]);
    expect(tableResults("sheet", { reached: true, census: { tables: 0, nested: 0, resultLinks: 0 } }).map(({ outcome }) => outcome)).toEqual(["passed", "passed"]);
  });

  // Une liste vide : aucun tableau attendu, et la liste vide est signalée.
  it("expects no table on a search screen whose result list is empty, and says so", () => {
    const [count] = tableResults("search", { reached: true, census: { tables: 0, nested: 0, resultLinks: 0 } });
    expect(count).toMatchObject({ outcome: "passed", findings: [{ screen: "search", emptyResults: true }] });
  });

  it("is not-evaluable for a screen not reached, with the step where the navigation failed", () => {
    const unreached = { screen: "sheet", unreached: "sheet D-0003", message: "locator.click: Timeout 30000ms exceeded" };
    expect(tableResults("sheet", { reached: false, step: "sheet D-0003", message: "locator.click: Timeout 30000ms exceeded" })).toEqual([
      expect.objectContaining({ name: "tables-count/sheet", outcome: "not-evaluable", examined: 0, findings: [unreached] }),
      expect.objectContaining({ name: "tables-nested/sheet", outcome: "not-evaluable", examined: 0, findings: [unreached] }),
    ]);
  });
});

// Version d'axe-core enregistrée dans l'environnement de la mesure (décision
// de Karim, #128) : celle que le lock du dépôt installe pour @axe-core/playwright,
// sous lui ou, partagée avec Lighthouse (#134), à la racine de node_modules.
describe("accessibility gate tools", () => {
  it("names the axe-core version installed for @axe-core/playwright", () => {
    const lock = readJsonFixture<{ packages: Record<string, { version: string }> }>("../../package-lock.json");
    const installed = lock.packages["node_modules/@axe-core/playwright/node_modules/axe-core"] ?? lock.packages["node_modules/axe-core"];
    expect(accessibilityGate.tools?.()).toEqual({ "axe-core": installed?.version });
    expect(accessibilityGate.tools?.()).toEqual({ "axe-core": "4.14.0" });
  });
});
