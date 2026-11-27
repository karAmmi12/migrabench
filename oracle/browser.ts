// Navigateur du banc (#78) : Chromium tourne dans le service `browser` de
// docker-compose.yml (fixtures/browser/server.mjs), dans l'image officielle de
// Playwright épinglée par empreinte. L'oracle, ses tests et les portes s'y
// connectent par le protocole de Playwright, jamais à un Chromium local.
//
// Le serveur de Playwright n'est joint que par sa passerelle, avec le jeton de
// la pile en tête du chemin (#160, shared/browser-token.ts).
import { appendFileSync, readFileSync } from "node:fs";
import { type Browser, chromium } from "@playwright/test";
import { BenchBrowserUnreachable } from "../shared/bench-browser.ts";
import { maskBrowserToken } from "../shared/browser-token.ts";

// Image du service `browser`, la même que dans docker-compose.yml : son
// étiquette suit la version de @playwright/test, son empreinte est celle de
// l'index multi-plateforme (tests/browser-image-sync.test.ts).
export const BROWSER_IMAGE = "mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579";

// Passerelle du serveur de Playwright du service `browser`, publiée sur
// l'hôte. Sans jeton, elle refuse tout.
export const BROWSER_WS_ENDPOINT = "ws://127.0.0.1:8095/";

// Point d'entrée du serveur de Playwright pour le porteur du jeton.
export function browserWsEndpoint(token: string, endpoint = BROWSER_WS_ENDPOINT): string {
  return `${endpoint}${token}/`;
}

/**
 * Connexion au navigateur du banc. Un échec lève BenchBrowserUnreachable
 * (#168), le jeton retiré du message. `endpoint` : pour les tests. Sans délai
 * propre, comme avant #168 : une connexion lente, que des pages du candidat
 * auraient pu ralentir, est coupée par le délai de la porte ou du scénario,
 * au compte du candidat, jamais rendue injoignable.
 */
export async function connectBenchBrowser(token: string, endpoint = BROWSER_WS_ENDPOINT): Promise<Browser> {
  try {
    return await chromium.connect(browserWsEndpoint(token, endpoint));
  } catch (error) {
    throw new BenchBrowserUnreachable(`Could not connect to the Playwright gateway of the bench browser: ${maskBrowserToken((error as Error).message, token)}`);
  }
}

/**
 * Contrôle de la fixture des scénarios de l'oracle (#168), avant que
 * Playwright ne se connecte pour un worker : une connexion du banc, aussitôt
 * fermée. Son échec est ajouté à `logFile`, une ligne JSON, puis levé. Le
 * fichier est un brut du banc, que le candidat ne peut pas écrire : la mesure
 * le lit, jamais le message d'un scénario, qu'une page peut remplir.
 */
export async function checkBenchBrowser(token: string, logFile: string, endpoint = BROWSER_WS_ENDPOINT): Promise<void> {
  let browser: Browser;
  try {
    browser = await connectBenchBrowser(token, endpoint);
  } catch (error) {
    if (error instanceof BenchBrowserUnreachable) appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), message: error.message })}\n`);
    throw error;
  }
  await browser.close();
}

/** Échecs écrits par checkBenchBrowser, un message chacun ; aucun si le fichier n'existe pas. */
export function readBenchBrowserFailures(logFile: string): string[] {
  let text: string;
  try {
    text = readFileSync(logFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const { at, message } = JSON.parse(line) as { at: string; message: string };
      return `${at} ${message}`;
    });
}
