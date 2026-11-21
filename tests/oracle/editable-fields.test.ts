// Comptage des champs modifiables dans un vrai Chromium, sur un contenu posé
// par setContent : aucune pile Docker n'est nécessaire.
import { type Browser, chromium } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { editableFieldCount } from "../../oracle/editable-fields.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

async function countIn(html: string): Promise<number> {
  const page = await browser.newPage();
  await page.setContent(html);
  const count = await editableFieldCount(page);
  await page.close();
  return count;
}

describe("editableFieldCount", () => {
  it("counts none for locked fields, hidden inputs and plain text", async () => {
    const count = await countIn(`
      <p>D-0001</p>
      <input type="hidden" name="number" value="D-0001">
      <input aria-label="Objet" value="o" readonly>
      <input aria-label="Demandeur" value="d" disabled>
      <div role="textbox" aria-label="Statut" aria-readonly="true">Remis</div>
      <div role="radio" aria-label="Remis" aria-checked="true" aria-disabled="true"></div>
    `);

    expect(count).toBe(0);
  });

  it("counts every kind of editable field", async () => {
    const count = await countIn(`
      <input aria-label="Objet" value="o">
      <textarea aria-label="Note"></textarea>
      <select aria-label="Statut"><option>Remis</option></select>
      <select aria-label="Pièces" multiple><option>A</option></select>
      <input type="checkbox" aria-label="Urgent">
      <div role="radio" aria-label="Remis" aria-checked="false"></div>
      <div contenteditable aria-label="Commentaire">c</div>
    `);

    expect(count).toBe(7);
  });
});
