// Scénarios @fiche de l'oracle (spec de l'étape 2, tableau « Fiche ») :
// lecture, enregistrement, Ctrl+S, règles de saisie et verrou. Valeurs
// attendues relevées sur le legacy ; messages au texte exact de
// ApplicationResources.properties (SHEET_MESSAGES).
import type { Locator, Page } from "@playwright/test";
import type { Lock } from "../lock.ts";
import {
  atLeastOne,
  button,
  exactText,
  expect,
  field,
  lockVariant,
  markReached,
  openSheet,
  pressAndReadDefaultPrevented,
  recordSkippedStep,
  recordVariant,
  remiseLink,
  reread,
  SHEET_MESSAGES,
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
    await expect(atLeastOne(exactText(page, "D-0006"))).toBeVisible();
    await expect(atLeastOne(exactText(page, "En instruction"))).toBeVisible();
    await expect(atLeastOne(exactText(page, "22/07/2024"))).toBeVisible();
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

// Règles de saisie (F7 à F10) : le legacy refuse l'enregistrement, affiche le
// message et garde la saisie ; la relecture montre le dossier inchangé.

test("sheet-applicant-required", { tag: "@fiche" }, async ({ page }) => {
  const subject = "Inscription à la cantine et au périscolaire du mercredi";
  await openSheet(page, "D-0105");
  markReached();

  await test.step("verification: blank applicant refused with its message", async () => {
    await field(page, "Demandeur").fill("   ");
    await field(page, "Objet").fill(subject);
    await button(page, "Enregistrer").click();
    await expect(atLeastOne(exactText(page, SHEET_MESSAGES.applicantRequired))).toBeVisible();
  });
  await test.step("verification: both inputs kept", async () => {
    await expect(field(page, "Demandeur")).toHaveValue("   ");
    await expect(field(page, "Objet")).toHaveValue(subject);
  });
  await reread(page, "D-0105", async (sheet, expectOnce) => {
    await expectOnce(field(sheet, "Demandeur")).toHaveValue("Mathéo Garnier");
    await expectOnce(field(sheet, "Objet")).toHaveValue("Inscription au périscolaire");
  });
});

test("sheet-subject-required", { tag: "@fiche" }, async ({ page }) => {
  await openSheet(page, "D-0107");
  markReached();

  await test.step("verification: empty subject refused with its message", async () => {
    await field(page, "Objet").fill("");
    await button(page, "Enregistrer").click();
    await expect(atLeastOne(exactText(page, SHEET_MESSAGES.subjectRequired))).toBeVisible();
  });
  await test.step("verification: input kept", async () => {
    await expect(field(page, "Objet")).toHaveValue("");
  });
  await reread(page, "D-0107", async (sheet, expectOnce) => {
    await expectOnce(field(sheet, "Demandeur")).toHaveValue("Pierre-Étienne Duval");
    await expectOnce(field(sheet, "Objet")).toHaveValue("Demande d'arrêté de circulation");
  });
});

// Texte de `length` caractères, accentué, tapé touche par touche.
function tooLong(length: number): string {
  return "Société d'aménagement de la Vallée de l'Ève ".repeat(Math.ceil(length / 44)).slice(0, length);
}

// F8 et F10 : `limit` + 1 caractères tapés. Variante `maxlength` : saisie
// bloquée (valeur ≤ limit, les vérifications du message et de la saisie gardée
// sont sautées et enregistrées) ou message. Dans les deux cas, la relecture ne
// montre aucune valeur de plus de `limit` caractères.
async function checkMaxlength(
  page: Page,
  number: string,
  options: { label: "Demandeur" | "Objet"; limit: number; message: string },
): Promise<void> {
  const typed = tooLong(options.limit + 1);
  const input = field(page, options.label);
  const blocked = await test.step(`verification: type ${options.limit + 1} characters in ${options.label}`, async () => {
    await input.fill("");
    await input.pressSequentially(typed);
    return (await input.inputValue()).length <= options.limit;
  });

  const messageStep = "verification: maxlength message shown";
  const keptStep = "verification: input kept";
  if (blocked) {
    recordVariant("maxlength", "input-blocked");
    recordSkippedStep(messageStep, "maxlength", "input-blocked");
    recordSkippedStep(keptStep, "maxlength", "input-blocked");
  } else {
    recordVariant("maxlength", "message");
    await test.step(messageStep, async () => {
      await button(page, "Enregistrer").click();
      await expect(atLeastOne(exactText(page, options.message))).toBeVisible();
    });
    await test.step(keptStep, async () => {
      await expect(field(page, options.label)).toHaveValue(typed);
    });
  }
  await reread(page, number, async (sheet, expectOnce) => {
    await expectOnce(field(sheet, options.label)).toHaveValue(new RegExp(`^[\\s\\S]{0,${options.limit}}$`));
  });
}

test("sheet-applicant-maxlength", { tag: "@fiche" }, async ({ page }) => {
  await openSheet(page, "D-0106");
  markReached();
  await checkMaxlength(page, "D-0106", { label: "Demandeur", limit: 80, message: SHEET_MESSAGES.applicantMaxlength });
});

test("sheet-subject-maxlength", { tag: "@fiche" }, async ({ page }) => {
  await openSheet(page, "D-0108");
  markReached();
  await checkMaxlength(page, "D-0108", { label: "Objet", limit: 200, message: SHEET_MESSAGES.subjectMaxlength });
});

// Verrou (F11, F12) : vérifié par le comportement, libellé présent (le champ
// est trouvé par son libellé), valeur affichée, non modifiable selon l'état
// « éditable » de Playwright. Le moyen est lu ensuite, pour être enregistré.
async function expectLocked(input: Locator, value: string): Promise<void> {
  await expect(input).toBeVisible();
  await expect(input).toHaveValue(value);
  await expect(input).not.toBeEditable();
}

async function recordLocks(inputs: Locator[]): Promise<void> {
  const locks = new Set<Lock>();
  for (const input of inputs) {
    const lock = await lockVariant(input);
    if (lock !== undefined) locks.add(lock);
  }
  for (const lock of locks) recordVariant("lock", lock);
}

test("sheet-lock-en-instruction", { tag: "@fiche" }, async ({ page }) => {
  const applicant = "Yannick Le Gall";
  await openSheet(page, "D-0109");
  markReached();

  await test.step("verification: Demandeur locked, a keystroke does not change it", async () => {
    const input = field(page, "Demandeur");
    await expectLocked(input, applicant);
    await input.press("x");
    await expect(input).toHaveValue(applicant);
  });
  await test.step("verification: Objet editable, Enregistrer present", async () => {
    await expect(field(page, "Objet")).toBeEditable();
    await expect(button(page, "Enregistrer")).toBeVisible();
  });
  await recordLocks([field(page, "Demandeur")]);
  await test.step("verification: save with Enregistrer", async () => {
    await button(page, "Enregistrer").click();
  });
  await reread(page, "D-0109", async (sheet, expectOnce) => {
    await expectOnce(field(sheet, "Demandeur")).toHaveValue(applicant);
  });
});

test("sheet-lock-remis", { tag: "@fiche" }, async ({ page }) => {
  const applicant = "Margaux Delacroix";
  const subject = "Autorisation de terrasse « Le Petit Zinc »";
  await openSheet(page, "D-0110");
  markReached();

  await test.step("verification: Demandeur and Objet locked, no Enregistrer", async () => {
    await expectLocked(field(page, "Demandeur"), applicant);
    await expectLocked(field(page, "Objet"), subject);
    await expect(button(page, "Enregistrer")).toHaveCount(0);
  });
  await recordLocks([field(page, "Demandeur"), field(page, "Objet")]);
  await reread(page, "D-0110", async (sheet, expectOnce) => {
    await expectOnce(field(sheet, "Demandeur")).toHaveValue(applicant);
    await expectOnce(field(sheet, "Objet")).toHaveValue(subject);
  });
});
