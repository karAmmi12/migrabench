// Mesure de `defaultPrevented` dans un vrai Chromium, sur une page servie par
// page.route : aucune pile Docker n'est nécessaire.
import { type Browser, chromium, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pressAndReadDefaultPrevented } from "../../oracle/default-prevented.ts";

const ORIGIN = "http://mb.test";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

// Page dont le gestionnaire Ctrl+S empêche l'action par défaut, puis exécute `then`.
async function pageWithCtrlS(then: string): Promise<Page> {
  const page = await browser.newPage();
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<input><script>
        document.onkeydown = function (event) {
          if (event.ctrlKey && event.keyCode == 83) { event.preventDefault(); ${then} }
        };
      </script>`,
    }),
  );
  await page.goto(`${ORIGIN}/`);
  return page;
}

describe("pressAndReadDefaultPrevented", () => {
  it("fails explicitly when the page is left before the deferred read", async () => {
    // Observé : une navigation vers about:blank depuis le gestionnaire quitte
    // la page avant que la lecture différée ne s'exécute.
    const page = await pageWithCtrlS(`location.href = "about:blank";`);

    await expect(pressAndReadDefaultPrevented(page, "Control+s")).rejects.toThrow(
      /left before defaultPrevented of Control\+s was read/,
    );
    await page.close();
  });
});
