// Porte d'accessibilité (spec de l'étape 4, « Accessibilité (axe-core et
// tableaux de mise en page) », TRAPS.md « Tableaux de mise en page ») : trois
// écrans du candidat, atteints comme l'oracle depuis BASE_URL et par clics,
// jugés par axe-core et par un recensement des tableaux.
//
// Résultats, tous jugés :
// - `tables-count/<écran>` : nombre de tableaux, 1 sur la recherche (0 si sa
//   liste est vide, ce que `findings` signale), 0 sur la fiche et la remise.
//   `examined` vaut 1 quand l'écran est atteint : l'élément examiné est
//   l'écran. `values` : `{ tables }` ;
// - `tables-nested/<écran>` : aucun tableau dans un autre. `values` :
//   `{ nested }` ;
// - `axe/<gravité>`, pour `critical`, `serious`, `moderate` et `minor` :
//   `failed` dès une violation de la gravité. `examined` est le total des
//   nœuds évalués sur les trois écrans (`passes`, `violations` et
//   `incomplete`, toutes règles), le même pour les quatre. Un écran non
//   atteint les rend non évaluables (`examined: 0`, décision de Karim).
//   `findings` : les violations de la gravité, puis les écrans non atteints.
//   `values` : `{ violations, violatingNodes, incomplete }` sur les écrans
//   atteints, où `violations` compte les règles en violation par écran et
//   `incomplete` les nœuds `incomplete`, ni violation ni réussite ; puis, pour
//   chaque écran, `<écran>.reached` (1 ou 0) et, s'il est atteint, ses trois
//   nombres `<écran>.violations`, `<écran>.violatingNodes`, `<écran>.incomplete`.
//
// Un tableau est un élément `table` sans `role="presentation"` ni
// `role="none"`, compté dans le DOM. L'arbre d'accessibilité de Chromium
// masque les tableaux de mise en page du legacy (rôle `LayoutTable`, sonde de
// #128, tests/fixtures/probe128-ec414b9/PROVENANCE.md) : le legacy y
// passerait, d'où le repli sur le DOM que prévoit TRAPS.md.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Browser, Page } from "@playwright/test";
import { connectBenchBrowser } from "../oracle/browser.ts";
import { button, goToSearch, goToSheet, goToSubmissionFromSheet } from "../oracle/navigation.ts";
import { parseUsersWithoutUnknown, type Role } from "../scripts/users.ts";
import { ROOT } from "../shared/root.ts";
import type { GateContext } from "./context.ts";
import type { Gate } from "./registry.ts";
import { saveGateRaw } from "./raw.ts";
import { judged, type JudgedResult } from "./result.ts";

export const SCREENS = ["search", "sheet", "submission"] as const;
export type Screen = (typeof SCREENS)[number];

export const IMPACTS = ["critical", "serious", "moderate", "minor"] as const;
type Impact = (typeof IMPACTS)[number];

// Tags WCAG des règles lancées, fixés dans #128 (WCAG 2.1 A et AA).
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

const GATE = "accessibility";

// Ce que la porte lit d'une sortie d'axe-core (`AxeResults`).
interface AxeNode {
  target: unknown;
}
interface AxeRule {
  id: string;
  impact?: string | null;
  help?: string;
  nodes: AxeNode[];
}
export interface AxeOutput {
  passes: AxeRule[];
  violations: AxeRule[];
  incomplete: AxeRule[];
}

// Écran atteint, ou étape où la navigation a échoué.
export type Unreached = { reached: false; step: string; message: string };
export type ScreenAxe = { reached: true; axe: AxeOutput } | Unreached;

export interface TableCensus {
  // Tableaux sans rôle de présentation, et ceux d'entre eux contenus dans un autre.
  tables: number;
  nested: number;
  // Liens de résultat (numéros de dossier) affichés : sur la recherche, une
  // liste vide n'attend aucun tableau.
  resultLinks: number;
}
export type ScreenTables = { reached: true; census: TableCensus } | Unreached;

const nodeCount = (rules: readonly AxeRule[]) => rules.reduce((sum, rule) => sum + rule.nodes.length, 0);
const unreachedFinding = (screen: Screen, { step, message }: Unreached) => ({ screen, unreached: step, message });

