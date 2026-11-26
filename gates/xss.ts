// Porte XSS (spec de l'étape 4, « XSS », TRAPS.md « XSS par
// `<bean:write filter="false">` ») : la charge du jeu de données, affichée sur
// les trois écrans du candidat, atteints comme l'oracle depuis BASE_URL et par
// clics. La recherche et la fiche montrent `D-0101`, la remise `D-0118`, le
// second dossier de `gate:xss`, `EN_INSTRUCTION` : la fiche d'un `BROUILLON`
// n'a pas de lien « Remise ». La porte ne clique jamais sur « Remettre ».
//
// Résultats, tous jugés, pour chaque écran :
// - `executed/<écran>` : aucune écriture de `window.__mbXss` sur l'écran.
//   `findings` : chaque écriture, sa valeur (bornée) et l'URL du cadre.
//   `values` : `{ displays, writes, networkIdle }` ;
// - `as-text/<écran>` : la charge apparaît en texte, dans le texte rendu de la
//   page ou dans la valeur d'un champ visible. `values` :
//   `{ displays, inText, inFields }`.
// `examined` est le nombre d'affichages du dossier sur l'écran : les lignes de
// résultat (liens du numéro) sur la recherche, les éléments visibles qui
// affichent le numéro sur la fiche et la remise. Une ligne absente, ou un
// écran non atteint, donne `not-evaluable`. `networkIdle` vaut 0 quand le
// réseau n'a pas été au repos avant le jugement.
//
// La détection : un script d'initialisation définit `__mbXss` comme une
// propriété non configurable à accesseur, dont l'écriture est signalée au banc
// par `exposeBinding`. Il garde la fonction du binding dans une fermeture :
// ni `delete`, ni `defineProperty`, ni l'écrasement du binding par la page
// n'effacent une écriture (sonde de #129,
// tests/fixtures/probe129-11cd11c/PROVENANCE.md).
//
// L'attribution : une écriture compte pour l'écran affiché quand elle arrive.
// Sur le legacy, la charge s'exécute déjà sur la page de résultats qui mène à
// la fiche (sonde de #129). Avant le clic qui mène à l'écran jugé, la porte
// attend donc que l'écran précédent soit au repos, et seules les écritures
// reçues ensuite comptent.
import { readFileSync } from "node:fs";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { connectBenchBrowser } from "../oracle/browser.ts";
import { button, exactText, field, goToSearch, remiseLink } from "../oracle/navigation.ts";
import { atLeastOne } from "../oracle/occurrences.ts";
import { parseUsersWithoutUnknown, type Role } from "../scripts/users.ts";
import { ROOT } from "../shared/root.ts";
import { SCREENS, type Screen, type Unreached } from "./accessibility.ts";
import type { GateContext } from "./context.ts";
import type { Gate } from "./registry.ts";
import { saveGateRaw } from "./raw.ts";
import { judged, type JudgedResult } from "./result.ts";

const GATE = "xss";

// Dossiers de `gate:xss` affichés par chaque écran.
export const XSS_DOSSIERS: Readonly<Record<Screen, string>> = { search: "D-0101", sheet: "D-0101", submission: "D-0118" };
// Identité de chaque écran : la remise est l'écran de l'instructeur.
const IDENTITY: Record<Screen, Role> = { search: "agent", sheet: "agent", submission: "instructeur" };

// Longueur gardée d'une valeur écrite : le candidat la choisit.
export const XSS_WRITE_LIMIT = 200;
// Attente du réseau au repos avant de juger : aucune requête en cours pendant
// IDLE_MS (la règle de `networkidle` de Playwright), au plus pendant
// NETWORK_IDLE_TIMEOUT_MS. Puis SETTLE_MS, pour une injection lancée par un
// minuteur après la dernière réponse. Valeurs de conception, étalonnées par
// #100.
const IDLE_MS = 500;
const NETWORK_IDLE_TIMEOUT_MS = 15_000;
const SETTLE_MS = 1_000;
// Délai de conception de la porte : trois écrans, chacun avec ses attentes.
const XSS_TIMEOUT_MS = 180_000;
// Attente de la ligne du dossier sur la recherche, au-delà de laquelle elle est
// tenue pour absente. Valeur de conception, comme pour l'accessibilité.
const ROW_TIMEOUT_MS = 10_000;
// Nom du binding qui reçoit les écritures, dans chaque page.
const BINDING = "__mbXssReport";

export interface XssWrite {
  value: string;
  url: string;
}

export interface XssSeen {
  reached: true;
  // Affichages du dossier sur l'écran.
  displays: number;
  // Écritures reçues sur l'écran.
  writes: XssWrite[];
  // La charge dans le texte rendu, et le nombre de champs visibles qui la contiennent.
  asText: { inText: boolean; inFields: number };
  networkIdle: boolean;
}
export type XssObservation = XssSeen | Unreached;

