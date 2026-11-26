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
//   nœuds évalués sur les écrans atteints (`passes`, `violations` et
//   `incomplete`, toutes règles), le même pour les quatre. `findings` : les
//   violations de la gravité, puis les écrans non atteints. `values` :
//   `{ violations, violatingNodes, incomplete }`, où `violations` compte les
//   règles en violation par écran et `incomplete` les nœuds `incomplete` de
//   tous les écrans, ni violation ni réussite.
//
// Un tableau est un élément `table` sans `role="presentation"` ni
// `role="none"`, compté dans le DOM. L'arbre d'accessibilité de Chromium
// masque les tableaux de mise en page du legacy (rôle `LayoutTable`, sonde de
// #128, tests/fixtures/probe128-ec414b9/PROVENANCE.md) : le legacy y
// passerait, d'où le repli sur le DOM que prévoit TRAPS.md.
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "@playwright/test";
import { connectBenchBrowser } from "../oracle/browser.ts";
import { button, goToSearch, goToSheet, goToSubmission } from "../oracle/navigation.ts";
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
  const examined = reachedScreens.reduce((sum, { axe }) => sum + nodeCount(axe.passes) + nodeCount(axe.violations) + nodeCount(axe.incomplete), 0);
  const incomplete = reachedScreens.reduce((sum, { axe }) => sum + nodeCount(axe.incomplete), 0);
  const unreached = SCREENS.flatMap((screen) => {
    const entry = screens[screen];
    return entry.reached ? [] : [unreachedFinding(screen, entry)];
  });
  return IMPACTS.map((impact: Impact) => {
    const violations = reachedScreens.flatMap(({ screen, axe }) =>
      axe.violations.filter((rule) => rule.impact === impact).map((rule) => ({ screen, rule: rule.id, help: rule.help, nodes: rule.nodes.length, targets: rule.nodes.map(({ target }) => target) })),
    );
    return judged({
      gate: GATE,
      name: `axe/${impact}`,
      examined,
      passed: violations.length === 0,
      findings: [...violations, ...unreached],
      values: { violations: violations.length, violatingNodes: violations.reduce((sum, { nodes }) => sum + nodes, 0), incomplete },
      raw,
    });
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

// Navigation d'un écran, comme l'oracle : chaque étape est nommée, pour dire
// où un écran non atteint s'est arrêté.
async function reach(screen: Screen, page: Page, subject: string, step: (name: string) => void): Promise<void> {
  if (screen === "search") {
    step("search");
    await goToSearch(page);
    step("search without criteria");
    await button(page, "Rechercher").click();
    await page.getByRole("link", { name: /^D-\d{4}$/ }).first().waitFor({ state: "visible", timeout: FIRST_RESULT_TIMEOUT_MS }).catch(() => undefined);
    return;
  }
  step(`sheet ${DOSSIER}`);
  if (screen === "sheet") return goToSheet(page, DOSSIER);
  step(`submission ${DOSSIER}`);
  return goToSubmission(page, DOSSIER, subject);
}

async function visit(screen: Screen, context: GateContext, prepared: Prepared): Promise<{ tables: ScreenTables; axe: ScreenAxe; raw?: [string, string] }> {
  const browserContext = await prepared.browser.newContext({ baseURL: context.candidateUrl, httpCredentials: prepared.credentials[IDENTITY[screen]] });
  try {
    const page = await browserContext.newPage();
    let current = "";
    try {
      await reach(screen, page, prepared.subject, (name) => (current = name));
    } catch (error) {
      const unreached: Unreached = { reached: false, step: current, message: error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error) };
      return { tables: unreached, axe: unreached };
    }
    const census = await tableCensus(page);
    const axe = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
    const raw = await saveGateRaw(context.rawDir, GATE, `axe-${screen}.json`, `${JSON.stringify(axe, null, 2)}\n`);
    return { tables: { reached: true, census }, axe: { reached: true, axe }, raw };
  } finally {
    await browserContext.close();
  }
}

export const accessibilityGate: Gate<Prepared> = {
  name: GATE,
  group: "browser-read",
  results: Object.fromEntries([
    ...SCREENS.flatMap((screen) => [`tables-count/${screen}`, `tables-nested/${screen}`]),
    ...IMPACTS.map((impact) => `axe/${impact}`),
  ].map((name) => [name, "judged" as const])),
  timeoutMs: ACCESSIBILITY_TIMEOUT_MS,
  // Entrées du banc : son navigateur, ses identités et son jeu de données.
  prepare: async () => {
    const users = parseUsersWithoutUnknown(readFileSync(`${ROOT}/fixtures/users.json`, "utf8"));
    const credential = (role: Role) => {
      const user = users.find((entry) => entry.role === role);
      if (user === undefined) throw new Error(`No user with role ${role} in fixtures/users.json`);
      return { username: user.username, password: user.password };
    };
    const dataset = JSON.parse(readFileSync(`${ROOT}/fixtures/legacy-app/src/main/resources/dossiers.json`, "utf8")) as { dossiers: { number: string; subject: string }[] };
    const subject = dataset.dossiers.find(({ number }) => number === DOSSIER)?.subject;
    if (subject === undefined) throw new Error(`No dossier ${DOSSIER} in the dataset`);
    return { browser: await connectBenchBrowser(), credentials: { agent: credential("agent"), instructeur: credential("instructeur") }, subject };
  },
  examine: async (context, prepared) => {
    try {
      const visits = {} as Record<Screen, Awaited<ReturnType<typeof visit>>>;
      for (const screen of SCREENS) visits[screen] = await visit(screen, context, prepared);
      const raw = Object.fromEntries(SCREENS.flatMap((screen) => (visits[screen].raw === undefined ? [] : [visits[screen].raw])));
      return [
        ...SCREENS.flatMap((screen) => tableResults(screen, visits[screen].tables)),
        ...axeResults({ search: visits.search.axe, sheet: visits.sheet.axe, submission: visits.submission.axe }, raw),
      ];
    } finally {
      await prepared.browser.close();
    }
  },
};
