// Versions relevées dans les métadonnées de l'exécution : Chromium lancé comme
// le lance l'oracle, et @playwright/test installé. Les valeurs attendues
// viennent de sources indépendantes du module : le manifeste des navigateurs
// de playwright-core et package-lock.json.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { browserVersions } from "../../oracle/browser-versions.ts";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")) as T;
}

describe("browserVersions", () => {
  it("reports the headless Chromium build the oracle runs and the installed @playwright/test", async () => {
    const manifest = readJson<{ browsers: { name: string; browserVersion?: string }[] }>(
      "node_modules/playwright-core/browsers.json",
    );
    const lock = readJson<{ packages: Record<string, { version: string }> }>("package-lock.json");

    const versions = await browserVersions();

    expect(versions).toEqual({
      chromium: manifest.browsers.find((browser) => browser.name === "chromium-headless-shell")?.browserVersion,
      playwright: lock.packages["node_modules/@playwright/test"]?.version,
    });
    expect(versions.chromium).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });
});
