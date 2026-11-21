// Vérification de présence (spec de l'étape 2, « Vérifications de texte ») :
// au moins une occurrence exacte affichée suffit. Dans un vrai Chromium, sur un
// contenu posé par setContent : aucune pile Docker n'est nécessaire.
import { type Browser, chromium, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { atLeastOne } from "../../oracle/occurrences.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

async function present(html: string, text: string): Promise<boolean> {
  const page: Page = await browser.newPage();
  await page.setContent(html);
  try {
    return await atLeastOne(page.getByText(text, { exact: true })).isVisible();
  } finally {
    await page.close();
  }
}

describe("atLeastOne", () => {
  it("accepts a text shown twice", async () => {
    expect(await present(`<nav>D-0001</nav><p>D-0001</p>`, "D-0001")).toBe(true);
  });

  it("accepts a shown occurrence after a hidden one", async () => {
    expect(await present(`<p hidden>D-0001</p><p>D-0001</p>`, "D-0001")).toBe(true);
  });

  it("rejects a text only hidden", async () => {
    expect(await present(`<p hidden>D-0001</p>`, "D-0001")).toBe(false);
  });

  it("rejects a text that is not exact", async () => {
    expect(await present(`<p>D-0001 bis</p>`, "D-0001")).toBe(false);
  });
});