export function axeResults(screens: Record<Screen, ScreenAxe>, raw: Record<string, string>): JudgedResult[] {
  const reachedScreens = SCREENS.flatMap((screen) => {
    const entry = screens[screen];
    return entry.reached ? [{ screen, axe: entry.axe }] : [];
  });
  const unreached = SCREENS.flatMap((screen) => {
    const entry = screens[screen];
    return entry.reached ? [] : [unreachedFinding(screen, entry)];
  });
  // Un écran non atteint rend les quatre résultats non évaluables (décision de
  // Karim, #128) : un candidat n'échappe pas à axe en cassant un écran. Ce qui
  // a été vu reste dans `values`, écran par écran.
  const examined = unreached.length > 0 ? 0 : reachedScreens.reduce((sum, { axe }) => sum + nodeCount(axe.passes) + nodeCount(axe.violations) + nodeCount(axe.incomplete), 0);
  return IMPACTS.map((impact: Impact) => {
    const perScreen = reachedScreens.map(({ screen, axe }) => ({
      screen,
      violations: axe.violations
        .filter((rule) => rule.impact === impact)
        .map((rule) => ({ screen, rule: rule.id, help: rule.help, nodes: rule.nodes.length, targets: rule.nodes.map(({ target }) => target) })),
      incomplete: nodeCount(axe.incomplete),
    }));
    const violations = perScreen.flatMap((entry) => entry.violations);
    const values: Record<string, number> = {
      violations: violations.length,
      violatingNodes: violations.reduce((sum, { nodes }) => sum + nodes, 0),
      incomplete: perScreen.reduce((sum, entry) => sum + entry.incomplete, 0),
    };
    for (const screen of SCREENS) {
      const entry = perScreen.find((seen) => seen.screen === screen);
      values[`${screen}.reached`] = entry === undefined ? 0 : 1;
      if (entry === undefined) continue;
      values[`${screen}.violations`] = entry.violations.length;
      values[`${screen}.violatingNodes`] = entry.violations.reduce((sum, { nodes }) => sum + nodes, 0);
      values[`${screen}.incomplete`] = entry.incomplete;
    }
    return judged({ gate: GATE, name: `axe/${impact}`, examined, passed: violations.length === 0, findings: [...violations, ...unreached], values, raw });
  });
}

// Tableaux attendus sur un écran : le tableau de résultats de la recherche,
// s'il y a des résultats.
function expectedTables(screen: Screen, { resultLinks }: TableCensus): number {
  return screen === "search" && resultLinks > 0 ? 1 : 0;
}

export function tableResults(screen: Screen, entry: ScreenTables): JudgedResult[] {
  if (!entry.reached) {
    const findings = [unreachedFinding(screen, entry)];
    return [
      judged({ gate: GATE, name: `tables-count/${screen}`, examined: 0, passed: false, findings }),
      judged({ gate: GATE, name: `tables-nested/${screen}`, examined: 0, passed: false, findings }),
    ];
  }
  const { census } = entry;
  const expected = expectedTables(screen, census);
  const emptyResults = screen === "search" && census.resultLinks === 0;
  const countFindings = census.tables === expected ? [] : [{ screen, tables: census.tables, expected }];
  return [
    judged({
      gate: GATE,
      name: `tables-count/${screen}`,
      examined: 1,
      passed: census.tables === expected,
      findings: [...countFindings, ...(emptyResults ? [{ screen, emptyResults: true }] : [])],
      values: { tables: census.tables },
    }),
    judged({ gate: GATE, name: `tables-nested/${screen}`, examined: 1, passed: census.nested === 0, findings: census.nested === 0 ? [] : [{ screen, nested: census.nested }], values: { nested: census.nested } }),
  ];
}

// Recensement des tableaux de l'écran affiché, dans le DOM. Un tableau
// contenu dans un `table` de présentation n'est pas imbriqué : la mise en page
// corrigée par `role="presentation"` ou `role="none"` n'est plus un tableau.
// Les liens de résultat sont ceux dont le nom est un numéro de dossier, comme
// pour l'oracle (oracle/support.ts, `displayedNumbers`).
export async function tableCensus(page: Page): Promise<TableCensus> {
  const { tables, nested } = await page.evaluate(() => {
    const isTable = (element: Element) => element.tagName === "TABLE" && !["presentation", "none"].includes((element.getAttribute("role") ?? "").trim().toLowerCase());
    const counted = [...document.querySelectorAll("table")].filter(isTable);
    const inAnother = counted.filter((table) => {
      for (let parent = table.parentElement; parent !== null; parent = parent.parentElement) if (isTable(parent)) return true;
      return false;
    });
    return { tables: counted.length, nested: inAnother.length };
  });
  const resultLinks = await page.getByRole("link", { name: /^D-\d{4}$/ }).count();
  return { tables, nested, resultLinks };
}

// Dossier des écrans 2 et 3 : partagé, `EN_INSTRUCTION`, que l'oracle ne
// modifie pas. La porte n'y clique jamais sur « Remettre ».
const DOSSIER = "D-0003";
// Identité de chaque écran : la remise est l'écran de l'instructeur.
const IDENTITY: Record<Screen, Role> = { search: "agent", sheet: "agent", submission: "instructeur" };
// Attente du premier résultat de la recherche sans critère, au-delà de
// laquelle la liste est tenue pour vide. Valeur de conception, étalonnée par #100.
const FIRST_RESULT_TIMEOUT_MS = 10_000;
// Délai de conception de la porte : trois écrans, trois analyses d'axe.
const ACCESSIBILITY_TIMEOUT_MS = 300_000;

