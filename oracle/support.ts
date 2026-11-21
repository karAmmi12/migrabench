// Outils partagés des scénarios de l'oracle (spec de l'étape 2, « Modules ») :
// fixture par rôle avec un HAR par scénario, navigation depuis BASE_URL (vers
// la recherche, la fiche et la remise), relecture, lecture des numéros
// affichés, textes exacts, dossiers partagés, statut atteint, variantes. La
// mesure de `defaultPrevented` est dans default-prevented.ts, le refus des
// boîtes de dialogue dans dialogs.ts, le comptage des champs modifiables dans
// editable-fields.ts, la vérification de présence dans occurrences.ts,
// l'ouverture de l'accusé de remise dans receipt.ts, les variantes dans variants.ts.
import { readFileSync } from "node:fs";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { parseUsersWithoutUnknown, type Role, UNKNOWN_USER } from "../scripts/users.ts";
import { archiveReference } from "./archive-reference.ts";
import { REACH_ANNOTATION, REREAD_ANNOTATION } from "./collect.ts";
import { atLeastOne } from "./occurrences.ts";
import { type VariantKey, type Variants, variantAnnotation } from "./variants.ts";

export { pressAndReadDefaultPrevented } from "./default-prevented.ts";
export { refuseDialogs } from "./dialogs.ts";
export { editableFieldCount } from "./editable-fields.ts";
export { openReceipt, receiptLink } from "./receipt.ts";
export { atLeastOne } from "./occurrences.ts";

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

// Variante observée quand le moyen est libre (spec de l'étape 2, « Variantes
// observées ») : enregistrée pour le rapport, jamais pour juger. Seules les
// clés et valeurs de la spec sont acceptées (oracle/variants.ts).
export function recordVariant<K extends VariantKey>(key: K, value: Variants[K]): void {
  test.info().annotations.push(variantAnnotation(key, value));
}

// Référence d'archivage attendue sur l'accusé de remise d'un dossier, calculée
// avec le sel de l'exécution, que `npm run oracle` transmet au seul processus
// Playwright (ARCHIVE_SALT). Hors de `npm run oracle`, l'échec le dit.
export function expectedArchiveReference(number: string): string {
  const salt = process.env.ARCHIVE_SALT;
  if (!salt) throw new Error("ARCHIVE_SALT is not set: the receipt scenarios run only through `npm run oracle`");
  return archiveReference(salt, number);
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

// Toutes les occurrences d'un texte exact. Une vérification de présence le
// passe à atLeastOne ; une vérification d'absence le garde entier.
export function exactText(page: Page, value: string): Locator {
  return page.getByText(value, { exact: true });
}

// Vers la recherche : ouvrir BASE_URL ; atteint quand « Numéro » est visible.
export async function openSearch(page: Page): Promise<void> {
  await test.step("navigation: search", async () => {
    await loadSearch(page);
  });
}

async function loadSearch(page: Page): Promise<void> {
  await page.goto("/");
  await field(page, "Numéro").waitFor({ state: "visible" });
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
  await loadSearch(page);
  await field(page, "Numéro").fill(number);
  await button(page, "Rechercher").click();
  await page.getByRole("link", { name: number, exact: true }).click();
  await field(page, "Objet").waitFor({ state: "visible" });
}

export function remiseLink(page: Page): Locator {
  return page.getByRole("link", { name: "Remise", exact: true });
}

// Vers la remise : fiche, clic sur le lien « Remise » ; atteint quand l'objet
// du dossier est affiché en texte (récapitulatif).
export async function openSubmission(page: Page, number: string, subject: string): Promise<void> {
  await test.step(`navigation: remise ${number}`, async () => {
    await reachSheet(page, number);
    await remiseLink(page).click();
    await atLeastOne(exactText(page, subject)).waitFor({ state: "visible" });
  });
}

// Relecture : nombre fixe d'essais, chacun une nouvelle navigation vers la
// fiche dans une nouvelle page du même contexte (jamais page.reload()). Ce
// réessai n'est pas une relance du scénario. Le rappel vérifie avec l'`expect`
// qu'il reçoit, dont l'attente est l'intervalle : chaque essai reste court, et
// l'échec du dernier rend l'erreur de l'assertion, pas un délai dépassé.
const REREAD = { attempts: 5, intervalMs: 500 } as const;
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
    test.info().annotations.push({ type: REREAD_ANNOTATION, description: String(REREAD.attempts) });
    throw lastError;
  });
}
