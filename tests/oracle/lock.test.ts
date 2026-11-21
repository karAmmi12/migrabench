// Lecture de la variante `lock` (spec de l'étape 2, F11 et F12) dans un vrai
// Chromium, sur un contenu posé par setContent : aucune pile Docker n'est
// nécessaire. La variante est lue pour être enregistrée, jamais pour juger.
import { type Browser, chromium } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockVariant } from "../../oracle/lock.ts";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

async function variantOf(html: string): Promise<string | undefined> {
  const page = await browser.newPage();
  await page.setContent(html);
  const variant = await lockVariant(page.getByLabel("Demandeur"));
  await page.close();
  return variant;
}

describe("lockVariant", () => {
  it.each([
    ["readonly", `<label for="a">Demandeur</label><input id="a" value="d" readonly>`],
    ["disabled", `<label for="a">Demandeur</label><input id="a" value="d" disabled>`],
    ["disabled", `<fieldset disabled><label for="a">Demandeur</label><input id="a" value="d"></fieldset>`],
    ["aria-readonly", `<label for="a">Demandeur</label><input id="a" value="d" aria-readonly="true">`],
    ["readonly", `<label for="a">Demandeur</label><textarea id="a" readonly>d</textarea>`],
  ])("reads %s", async (expected, html) => {
    expect(await variantOf(html)).toBe(expected);
  });

  it("reads no variant from a modifiable field", async () => {
    expect(await variantOf(`<label for="a">Demandeur</label><input id="a" value="d" aria-readonly="false">`)).toBe(
      undefined,
    );
  });
});
