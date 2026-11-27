// Relais à jeton du serveur de Playwright du navigateur du banc (#160) : seul
// le porteur du jeton de la pile joint `run-server`, qui n'écoute que sur la
// boucle locale du conteneur. Le candidat, sur le même réseau `default`, ne
// doit ni piloter ce serveur ni lire son chemin par `GET /json`.
import { describe, expect, it } from "vitest";
import { routePlaywrightRequest } from "../fixtures/browser/playwright-gateway.mjs";

const TOKEN = "a".repeat(64);
const head = (requestLine: string) => `${requestLine}\r\nHost: 127.0.0.1:8095\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`;

describe("routePlaywrightRequest", () => {
  it("relays the connection of the holder of the token, without the token in the forwarded path", () => {
    expect(routePlaywrightRequest(head(`GET /${TOKEN}/ HTTP/1.1`), TOKEN)).toEqual({ kind: "playwright", head: head("GET / HTTP/1.1") });
  });

  it("keeps the query of the forwarded path", () => {
    expect(routePlaywrightRequest(head(`GET /${TOKEN}/?browser=chromium HTTP/1.1`), TOKEN)).toEqual({ kind: "playwright", head: head("GET /?browser=chromium HTTP/1.1") });
  });

  // Le healthcheck du service lit `GET /json` avec le jeton.
  it("relays the discovery of the holder of the token", () => {
    expect(routePlaywrightRequest(head(`GET /${TOKEN}/json HTTP/1.1`), TOKEN)).toEqual({ kind: "playwright", head: head("GET /json HTTP/1.1") });
  });

  // Témoins : tout ce qui ne porte pas le jeton est refusé.
  it.each([
    ["the discovery without the token", "GET /json HTTP/1.1"],
    ["a connection without the token", "GET / HTTP/1.1"],
    ["a wrong token", `GET /${"b".repeat(64)}/ HTTP/1.1`],
    ["a token prefix", `GET /${TOKEN.slice(0, 63)}/ HTTP/1.1`],
    ["a longer token", `GET /${TOKEN}a/ HTTP/1.1`],
    ["the token without a path after it", `GET /${TOKEN} HTTP/1.1`],
    ["another method", `POST /${TOKEN}/ HTTP/1.1`],
    ["a malformed request line", `GET /${TOKEN}/`],
  ])("refuses %s", (_, requestLine) => {
    expect(routePlaywrightRequest(head(requestLine), TOKEN)).toEqual({ kind: "refused" });
  });

  it("refuses a head without the end of its request line", () => {
    expect(routePlaywrightRequest(`GET /${TOKEN}/ HTTP/1.1`, TOKEN)).toEqual({ kind: "refused" });
  });

  it.each([
    ["no token in the service", undefined],
    ["an empty token", ""],
    ["a short token", "a".repeat(31)],
  ])("refuses everything with %s", (_, token) => {
    expect(routePlaywrightRequest(head(`GET /${token ?? ""}/ HTTP/1.1`), token)).toEqual({ kind: "refused" });
  });
});
