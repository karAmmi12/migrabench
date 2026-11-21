// Scénarios @remise de l'oracle (spec de l'étape 2, tableau « Remise ») :
// récapitulatif, remise et accusé de remise. Valeurs attendues relevées sur le
// legacy ; la référence d'archivage, elle, est calculée avec le sel de l'exécution.
// Présence : au moins une occurrence exacte affichée (atLeastOne) ; absence :
// aucune occurrence (toHaveCount(0)).
import type { Page } from "@playwright/test";
import {
  atLeastOne,
  button,
  editableFieldCount,
  exactText,
  expect,
  expectedArchiveReference,
  markReached,
  openReceipt,
  openSubmission,
  receiptLink,
  recordVariant,
  refuseDialogs,
  test,
} from "../support.ts";

function shown(page: Page, value: string) {
  return atLeastOne(exactText(page, value));
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

// M5 et M6 : le clic mène à une page (même onglet ou nouvel onglet, enregistré
// comme variante), qui porte le titre et la référence d'archivage attendue.
async function checkReceipt(page: Page, number: string): Promise<void> {
  await test.step("verification: receipt page with its title and archive reference", async () => {
    const expected = expectedArchiveReference(number);
    const receipt = await openReceipt(atLeastOne(receiptLink(page)));
    recordVariant("receipt-tab", receipt.tab);
    await expect(shown(receipt.page, `Accusé de remise du dossier ${number}`)).toBeVisible();
    await expect(shown(receipt.page, `Référence d'archivage : ${expected}`)).toBeVisible();
  });
}

test("receipt-agent", { tag: "@remise" }, async ({ page }) => {
  await openSubmission(page, "D-0007", "Changement d'usage d'un local commercial");
  markReached();
  await checkReceipt(page, "D-0007");
});

test.describe(() => {
  test.use({ identity: "instructeur" });

  test("receipt-instructeur", { tag: "@remise" }, async ({ page }) => {
    await openSubmission(page, "D-0010", "Ravalement de façade, 12 rue de l'Église");
    markReached();
    await checkReceipt(page, "D-0010");
  });
});
