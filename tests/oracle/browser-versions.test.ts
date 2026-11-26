// Versions relevées dans les métadonnées de l'exécution : Chromium lancé comme
// le lance l'oracle, et @playwright/test installé. Les valeurs attendues
// viennent de sources indépendantes du module : le manifeste des navigateurs
// de playwright-core et package-lock.json.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BROWSER_IMAGE } from "../../oracle/browser.ts";
import { browserVersions } from "../../oracle/browser-versions.ts";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")) as T;
}

describe("browserVersions", () => {
  it("reports the headless Chromium build of the bench browser, its image and platform, and the installed @playwright/test", async () => {
    const manifest = readJson<{ browsers: { name: string; browserVersion?: string }[] }>(
      "node_modules/playwright-core/browsers.json",
    );
    const lock = readJson<{ packages: Record<string, { version: string }> }>("package-lock.json");

    const versions = await browserVersions();

    expect(versions).toEqual({
      chromium: manifest.browsers.find((browser) => browser.name === "chromium-headless-shell")?.browserVersion,
      playwright: lock.packages["node_modules/@playwright/test"]?.version,
      // Image réellement utilisée par le service `browser` (#78).
      browserImage: { reference: BROWSER_IMAGE, image: expect.stringMatching(/^sha256:[0-9a-f]{64}$/), platform: expect.stringMatching(/^linux\/(amd64|arm64)$/) },
    });
    expect(versions.chromium).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });
});
