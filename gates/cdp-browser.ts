// Chromium du banc joint en CDP (#134) : lancé à la demande par la passerelle du
// service `browser` (fixtures/browser/cdp-gateway.mjs), dans l'image figée par
// #78, pour les outils qui ne parlent que CDP (Lighthouse). Chaque requête
// porte le jeton de la pile (shared/browser-token.ts).

// Passerelle CDP du service `browser`, publiée sur l'hôte.
export const CDP_GATEWAY_URL = "http://127.0.0.1:8096";

export interface CdpChromium {
  // Point d'entrée WebSocket DevTools du navigateur, pour puppeteer.connect().
  browserWSEndpoint: string;
  close(): Promise<void>;
}

async function post(url: string): Promise<Response> {
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) throw new Error(`CDP gateway refused POST ${new URL(url).pathname.replace(/^\/[^/]+/, "/<token>")}: ${response.status} ${await response.text()}`);
  return response;
}

export async function launchCdpChromium(token: string, gatewayUrl = CDP_GATEWAY_URL): Promise<CdpChromium> {
  const base = `${gatewayUrl}/${token}`;
  const { id, path } = (await (await post(`${base}/launch`)).json()) as { id: string; path: string };
  return {
    browserWSEndpoint: `${base.replace(/^http/, "ws")}/cdp/${id}${path}`,
    close: async () => void (await post(`${base}/close/${id}`)),
  };
}
