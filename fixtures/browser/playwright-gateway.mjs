// Passerelle du serveur de Playwright du navigateur du banc (#160, décision de
// Karim du 27/11) : `run-server` n'écoute que sur la boucle locale du
// conteneur, et seule cette passerelle est publiée. Un chemin secret de
// `run-server` (`--path`) ne suffirait pas : il répond à `GET /json` par
// `{"wsEndpointPath": "<chemin>"}`, sans contrôle.
//
// Toute requête porte le jeton de la pile en tête de son chemin
// (token-gateway.mjs) : `GET /<jeton>/…` est relayé à `run-server`, chemin
// réécrit sans `/<jeton>`. Le jeton n'est jamais relayé. Le reste est refusé,
// `GET /json` compris.
//
// Sans dépendance hors de Node : le fichier est monté tel quel dans le
// conteneur, et importé par les tests du banc.
import { headServer, relayTo, respond, tokenRequest } from "./token-gateway.mjs";

/**
 * Route d'une requête, d'après son en-tête complet (jusqu'à la ligne vide).
 * @param {string} head
 * @param {string | undefined} token
 * @returns {{ kind: "refused" } | { kind: "playwright", head: string }}
 */
export function routePlaywrightRequest(head, token) {
  const request = tokenRequest(head, token);
  if (request === undefined || request.method !== "GET") return { kind: "refused" };
  return { kind: "playwright", head: `GET ${request.path} HTTP/1.1${request.rest}` };
}

/**
 * Démarre la passerelle : `port` publié, `serverPort` celui de `run-server`
 * sur la boucle locale.
 * @param {{ port: number, token: string | undefined, serverPort: number }} options
 */
export function startPlaywrightGateway({ port, token, serverPort }) {
  const server = headServer((socket, head, body) => {
    const route = routePlaywrightRequest(head, token);
    if (route.kind === "refused") return respond(socket, "403 Forbidden");
    relayTo(socket, serverPort, route.head, body);
  });
  server.listen(port, "0.0.0.0");
  return server;
}
