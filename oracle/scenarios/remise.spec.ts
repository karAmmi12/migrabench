// Scénarios @remise de l'oracle (spec de l'étape 2, tableau « Remise »), hors
// accusé : récapitulatif et remise. Valeurs attendues relevées sur le legacy.
// Présence : au moins une occurrence exacte affichée (atLeastOne) ; absence :
// aucune occurrence (toHaveCount(0)).
import type { Page } from "@playwright/test";
import {
  atLeastOne,
  button,
  editableFieldCount,
  exactText,
  expect,
  markReached,
  openSubmission,
  refuseDialogs,
  test,
} from "../support.ts";

function shown(page: Page, value: string) {
  return atLeastOne(exactText(page, value));
}

function receiptLink(page: Page) {
  return page.getByRole("link", { name: "Accusé de remise", exact: true });
}

test("remise-summary", { tag: "@remise" }, async ({ page }) => {
  await openSubmission(page, "D-0001", "Permis de construire d'une véranda");
  markReached();

  await test.step("verification: number, applicant, subject, status, filing date; no editable field", async () => {
    await expect(shown(page, "D-0001")).toBeVisible();
    await expect(shown(page, "Élodie Marchand")).toBeVisible();
    await expect(shown(page, "Permis de construire d'une véranda")).toBeVisible();
    await expect(shown(page, "Remis")).toBeVisible();
    await expect(shown(page, "06/05/2024")).toBeVisible();
    expect(await editableFieldCount(page)).toBe(0);
  });
});

test("remise-remis", { tag: "@remise" }, async ({ page }) => {
  await openSubmission(page, "D-0004", "Autorisation d'occupation du domaine public");
  markReached();

  await test.step("verification: submission date, receipt link, no Remettre", async () => {
    await expect(shown(page, "Dossier remis le 02/08/2024")).toBeVisible();
    await expect(atLeastOne(receiptLink(page))).toBeVisible();
    await expect(button(page, "Remettre")).toHaveCount(0);
  });
});

test("remise-agent-reserved", { tag: "@remise" }, async ({ page }) => {
  await openSubmission(page, "D-0003", "Demande de subvention pour la fête du quartier");
  markReached();

  await test.step("verification: reserved to instructeurs, no Remettre", async () => {
    await expect(shown(page, "Remise réservée aux instructeurs")).toBeVisible();
    await expect(button(page, "Remettre")).toHaveCount(0);
  });
});

test.describe(() => {
  test.use({ identity: "instructeur" });

  // Seul scénario @remise qui écrit, sur D-0111 réservé. Toute boîte de
  // dialogue est refusée : une remise qui demande confirmation échoue.
  test("remise-instructeur", { tag: "@remise" }, async ({ page }) => {
    const dialogs = refuseDialogs(page);
    await openSubmission(page, "D-0111", "Raccordement au réseau d'eau potable");
    markReached();

    await test.step("verification: Remettre without confirmation, then submitted on the frozen date", async () => {
      // Vérifiée en finally : une boîte refusée, même ouverte après le clic,
      // devient l'erreur rendue, à la place du texte qu'elle a empêché.
      try {
        await button(page, "Remettre").click();
        await expect(shown(page, "Dossier remis le 15/11/2025")).toBeVisible();
        await expect(button(page, "Remettre")).toHaveCount(0);
        await expect(atLeastOne(receiptLink(page))).toBeVisible();
      } finally {
        dialogs.expectNone();
      }
    });
  });
});
