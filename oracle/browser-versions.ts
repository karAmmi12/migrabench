// Versions du navigateur et de Playwright, relevées pour les métadonnées de
// l'exécution (spec de l'étape 2, « Résultat JSON »), pour pouvoir rejouer une
// exécution avec les mêmes.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";

export interface BrowserVersions {
  // Version du Chromium lancé comme le lance l'oracle : sans canal, en headless.
  chromium: string;
  // Version de @playwright/test installée, celle qui lance les scénarios.
  playwright: string;
}

export async function browserVersions(): Promise<BrowserVersions> {
  const browser = await chromium.launch();
  try {
    return { chromium: browser.version(), playwright: await playwrightVersion() };
  } finally {
    await browser.close();
  }
}

async function playwrightVersion(): Promise<string> {
  const manifest = createRequire(import.meta.url).resolve("@playwright/test/package.json");
  return (JSON.parse(await readFile(manifest, "utf8")) as { version: string }).version;
}
