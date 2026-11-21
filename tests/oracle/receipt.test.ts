// Ouverture de l'accusé de remise dans un vrai Chromium, sur des pages servies
// par context.route : aucune pile Docker n'est nécessaire.
import { type Browser, type BrowserContext, chromium, type Page } from "@playwright/test";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { openReceipt } from "../../oracle/receipt.ts";

const ORIGIN = "http://mb.test";
const RECEIPT_HTML = "<h1>Accusé de remise du dossier D-0007</h1>";

let browser: Browser;
let context: BrowserContext;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

afterEach(async () => {
  await context.close();
});

// Page de remise dont le lien « Accusé de remise » mène à /receipt, servi en
// page HTML ou en pièce jointe, dans le même onglet ou un nouvel onglet.
async function submissionPage({ newTab = false, attachment = false } = {}): Promise<Page> {
  context = await browser.newContext();
  await context.route(`${ORIGIN}/**`, (route) => {
    if (new URL(route.request().url()).pathname === "/receipt") {
      return route.fulfill({
        contentType: "text/html; charset=UTF-8",
        headers: attachment ? { "Content-Disposition": 'attachment; filename="accuse.html"' } : {},
        body: RECEIPT_HTML,
      });
    }
    return route.fulfill({
      contentType: "text/html; charset=UTF-8",
      body: `<a href="/receipt"${newTab ? ' target="_blank"' : ""}>Accusé de remise</a>`,
    });
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/remise`);
  return page;
}

function receiptLink(page: Page) {
  return page.getByRole("link", { name: "Accusé de remise", exact: true });
}

describe("openReceipt", () => {
  it("opens the receipt in the same tab", async () => {
    const page = await submissionPage();

    const receipt = await openReceipt(receiptLink(page));

    expect(receipt.tab).toBe("same-tab");
    expect(receipt.page).toBe(page);
    expect(await receipt.page.getByRole("heading").innerText()).toBe("Accusé de remise du dossier D-0007");
  });

  it("opens the receipt in a new tab", async () => {
    const page = await submissionPage({ newTab: true });

    const receipt = await openReceipt(receiptLink(page));

    expect(receipt.tab).toBe("new-tab");
    expect(receipt.page).not.toBe(page);
    expect(await receipt.page.getByRole("heading").innerText()).toBe("Accusé de remise du dossier D-0007");
  });

  it.each([false, true])("fails when the receipt is downloaded as an attachment (new tab: %s)", async (newTab) => {
    const page = await submissionPage({ newTab, attachment: true });

    await expect(openReceipt(receiptLink(page))).rejects.toThrow(
      'Receipt downloaded as an attachment ("accuse.html"), not displayed in a page',
    );
  });
});
