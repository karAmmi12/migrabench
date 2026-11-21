// Outils partagés des scénarios de l'oracle (spec de l'étape 2, « Modules ») :
// fixture par rôle avec un HAR par scénario, navigation depuis BASE_URL,
// lecture des numéros affichés, dossiers partagés, statut atteint.
import { readFileSync } from "node:fs";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { parseUsersWithoutUnknown, type Role, UNKNOWN_USER } from "../scripts/users.ts";
import { REACH_ANNOTATION } from "./collect.ts";

export { expect } from "@playwright/test";

// Identité sous laquelle un scénario navigue.
export type Identity = Role | "no-credentials" | "unknown-user";

const users = parseUsersWithoutUnknown(
  readFileSync(new URL("../fixtures/users.json", import.meta.url), "utf8"),
);

function credentialsOf(identity: Identity): { username: string; password: string } | undefined {
  if (identity === "no-credentials") return undefined;
  if (identity === "unknown-user") return { ...UNKNOWN_USER };
  const user = users.find((entry) => entry.role === identity);
  if (user === undefined) throw new Error(`No user with role ${identity} in fixtures/users.json`);
  return { username: user.username, password: user.password };
}

// Chaque scénario a son propre contexte : identifiants par httpCredentials, et
// un HAR dédié, corps compris, sans filtre d'URL (toutes origines). Le HAR est
// joint au résultat sous le nom « har », que la collecte cite par empreinte.
export const test = base.extend<{ identity: Identity }>({
  identity: ["agent", { option: true }],
  context: async ({ browser, baseURL, identity }, use, testInfo) => {
    const harPath = testInfo.outputPath("scenario.har");
    const credentials = credentialsOf(identity);
    const context = await browser.newContext({
      ...(baseURL === undefined ? {} : { baseURL }),
      ...(credentials === undefined ? {} : { httpCredentials: credentials }),
      recordHar: { path: harPath, content: "embed" },
    });
    await use(context);
    await context.close();
    // Cité par son chemin, sans copie : le HAR reste à côté de la trace du scénario.
    testInfo.attachments.push({ name: "har", path: harPath, contentType: "application/json" });
  },
});

// Marque la fin des étapes de navigation : un échec sans cette annotation est
// un scénario non atteint, un échec avec elle un scénario échoué.
export function markReached(): void {
  test.info().annotations.push({ type: REACH_ANNOTATION, description: "reached" });
}

// Libellé de champ au texte exact, espaces normalisés ; seuls deux-points et
// `*` finaux sont tolérés (ADR 0006).
export function fieldLabel(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`^\\s*${escaped}(\\s*[:*])*\\s*$`);
}

export function field(page: Page, label: string): Locator {
  return page.getByLabel(fieldLabel(label));
}

export function button(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

// Vers la recherche : ouvrir BASE_URL ; atteint quand « Numéro » est visible.
export async function openSearch(page: Page): Promise<void> {
  await test.step("navigation: search", async () => {
    await page.goto("/");
    await field(page, "Numéro").waitFor({ state: "visible" });
  });
}

// Numéros affichés : liens dont le nom est exactement un numéro, dans l'ordre du document.
export async function displayedNumbers(page: Page): Promise<string[]> {
  const names = await page.getByRole("link", { name: /^D-\d{4}$/ }).allInnerTexts();
  return names.map((name) => name.trim());
}

// Dossiers partagés : ceux qu'aucune réservation ne cite. Seuls les numéros sont lus.
export const SHARED_NUMBERS: readonly string[] = (() => {
  const dataset = JSON.parse(
    readFileSync(new URL("../fixtures/legacy-app/src/main/resources/dossiers.json", import.meta.url), "utf8"),
  ) as { dossiers: { number: string }[]; reservations: Record<string, string[]> };
  const reserved = new Set(Object.values(dataset.reservations).flat());
  return dataset.dossiers.map((dossier) => dossier.number).filter((number) => !reserved.has(number)).sort();
})();

// Numéros affichés restreints aux dossiers partagés : seule observation permise
// à un scénario de lecture, pendant que d'autres scénarios écrivent.
export async function displayedSharedNumbers(page: Page): Promise<string[]> {
  return (await displayedNumbers(page)).filter((number) => SHARED_NUMBERS.includes(number));
}

// Vers la fiche : recherche par numéro, clic sur le lien du numéro ; atteint
// quand « Objet » est visible.
export async function openSheet(page: Page, number: string): Promise<void> {
  await test.step(`navigation: sheet ${number}`, async () => {
    await reachSheet(page, number);
  });
}

async function reachSheet(page: Page, number: string): Promise<void> {
  await page.goto("/");
  await field(page, "Numéro").fill(number);
  await button(page, "Rechercher").click();
  await page.getByRole("link", { name: number, exact: true }).click();
  await field(page, "Objet").waitFor({ state: "visible" });
}

// Relecture : nombre fixe d'essais, chacun une nouvelle navigation vers la
// fiche dans une nouvelle page du même contexte (jamais page.reload()). Ce
// réessai n'est pas une relance du scénario. Le rappel vérifie avec l'`expect`
// qu'il reçoit, dont l'attente est l'intervalle : chaque essai reste court, et
// l'échec du dernier rend l'erreur de l'assertion, pas un délai dépassé.
export const REREAD = { attempts: 5, intervalMs: 500 } as const;
export const REREAD_ANNOTATION = "mb:reread-attempts";
const rereadExpect = expect.configure({ timeout: REREAD.intervalMs });

export async function reread(
  page: Page,
  number: string,
  check: (sheet: Page, expectOnce: typeof rereadExpect) => Promise<void>,
): Promise<void> {
  await test.step(`verification: reread sheet ${number}`, async () => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= REREAD.attempts; attempt += 1) {
      const sheet = await page.context().newPage();
      try {
        await reachSheet(sheet, number);
        await check(sheet, rereadExpect);
        test.info().annotations.push({ type: REREAD_ANNOTATION, description: String(attempt) });
        return;
      } catch (error) {
        lastError = error;
      } finally {
        await sheet.close();
      }
    }
    test.info().annotations.push({ type: REREAD_ANNOTATION, description: `${REREAD.attempts} (failed)` });
    throw lastError;
  });
}

// `defaultPrevented` d'un raccourci : écouteur keydown en capture sur window,
// lu une fois la propagation terminée (tâche suivante), et remonté à Node par
// une fonction exposée, pour survivre à un envoi de formulaire qui quitte la page.
let bindingCount = 0;

export async function pressAndReadDefaultPrevented(page: Page, keys: string): Promise<boolean> {
  const binding = `__mbDefaultPrevented${bindingCount++}`;
  let report: (prevented: boolean) => void = () => {};
  const reported = new Promise<boolean>((resolve) => {
    report = resolve;
  });
  await page.exposeFunction(binding, (prevented: boolean) => report(prevented));
  // Le keydown lu est celui de la touche finale : ceux des touches de
  // modification (Control pour Control+s) le précèdent et sont ignorés.
  await page.evaluate((name) => {
    const modifiers = ["Control", "Shift", "Alt", "Meta", "AltGraph"];
    const listener = (event: KeyboardEvent): void => {
      if (modifiers.includes(event.key)) return;
      window.removeEventListener("keydown", listener, { capture: true });
      setTimeout(() => {
        (window as unknown as Record<string, (prevented: boolean) => void>)[name]?.(event.defaultPrevented);
      }, 0);
    };
    window.addEventListener("keydown", listener, { capture: true });
  }, binding);
  await page.keyboard.press(keys);
  return withTimeout(reported, 5_000, `no keydown read after ${keys}`);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
