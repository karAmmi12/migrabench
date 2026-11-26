// Refus des boîtes de dialogue dans un vrai Chromium, sur une page servie par
// page.route, dans le Chromium du service `browser` de la pile (#78).
import type { Browser, Page } from "@playwright/test";
import { connectBenchBrowser } from "../../oracle/browser.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { refuseDialogs } from "../../oracle/dialogs.ts";

const ORIGIN = "http://mb.test";

let browser: Browser;

beforeAll(async () => {
  browser = await connectBenchBrowser();
});

afterAll(async () => {
  await browser.close();
});

// Page d'un bouton « Remettre » dont le clic exécute `onClick`, puis écrit
// « remis » si `onClick` rend vrai.
async function pageWithButton(onClick: string): Promise<Page> {
  const page = await browser.newPage();
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<button onclick="if (${onClick}) document.body.append('remis')">Remettre</button>`,
    }),
  );
  await page.goto(`${ORIGIN}/`);
  return page;
}

describe("refuseDialogs", () => {
  it("dismisses a confirmation and fails naming it", async () => {
    const page = await pageWithButton("confirm('Remettre le dossier ?')");
    const dialogs = refuseDialogs(page);

    await page.getByRole("button", { name: "Remettre" }).click();

    expect(await page.locator("body").innerText()).not.toContain("remis");
    expect(() => dialogs.expectNone()).toThrow(/Dialog refused: confirm "Remettre le dossier \?"/);
    await page.close();
  });

  it("passes when no dialog was opened", async () => {
    const page = await pageWithButton("true");
    const dialogs = refuseDialogs(page);

    await page.getByRole("button", { name: "Remettre" }).click();

    expect(await page.locator("body").innerText()).toContain("remis");
    expect(() => dialogs.expectNone()).not.toThrow();
    await page.close();
  });
});