const bounded = (value: string) => (value.length > XSS_WRITE_LIMIT ? `${value.slice(0, XSS_WRITE_LIMIT)}…` : value);

export function xssResults(screen: Screen, observation: XssObservation, raw: Record<string, string>): JudgedResult[] {
  const executed = `executed/${screen}`;
  const asText = `as-text/${screen}`;
  if (!observation.reached) {
    const findings = [{ screen, unreached: observation.step, message: observation.message }];
    return [
      judged({ gate: GATE, name: executed, examined: 0, passed: false, findings, raw }),
      judged({ gate: GATE, name: asText, examined: 0, passed: false, findings, raw }),
    ];
  }
  const { displays, writes, asText: shown, networkIdle } = observation;
  const absent = displays === 0 ? [{ screen, dossier: XSS_DOSSIERS[screen], displays: 0 }] : [];
  const asTextPassed = shown.inText || shown.inFields > 0;
  return [
    judged({
      gate: GATE,
      name: executed,
      examined: displays,
      passed: writes.length === 0,
      findings: [...writes.map(({ value, url }) => ({ screen, value: bounded(value), url })), ...absent],
      values: { displays, writes: writes.length, networkIdle: networkIdle ? 1 : 0 },
      raw,
    }),
    judged({
      gate: GATE,
      name: asText,
      examined: displays,
      passed: asTextPassed,
      findings: [...(asTextPassed ? [] : [{ screen, payloadAsText: false }]), ...absent],
      values: { displays, inText: shown.inText ? 1 : 0, inFields: shown.inFields },
      raw,
    }),
  ];
}

// Charge des dossiers de `gate:xss`, la même pour les deux, et leur objet,
// marqueur d'atteinte de la remise.
export function payloadOf(datasetJson: string): { payload: string; subjects: Record<string, string> } {
  const dataset = JSON.parse(datasetJson) as { dossiers: { number: string; applicant: string; subject: string }[] };
  const numbers = [...new Set(Object.values(XSS_DOSSIERS))];
  const dossiers = numbers.map((number) => {
    const dossier = dataset.dossiers.find((entry) => entry.number === number);
    if (dossier === undefined) throw new Error(`No dossier ${number} in the dataset`);
    return dossier;
  });
  const [first, ...others] = dossiers;
  if (first === undefined) throw new Error("No dossier for the XSS gate");
  for (const other of others) if (other.applicant !== first.applicant) throw new Error(`${other.number} does not carry the payload of ${first.number}`);
  return { payload: first.applicant, subjects: Object.fromEntries(dossiers.map(({ number, subject }) => [number, subject])) };
}

// Pose l'accesseur et le binding dans le contexte, avant toute page. Rend la
// liste des écritures reçues, dans l'ordre d'arrivée.
async function arm(browserContext: BrowserContext): Promise<XssWrite[]> {
  const received: XssWrite[] = [];
  await browserContext.exposeBinding(BINDING, (source: { frame: { url(): string } }, value: unknown) => {
    received.push({ value: typeof value === "string" ? value : String(value), url: source.frame.url() });
  });
  await browserContext.addInitScript((binding: string) => {
    const target = window as unknown as Record<string, unknown>;
    // Gardés dans la fermeture avant tout script de la page.
    const report = target[binding] as (value: string) => unknown;
    const toText = String;
    Object.defineProperty(window, "__mbXss", {
      configurable: false,
      enumerable: false,
      get: () => undefined,
      set: (value: unknown) => {
        let text = "<unprintable>";
        try {
          text = toText(value);
        } catch {
          // Valeur dont la conversion lève : l'écriture reste signalée.
        }
        void report(text);
      },
    });
  }, BINDING);
  return received;
}

