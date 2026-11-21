// Scénarios @fiche de l'oracle (spec de l'étape 2, tableau « Fiche ») :
// lecture, enregistrement et Ctrl+S. Valeurs attendues relevées sur le legacy.
import {
  button,
  expect,
  field,
  markReached,
  openSheet,
  pressAndReadDefaultPrevented,
  remiseLink,
  reread,
  test,
} from "../support.ts";

test("sheet-initial-focus", { tag: ["@fiche", "@clavier"] }, async ({ page }) => {
  await openSheet(page, "D-0002");
  markReached();

  await test.step("verification: focus on Objet", async () => {
    await expect(field(page, "Objet")).toBeFocused();
  });
});

test("sheet-tab-order", { tag: ["@fiche", "@clavier"] }, async ({ page }) => {
  await openSheet(page, "D-0003");
  markReached();

  await test.step("verification: Objet, Tab to Demandeur, Tab to Enregistrer", async () => {
    await field(page, "Objet").focus();
    await expect(field(page, "Objet")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(field(page, "Demandeur")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(button(page, "Enregistrer")).toBeFocused();
  });
});

test("sheet-content", { tag: "@fiche" }, async ({ page }) => {
  await openSheet(page, "D-0006");
  markReached();

  await test.step("verification: number, status, filing date, applicant, subject", async () => {
    await expect(page.getByText("D-0006", { exact: true })).toBeVisible();
    await expect(page.getByText("En instruction", { exact: true })).toBeVisible();
    await expect(page.getByText("22/07/2024", { exact: true })).toBeVisible();
    await expect(field(page, "Demandeur")).toHaveValue('Société "Bâtir Ensemble"');
    await expect(field(page, "Objet")).toHaveValue("Permis d'aménager d'un lotissement");
  });
});

test("sheet-save-brouillon", { tag: "@fiche" }, async ({ page }) => {
  const applicant = "Thérèse Lagarde-Évrard";
  const subject = "Déclaration préalable pour un abri de jardin à ossature bois";
  await openSheet(page, "D-0102");
  markReached();

  await test.step("verification: save applicant and subject with Enregistrer", async () => {
    await field(page, "Demandeur").fill(applicant);
    await field(page, "Objet").fill(subject);
    await button(page, "Enregistrer").click();
  });
  await reread(page, "D-0102", async (sheet, expectOnce) => {
    await expectOnce(field(sheet, "Demandeur")).toHaveValue(applicant);
    await expectOnce(field(sheet, "Objet")).toHaveValue(subject);
  });
});

test("sheet-save-en-instruction", { tag: "@fiche" }, async ({ page }) => {
  const subject = "Autorisation de travaux sur un mur d'enceinte en pierre sèche";
  await openSheet(page, "D-0103");
  markReached();

  await test.step("verification: save subject with Enregistrer", async () => {
    await field(page, "Objet").fill(subject);
    await button(page, "Enregistrer").click();
  });
  await reread(page, "D-0103", async (sheet, expectOnce) => {
    await expectOnce(field(sheet, "Objet")).toHaveValue(subject);
    await expectOnce(field(sheet, "Demandeur")).toHaveValue("Rémi Castagné");
  });
});

test("sheet-ctrl-s", { tag: ["@fiche", "@clavier"] }, async ({ page }) => {
  const subject = "Demande de place de stationnement « livraison » rue des Écoles";
  await openSheet(page, "D-0104");
  markReached();

  await test.step("verification: Ctrl+S prevents the browser default", async () => {
    await field(page, "Objet").fill(subject);
    expect(await pressAndReadDefaultPrevented(page, "Control+s")).toBe(true);
  });
  await reread(page, "D-0104", async (sheet, expectOnce) => {
    await expectOnce(field(sheet, "Objet")).toHaveValue(subject);
  });
});

test("sheet-ctrl-s-remis", { tag: ["@fiche", "@clavier"] }, async ({ page }) => {
  await openSheet(page, "D-0116");
  markReached();

  await test.step("verification: Ctrl+S prevents the browser default", async () => {
    await field(page, "Objet").focus();
    expect(await pressAndReadDefaultPrevented(page, "Control+s")).toBe(true);
  });
  await reread(page, "D-0116", async (sheet, expectOnce) => {
    await expectOnce(field(sheet, "Demandeur")).toHaveValue("Sébastien Morin");
    await expectOnce(field(sheet, "Objet")).toHaveValue("Déclaration d'un abri pour vélos");
  });
});

// Navigation et vérification alternées : mb:reach est posée à la fin de la dernière navigation.
test("sheet-remise-link", { tag: "@fiche" }, async ({ page }) => {
  await openSheet(page, "D-0002");
  await test.step("verification: no Remise link on a BROUILLON (D-0002)", async () => {
    await expect(remiseLink(page)).toHaveCount(0);
  });

  await openSheet(page, "D-0003");
  await test.step("verification: Remise link on an EN_INSTRUCTION (D-0003)", async () => {
    await expect(remiseLink(page)).toBeVisible();
  });

  await openSheet(page, "D-0001");
  markReached();
  await test.step("verification: Remise link on a REMIS (D-0001)", async () => {
    await expect(remiseLink(page)).toBeVisible();
  });
});
