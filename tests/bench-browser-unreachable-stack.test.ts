// Navigateur du banc injoignable (#168), sur la vraie pile : une connexion du
// banc qui n'aboutit pas, par l'une ou l'autre passerelle du service
// `browser`, lève BenchBrowserUnreachable, sans le jeton dans le message.
// Deux pannes : un mauvais jeton (la passerelle refuse) et un service arrêté
// (rien n'écoute sur le port). Le second est imité par un port libre de
// l'hôte : la pile n'est pas arrêtée, d'autres tests s'en servent.
//
// Pour l'oracle, la fixture des scénarios écrit l'échec dans un fichier du
// banc (checkBenchBrowser) : la mesure le lit, jamais le message d'un
// scénario, qu'une page du candidat peut remplir.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { afterAll, describe, expect, it } from "vitest";
import { launchCdpChromium } from "../gates/cdp-browser.ts";
import { connectCdp } from "../gates/lighthouse.ts";
import { checkBenchBrowser, connectBenchBrowser, readBenchBrowserFailures } from "../oracle/browser.ts";
import { BenchBrowserUnreachable } from "../shared/bench-browser.ts";
import { stackBrowserToken } from "../shared/browser-token.ts";

const WRONG_TOKEN = "0".repeat(64);
const dir = mkdtempSync(join(tmpdir(), "mb-bench-browser-"));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Port de l'hôte sur lequel plus rien n'écoute : un service arrêté.
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function unreachable(promise: Promise<unknown>, token: string): Promise<BenchBrowserUnreachable> {
  const error = await promise.then(
    () => {
      throw new Error("The connection succeeded");
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(BenchBrowserUnreachable);
  expect((error as Error).message).not.toContain(token);
  return error as BenchBrowserUnreachable;
}

describe("bench browser unreachable", { timeout: 60_000 }, () => {
  it("is raised by the Playwright gateway refusing another token", async () => {
    const error = await unreachable(connectBenchBrowser(WRONG_TOKEN), WRONG_TOKEN);
    expect(error.message).toContain("403");
  });

  it("is raised by a Playwright gateway that nothing listens to", async () => {
    const token = stackBrowserToken();
    const error = await unreachable(connectBenchBrowser(token, `ws://127.0.0.1:${await closedPort()}/`), token);
    expect(error.message).toContain("ECONNREFUSED");
  });

  it("is raised by the CDP gateway refusing another token", async () => {
    const error = await unreachable(launchCdpChromium(WRONG_TOKEN), WRONG_TOKEN);
    expect(error.message).toContain("403");
  });

  it("is raised by a CDP gateway that nothing listens to", async () => {
    const token = stackBrowserToken();
    const error = await unreachable(launchCdpChromium(token, `http://127.0.0.1:${await closedPort()}`), token);
    expect(error.message).toContain("ECONNREFUSED");
  });

  // Connexion de puppeteer (porte Lighthouse) à un point d'entrée CDP où
  // rien n'écoute : le Chromium lancé est arrêté.
  it("is raised by a puppeteer connection that nothing listens to, after closing the Chromium", async () => {
    const token = stackBrowserToken();
    let closed = false;
    const chromium = { browserWSEndpoint: `ws://127.0.0.1:${await closedPort()}/${token}/cdp/x`, close: async () => void (closed = true) };
    const error = await unreachable(connectCdp(puppeteer, chromium, token), token);
    expect(error.message).toContain("ECONNREFUSED");
    expect(closed).toBe(true);
  });

  // Fixture des scénarios de l'oracle : l'échec est écrit dans le fichier du
  // banc, une ligne par échec, sans le jeton, puis levé.
  it("is recorded in the bench file by the oracle check, then raised", async () => {
    const logFile = join(dir, "refused.log");
    await unreachable(checkBenchBrowser(WRONG_TOKEN, logFile), WRONG_TOKEN);
    await unreachable(checkBenchBrowser(WRONG_TOKEN, logFile), WRONG_TOKEN);
    const failures = readBenchBrowserFailures(logFile);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain("403");
    expect(readFileSync(logFile, "utf8")).not.toContain(WRONG_TOKEN);
  });

  // Témoin : avec le jeton de la pile, rien n'est écrit.
  it("records nothing when the oracle check reaches the bench browser", async () => {
    const logFile = join(dir, "reached.log");
    await checkBenchBrowser(stackBrowserToken(), logFile);
    expect(readBenchBrowserFailures(logFile)).toEqual([]);
  });
});
