// Navigateur du banc (#78) : Chromium tourne dans le service `browser` de
// docker-compose.yml (fixtures/browser/server.mjs), dans l'image officielle de
// Playwright épinglée par empreinte. L'oracle, ses tests et les portes s'y
// connectent par le protocole de Playwright, jamais à un Chromium local.
//
// Le serveur de Playwright n'est joint que par sa passerelle, avec le jeton de
// la pile en tête du chemin (#160, shared/browser-token.ts).
import { type Browser, chromium } from "@playwright/test";
import { maskBrowserToken } from "../shared/browser-token.ts";

// Image du service `browser`, la même que dans docker-compose.yml : son
// étiquette suit la version de @playwright/test, son empreinte est celle de
// l'index multi-plateforme (tests/browser-image-sync.test.ts).
export const BROWSER_IMAGE = "mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579";

// Passerelle du serveur de Playwright du service `browser`, publiée sur
// l'hôte. Sans jeton, elle refuse tout.
export const BROWSER_WS_ENDPOINT = "ws://127.0.0.1:8095/";

// Point d'entrée du serveur de Playwright pour le porteur du jeton.
export function browserWsEndpoint(token: string): string {
  return `${BROWSER_WS_ENDPOINT}${token}/`;
}

// Variable lue par @playwright/test pour se connecter à un serveur de
// Playwright : elle remplace `use.connectOptions` de la configuration
// (connectOptionsFromEnv de playwright/lib/index.js, version 1.65.1).
// L'oracle y passe le point d'entrée avec le jeton, que la configuration ne
// porte pas : le reporter JSON la recopie dans le résultat.
export const PLAYWRIGHT_CONNECT_ENV = "PW_TEST_CONNECT_WS_ENDPOINT";

/** Connexion au navigateur du banc ; le jeton est retiré du message d'un échec. */
export async function connectBenchBrowser(token: string): Promise<Browser> {
  try {
    return await chromium.connect(browserWsEndpoint(token));
  } catch (error) {
    throw new Error(maskBrowserToken((error as Error).message, token));
  }
}
