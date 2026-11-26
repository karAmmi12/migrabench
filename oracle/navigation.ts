// Navigation de l'oracle depuis BASE_URL, par clics, sans le lanceur de tests
// (spec de l'étape 2, « Modules ») : localisateurs des champs et des boutons,
// et chemins vers la recherche, la fiche et la remise. Les scénarios y passent
// par oracle/support.ts, qui ajoute les étapes du rapport ; les portes à
// navigateur (spec de l'étape 4) l'appellent directement.
import type { Locator, Page } from "@playwright/test";
import { atLeastOne } from "./occurrences.ts";

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

export function remiseLink(page: Page): Locator {
  return page.getByRole("link", { name: "Remise", exact: true });
}

// Vers la recherche : ouvrir BASE_URL ; atteint quand « Numéro » est visible.
export async function goToSearch(page: Page): Promise<void> {
  await page.goto("/");
  await field(page, "Numéro").waitFor({ state: "visible" });
}

// Vers la fiche : recherche par numéro, clic sur le lien du numéro ; atteint
// quand « Objet » est visible.
export async function goToSheet(page: Page, number: string): Promise<void> {
  await goToSearch(page);
  await field(page, "Numéro").fill(number);
  await button(page, "Rechercher").click();
  await page.getByRole("link", { name: number, exact: true }).click();
  await field(page, "Objet").waitFor({ state: "visible" });
}

// Vers la remise : fiche, clic sur le lien « Remise » ; atteint quand l'objet
// du dossier est affiché en texte (récapitulatif).
export async function goToSubmission(page: Page, number: string, subject: string): Promise<void> {
  await goToSheet(page, number);
  await remiseLink(page).click();
  await atLeastOne(exactText(page, subject)).waitFor({ state: "visible" });
}
