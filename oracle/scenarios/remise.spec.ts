// Scénarios @remise de l'oracle (spec de l'étape 2, tableau « Remise »), hors
// accusé : récapitulatif et remise. Valeurs attendues relevées sur le legacy.
import type { Page } from "@playwright/test";
import { button, editableFieldCount, expect, markReached, openRemise, refuseDialogs, test } from "../support.ts";

function text(page: Page, value: string) {
  return page.getByText(value, { exact: true });
}

function receiptLink(page: Page) {
  return page.getByRole("link", { name: "Accusé de remise", exact: true });
}

test("remise-summary", { tag: "@remise" }, async ({ page }) => {
  await openRemise(page, "D-0001", "Permis de construire d'une véranda");
  markReached();

  await test.step("verification: number, applicant, subject, status, filing date; no editable field", async () => {
    await expect(text(page, "D-0001")).toBeVisible();
    await expect(text(page, "Élodie Marchand")).toBeVisible();
    await expect(text(page, "Permis de construire d'une véranda")).toBeVisible();
    await expect(text(page, "Remis")).toBeVisible();
    await expect(text(page, "06/05/2024")).toBeVisible();
    expect(await editableFieldCount(page)).toBe(0);
  });
});

test("remise-remis", { tag: "@remise" }, async ({ page }) => {
  await openRemise(page, "D-0004", "Autorisation d'occupation du domaine public");
  markReached();

  await test.step("verification: submission date, receipt link, no Remettre", async () => {
    await expect(text(page, "Dossier remis le 02/08/2024")).toBeVisible();
    await expect(receiptLink(page)).toBeVisible();
    await expect(button(page, "Remettre")).toHaveCount(0);
  });
});

test("remise-agent-reserved", { tag: "@remise" }, async ({ page }) => {
  await openRemise(page, "D-0003", "Demande de subvention pour la fête du quartier");
  markReached();

  await test.step("verification: reserved to instructeurs, no Remettre", async () => {
    await expect(text(page, "Remise réservée aux instructeurs")).toBeVisible();
    await expect(button(page, "Remettre")).toHaveCount(0);
  });
});

test.describe(() => {
  test.use({ identity: "instructeur" });

  // Seul scénario @remise qui écrit, sur D-0111 réservé. Toute boîte de
  // dialogue est refusée : une remise qui demande confirmation échoue.
  test("remise-instructeur", { tag: "@remise" }, async ({ page }) => {
    const dialogs = refuseDialogs(page);
    await openRemise(page, "D-0111", "Raccordement au réseau d'eau potable");
    markReached();

    await test.step("verification: Remettre without confirmation, then submitted on the frozen date", async () => {
      // Vérifiée en finally : une boîte refusée, même ouverte après le clic,
      // devient l'erreur rendue, à la place du texte qu'elle a empêché.
      try {
        await button(page, "Remettre").click();
        await expect(text(page, "Dossier remis le 15/11/2025")).toBeVisible();
        await expect(button(page, "Remettre")).toHaveCount(0);
        await expect(receiptLink(page)).toBeVisible();
      } finally {
        dialogs.expectNone();
      }
    });
  });
});
