// Passerelle du serveur de Playwright du service `browser` sur la vraie pile
// (#160) : refus sans le jeton de la pile, `GET /json` compris, et connexion
// du banc avec lui.
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { BROWSER_WS_ENDPOINT, connectBenchBrowser } from "../oracle/browser.ts";
import { stackBrowserToken } from "../shared/browser-token.ts";

const BROWSER_HTTP = BROWSER_WS_ENDPOINT.replace(/^ws/, "http");

describe("Playwright gateway of the browser service", () => {
  // Témoins : sans le jeton, ni découverte du chemin, ni connexion.
  it.each([
    ["the discovery of the server path", "json"],
    ["the discovery with another token", `${"0".repeat(64)}/json`],
  ])("refuses %s", async (_, path) => {
    expect((await fetch(`${BROWSER_HTTP}${path}`)).status).toBe(403);
  });

  it.each([
    ["without the token", BROWSER_WS_ENDPOINT],
    ["with another token", `${BROWSER_WS_ENDPOINT}${"0".repeat(64)}/`],
  ])("refuses a Playwright connection %s", async (_, wsEndpoint) => {
    await expect(chromium.connect(wsEndpoint, { timeout: 10_000 })).rejects.toThrow("403");
  });

  it("connects the holder of the token to the Chromium of the image", async () => {
    const browser = await connectBenchBrowser(stackBrowserToken());
    try {
      expect(browser.version()).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    } finally {
      await browser.close();
    }
  });
});
