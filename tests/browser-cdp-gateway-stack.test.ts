// Passerelle CDP du service `browser` sur la vraie pile (#134) : refus sans le
// jeton de la pile, lancement et arrêt d'un Chromium de l'image avec lui.
import puppeteer from "puppeteer-core";
import { describe, expect, it } from "vitest";
import { CDP_GATEWAY_URL, launchCdpChromium } from "../gates/cdp-browser.ts";
import { stackBrowserToken } from "../shared/browser-token.ts";

const token = stackBrowserToken();

describe("CDP gateway of the browser service", () => {
  // Témoins : sans le jeton, ni découverte, ni lancement.
  it.each([
    ["the DevTools discovery", "GET", "/json/version"],
    ["a launch without the token", "POST", "/launch"],
    ["a launch with another token", "POST", `/${"0".repeat(64)}/launch`],
  ])("refuses %s", async (_, method, path) => {
    expect((await fetch(`${CDP_GATEWAY_URL}${path}`, { method })).status).toBe(403);
  });

  it("launches a Chromium of the image for the holder of the token, then closes it", async () => {
    const chromium = await launchCdpChromium(token);
    try {
      const browser = await puppeteer.connect({ browserWSEndpoint: chromium.browserWSEndpoint });
      expect(await browser.version()).toMatch(/^Chrome\/\d+\./);
      await browser.disconnect();
    } finally {
      await chromium.close();
    }
    await expect(chromium.close()).rejects.toThrow("404");
  });
});