// Attend que le réseau de la page soit au repos (voir IDLE_MS), puis SETTLE_MS.
// Rend faux si le réseau n'a pas été au repos à temps.
async function settle(page: Page, inFlight: () => number): Promise<boolean> {
  const deadline = Date.now() + NETWORK_IDLE_TIMEOUT_MS;
  let idleSince: number | undefined;
  let idle = false;
  while (Date.now() < deadline) {
    if (inFlight() === 0) {
      idleSince ??= Date.now();
      if (Date.now() - idleSince >= IDLE_MS) {
        idle = true;
        break;
      }
    } else {
      idleSince = undefined;
    }
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(SETTLE_MS);
  return idle;
}

interface Prepared {
  browser: Browser;
  credentials: Record<Role, { username: string; password: string }>;
  payload: string;
  subjects: Record<string, string>;
}

// Affichages du dossier : lignes de la recherche, ou éléments visibles qui
// affichent son numéro.
async function displays(screen: Screen, page: Page, number: string): Promise<number> {
  if (screen === "search") return page.getByRole("link", { name: number, exact: true }).count();
  return page.getByText(number).filter({ visible: true }).count();
}

async function payloadAsText(page: Page, payload: string): Promise<{ inText: boolean; inFields: number }> {
  return page.evaluate((text) => {
    const visible = (element: Element) => element.getClientRects().length > 0;
    const fields = [...document.querySelectorAll("input, textarea")].filter((element) => visible(element) && (element as HTMLInputElement).value.includes(text));
    return { inText: document.body.innerText.includes(text), inFields: fields.length };
  }, payload);
}

async function visit(screen: Screen, prepared: Prepared, context: GateContext): Promise<{ observation: XssObservation; raw: unknown }> {
  const number = XSS_DOSSIERS[screen];
  const browserContext = await prepared.browser.newContext({ baseURL: context.candidateUrl, httpCredentials: prepared.credentials[IDENTITY[screen]] });
  try {
    const received = await arm(browserContext);
    const page = await browserContext.newPage();
    let inFlight = 0;
    page.on("request", () => (inFlight += 1));
    page.on("requestfinished", () => (inFlight -= 1));
    page.on("requestfailed", () => (inFlight -= 1));
    const pending = () => inFlight;
    let step = "";
    // Index de la première écriture qui compte pour l'écran.
    let boundary = 0;
    try {
      step = "search";
      await goToSearch(page);
      await field(page, "Numéro").fill(number);
      step = `search ${number}`;
      await button(page, "Rechercher").click();
      await page.getByRole("link", { name: number, exact: true }).first().waitFor({ state: "visible", timeout: ROW_TIMEOUT_MS }).catch((error: unknown) => {
        // Ligne absente : la recherche est atteinte, sans affichage du dossier.
        if (screen !== "search") throw error;
      });
      if (screen !== "search") {
        await settle(page, pending);
        boundary = received.length;
        step = `sheet ${number}`;
        await page.getByRole("link", { name: number, exact: true }).click();
        await field(page, "Objet").waitFor({ state: "visible" });
      }
      if (screen === "submission") {
        await settle(page, pending);
        boundary = received.length;
        step = `remise ${number}`;
        await remiseLink(page).click();
        const subject = prepared.subjects[number] ?? "";
        await atLeastOne(exactText(page, subject)).waitFor({ state: "visible" });
      }
    } catch (error) {
      const message = error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);
      return { observation: { reached: false, step, message }, raw: { screen, number, unreached: step, message, received } };
    }
    const networkIdle = await settle(page, pending);
    const observation: XssObservation = {
      reached: true,
      displays: await displays(screen, page, number),
      writes: received.slice(boundary),
      asText: await payloadAsText(page, prepared.payload),
      networkIdle,
    };
    return { observation, raw: { screen, number, url: page.url(), observation, receivedBeforeScreen: received.slice(0, boundary) } };
  } finally {
    await browserContext.close();
  }
}

export const xssGate: Gate<Prepared> = {
  name: GATE,
  group: "browser-read",
  results: Object.fromEntries(SCREENS.flatMap((screen) => [`executed/${screen}`, `as-text/${screen}`]).map((name) => [name, "judged" as const])),
  timeoutMs: XSS_TIMEOUT_MS,
  // Entrées du banc : son navigateur, ses identités et la charge de son jeu de données.
  prepare: async () => {
    const users = parseUsersWithoutUnknown(readFileSync(`${ROOT}/fixtures/users.json`, "utf8"));
    const credential = (role: Role) => {
      const user = users.find((entry) => entry.role === role);
      if (user === undefined) throw new Error(`No user with role ${role} in fixtures/users.json`);
      return { username: user.username, password: user.password };
    };
    const { payload, subjects } = payloadOf(readFileSync(`${ROOT}/fixtures/legacy-app/src/main/resources/dossiers.json`, "utf8"));
    return { browser: await connectBenchBrowser(), credentials: { agent: credential("agent"), instructeur: credential("instructeur") }, payload, subjects };
  },
  examine: async (context, prepared) => {
    try {
      const results: JudgedResult[] = [];
      for (const screen of SCREENS) {
        const { observation, raw } = await visit(screen, prepared, context);
        const saved = await saveGateRaw(context.rawDir, GATE, `${screen}.json`, `${JSON.stringify(raw, null, 2)}\n`);
        results.push(...xssResults(screen, observation, Object.fromEntries([saved])));
      }
      return results;
    } finally {
      await prepared.browser.close();
    }
  },
};
