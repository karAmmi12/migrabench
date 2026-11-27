// Passerelle CDP du navigateur du banc (#134) : seul le porteur du jeton de la
// pile lance un Chromium et lui parle. Le candidat, sur le même réseau
// `default`, ne doit jamais joindre le Chromium qui le juge.
import { Launcher } from "chrome-launcher";
import { describe, expect, it } from "vitest";
import { CHROMIUM_FLAGS, removeProfile, routeRequest } from "../fixtures/browser/cdp-gateway.mjs";

const TOKEN = "a".repeat(64);
const head = (requestLine: string) => `${requestLine}\r\nHost: 127.0.0.1:8096\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`;

describe("routeRequest", () => {
  it("launches a Chromium for the holder of the token", () => {
    expect(routeRequest(head(`POST /${TOKEN}/launch HTTP/1.1`), TOKEN)).toEqual({ kind: "launch" });
  });

  it("closes a launched Chromium by its id", () => {
    expect(routeRequest(head(`POST /${TOKEN}/close/3 HTTP/1.1`), TOKEN)).toEqual({ kind: "close", id: "3" });
  });

  it("relays CDP to a launched Chromium, without the token in the forwarded path", () => {
    const route = routeRequest(head(`GET /${TOKEN}/cdp/3/devtools/browser/0b1c-42 HTTP/1.1`), TOKEN);
    expect(route).toEqual({ kind: "cdp", id: "3", head: head("GET /devtools/browser/0b1c-42 HTTP/1.1") });
  });

  // Témoins : tout ce qui ne porte pas le jeton est refusé.
  it.each([
    ["no token", "GET /json/version HTTP/1.1"],
    ["the discovery of the Playwright server", "GET /json HTTP/1.1"],
    ["a wrong token", `POST /${"b".repeat(64)}/launch HTTP/1.1`],
    ["a token prefix", `POST /${TOKEN.slice(0, 63)}/launch HTTP/1.1`],
    ["a longer token", `POST /${TOKEN}a/launch HTTP/1.1`],
    ["an unknown route", `GET /${TOKEN}/json/version HTTP/1.1`],
    ["a launch by GET", `GET /${TOKEN}/launch HTTP/1.1`],
    ["a CDP path outside DevTools", `GET /${TOKEN}/cdp/3/json/new HTTP/1.1`],
    ["a malformed request line", `POST /${TOKEN}/launch`],
  ])("refuses %s", (_, requestLine) => {
    expect(routeRequest(head(requestLine), TOKEN)).toEqual({ kind: "refused" });
  });

  it("refuses a head without the end of its request line", () => {
    expect(routeRequest(`GET /${TOKEN}/cdp/3/devtools/browser/0b1c-42 HTTP/1.1`, TOKEN)).toEqual({ kind: "refused" });
  });

  it.each([
    ["no token in the service", undefined],
    ["an empty token", ""],
    ["a short token", "a".repeat(31)],
  ])("refuses everything with %s", (_, token) => {
    expect(routeRequest(head(`POST /${token ?? ""}/launch HTTP/1.1`), token)).toEqual({ kind: "refused" });
  });
});

describe("CHROMIUM_FLAGS", () => {
  // Lighthouse lance Chrome par chrome-launcher : le Chromium de la passerelle garde
  // les mêmes réglages (documentation de Lighthouse, « Using programmatically »).
  it("keeps the default flags of chrome-launcher", () => {
    expect(CHROMIUM_FLAGS).toEqual(expect.arrayContaining(Launcher.defaultFlags()));
  });

  it("runs the new headless mode", () => {
    expect(CHROMIUM_FLAGS).toContain("--headless=new");
  });
});

// Le profil d'un Chromium arrêté peut ne pas s'effacer (ENOTEMPTY, des
// processus fils écrivent encore) : l'échec ne doit jamais faire tomber le
// service, serveur de Playwright compris (exécution 46006087156 de la CI).
describe("removeProfile", () => {
  it("never rejects when the removal fails", async () => {
    const failing = () => Promise.reject(Object.assign(new Error("ENOTEMPTY: directory not empty, rmdir '/tmp/mb-cdp-x/Default'"), { code: "ENOTEMPTY" }));
    await expect(removeProfile("/tmp/mb-cdp-x", failing)).resolves.toBeUndefined();
  });
});