interface Prepared {
  browser: Browser;
  credentials: Record<Role, { username: string; password: string }>;
  subject: string;
}

// Navigation d'un écran, comme l'oracle et avec les mêmes noms d'étapes
// (oracle/support.ts) : chaque étape est nommée, pour dire où un écran non
// atteint s'est arrêté.
async function reach(screen: Screen, page: Page, subject: string, step: (name: string) => void): Promise<void> {
  if (screen === "search") {
    step("search");
    await goToSearch(page);
    step("search without criteria");
    await button(page, "Rechercher").click();
    // Aucun résultat au bout du délai : la liste est tenue pour vide, ce que
    // `findings` signale (tableResults).
    const firstResult = page.getByRole("link", { name: /^D-\d{4}$/ }).first();
    await firstResult.waitFor({ state: "visible", timeout: FIRST_RESULT_TIMEOUT_MS }).catch(() => undefined);
  } else {
    step(`sheet ${DOSSIER}`);
    await goToSheet(page, DOSSIER);
    if (screen === "sheet") return;
    step(`remise ${DOSSIER}`);
    await goToSubmissionFromSheet(page, subject);
  }
}

async function visit(screen: Screen, context: GateContext, prepared: Prepared): Promise<{ tables: ScreenTables; axe: ScreenAxe; raw?: [string, string] }> {
  const browserContext = await prepared.browser.newContext({
    baseURL: context.candidateUrl,
    httpCredentials: prepared.credentials[IDENTITY[screen]],
  });
  try {
    const page = await browserContext.newPage();
    let current = "";
    try {
      await reach(screen, page, prepared.subject, (name) => (current = name));
    } catch (error) {
      const message = error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);
      const unreached: Unreached = { reached: false, step: current, message };
      return { tables: unreached, axe: unreached };
    }
    const census = await tableCensus(page);
    // Chargé à l'analyse seulement : axe-core est lourd, et toute commande du
    // runner charge le registre des portes (#128, durée de la CLI en CI).
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    const axe = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
    const raw = await saveGateRaw(context.rawDir, GATE, `axe-${screen}.json`, `${JSON.stringify(axe, null, 2)}\n`);
    return { tables: { reached: true, census }, axe: { reached: true, axe }, raw };
  } finally {
    await browserContext.close();
  }
}

// Version d'axe-core installée pour @axe-core/playwright, celle qui juge.
function axeCoreVersion(): string {
  const fromAxePlaywright = createRequire(createRequire(import.meta.url).resolve("@axe-core/playwright"));
  return (JSON.parse(readFileSync(fromAxePlaywright.resolve("axe-core/package.json"), "utf8")) as { version: string }).version;
}

export const accessibilityGate: Gate<Prepared> = {
  name: GATE,
  group: "browser-read",
  results: Object.fromEntries([
    ...SCREENS.flatMap((screen) => [`tables-count/${screen}`, `tables-nested/${screen}`]),
    ...IMPACTS.map((impact) => `axe/${impact}`),
  ].map((name) => [name, "judged" as const])),
  timeoutMs: ACCESSIBILITY_TIMEOUT_MS,
  tools: () => ({ "axe-core": axeCoreVersion() }),
  // Entrées du banc : son navigateur, ses identités et son jeu de données.
  prepare: async (context) => {
    const users = parseUsersWithoutUnknown(readFileSync(`${ROOT}/fixtures/users.json`, "utf8"));
    const credential = (role: Role) => {
      const user = users.find((entry) => entry.role === role);
      if (user === undefined) throw new Error(`No user with role ${role} in fixtures/users.json`);
      return { username: user.username, password: user.password };
    };
    const datasetFile = `${ROOT}/fixtures/legacy-app/src/main/resources/dossiers.json`;
    const dataset = JSON.parse(readFileSync(datasetFile, "utf8")) as { dossiers: { number: string; subject: string }[] };
    const subject = dataset.dossiers.find(({ number }) => number === DOSSIER)?.subject;
    if (subject === undefined) throw new Error(`No dossier ${DOSSIER} in the dataset`);
    return { browser: await connectBenchBrowser(context.browserToken), credentials: { agent: credential("agent"), instructeur: credential("instructeur") }, subject };
  },
  examine: async (context, prepared) => {
    try {
      const visits = {} as Record<Screen, Awaited<ReturnType<typeof visit>>>;
      for (const screen of SCREENS) visits[screen] = await visit(screen, context, prepared);
      const raw = Object.fromEntries(SCREENS.flatMap((screen) => {
        const saved = visits[screen].raw;
        return saved === undefined ? [] : [saved];
      }));
      return [
        ...SCREENS.flatMap((screen) => tableResults(screen, visits[screen].tables)),
        ...axeResults({ search: visits.search.axe, sheet: visits.sheet.axe, submission: visits.submission.axe }, raw),
      ];
    } finally {
      await prepared.browser.close();
    }
  },
};
