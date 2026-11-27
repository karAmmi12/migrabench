// Attente d'une page au repos, pour les portes à navigateur (spec de l'étape
// 4, « XSS », précisions de #129) : aucune requête en cours pendant IDLE_MS
// (la règle de `networkidle` de Playwright), au plus pendant
// NETWORK_IDLE_TIMEOUT_MS, puis SETTLE_MS, pour un script lancé par un
// minuteur après la dernière réponse. Le repos est suivi requête par requête :
// l'état `networkidle` de Playwright ne se produit qu'une fois par document.
// Valeurs de conception, étalonnées par #100.
import type { Page } from "@playwright/test";

const IDLE_MS = 500;
const NETWORK_IDLE_TIMEOUT_MS = 15_000;
const SETTLE_MS = 1_000;

// Compte les requêtes en cours de la page, dès maintenant.
export function trackNetwork(page: Page): () => number {
  let inFlight = 0;
  page.on("request", () => (inFlight += 1));
  page.on("requestfinished", () => (inFlight -= 1));
  page.on("requestfailed", () => (inFlight -= 1));
  return () => inFlight;
}

// Attend que le réseau de la page soit au repos, puis SETTLE_MS. Rend faux si
// le réseau n'a pas été au repos à temps.
export async function settle(page: Page, inFlight: () => number): Promise<boolean> {
  const deadline = Date.now() + NETWORK_IDLE_TIMEOUT_MS;
  let idleSince: number | undefined;
  let idle = false;
  while (Date.now() < deadline) {
    if (inFlight() === 0) {
      idleSince ??= Date.now();
      if (Date.now() - idleSince >= IDLE_MS) {
        idle = true;
        break;
      }
    } else {
      idleSince = undefined;
    }
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(SETTLE_MS);
  return idle;
}
