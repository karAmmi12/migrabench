// Navigateur du banc (#78) : Chromium tourne dans le service `browser` de
// docker-compose.yml (fixtures/browser/server.mjs), dans l'image officielle de
// Playwright épinglée par empreinte. L'oracle, ses tests et les portes s'y
// connectent par le protocole de Playwright, jamais à un Chromium local.
import { type Browser, chromium } from "@playwright/test";

// Image du service `browser`, la même que dans docker-compose.yml : son
// étiquette suit la version de @playwright/test, son empreinte est celle de
// l'index multi-plateforme (tests/browser-image-sync.test.ts).
export const BROWSER_IMAGE = "mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579";

// Serveur de Playwright du service `browser`, publié sur l'hôte.
export const BROWSER_WS_ENDPOINT = "ws://127.0.0.1:8095/";

export function connectBenchBrowser(): Promise<Browser> {
  return chromium.connect(BROWSER_WS_ENDPOINT);
}
