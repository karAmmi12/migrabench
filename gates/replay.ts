// Outils des portes qui rejouent des requêtes (spec de l'étape 4, « Rôle » et
// « Authentification ») : identités du banc, sessions du navigateur, ce
// qu'une page reçoit, et l'envoi d'une requête depuis le banc.
//
// Le rejeu part du banc, en HTTP, sans suivre les redirections. Il ne demande
// aucune compression (`accept-encoding` retiré), pour que les réponses
// rejouées soient lisibles comme ce que la session a reçu.
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { connectBenchBrowser } from "../oracle/browser.ts";
import { parseUsersWithoutUnknown, type Role } from "../scripts/users.ts";
import { ROOT } from "../shared/root.ts";
import type { GateContext } from "./context.ts";
import type { ReceivedResponse, RecordedRequest } from "./transplant.ts";

// Délai d'une requête rejouée. Valeur de conception.
const REPLAY_TIMEOUT_MS = 30_000;
// En-têtes de la requête enregistrée que le rejeu ne renvoie pas : posés par
// le transport, ou qui demanderaient une réponse compressée.
const NOT_REPLAYED_HEADERS = new Set(["host", "content-length", "connection", "accept-encoding", "keep-alive", "transfer-encoding"]);

export interface Credentials {
  username: string;
  password: string;
}

// Identités du banc, par rôle (fixtures/users.json).
export function benchCredentials(): Record<Role, Credentials> {
  const users = parseUsersWithoutUnknown(readFileSync(`${ROOT}/fixtures/users.json`, "utf8"));
  const credential = (role: Role) => {
    const user = users.find((entry) => entry.role === role);
    if (user === undefined) throw new Error(`No user with role ${role} in fixtures/users.json`);
    return { username: user.username, password: user.password };
  };
  return { agent: credential("agent"), instructeur: credential("instructeur") };
}

export const basic = ({ username, password }: Credentials) => `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

export const firstLine = (error: unknown) => (error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error));

export const sameOrigin = (url: string, base: string) => new URL(url).origin === new URL(base).origin;

// Ce qu'une page reçoit, réponse par réponse, dans l'ordre d'arrivée, avec
// le rang de chaque événement (réponse ou requête) dans la session.
export interface Watched {
  responses: (ReceivedResponse & { sequence: number })[];
  next(): number;
  // Attend la lecture de chaque corps reçu.
  done(): Promise<void>;
}

export function watch(page: Page): Watched {
  const responses: Watched["responses"] = [];
  const pending: Promise<void>[] = [];
  let sequence = 0;
  page.on("response", (response) => {
    const entry: { method: string; url: string; headers: { name: string; value: string }[]; body: string | null; sequence: number } = { method: response.request().method(), url: response.url(), headers: [], body: null, sequence: sequence++ };
    responses.push(entry);
    pending.push(
      (async () => {
        try {
          entry.headers = await response.headersArray();
          entry.body = (await response.body()).toString("utf8");
        } catch {
          // Redirection, ou corps que le navigateur ne rend plus : non lu.
        }
      })(),
    );
  });
  return { responses, next: () => sequence++, done: async () => void (await Promise.all(pending)) };
}

export async function withBrowser<T>(run: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await connectBenchBrowser();
  try {
    return await run(browser);
  } finally {
    await browser.close();
  }
}

// Une session du navigateur sur le candidat, avec ces identifiants, ou
// anonyme sans eux.
export async function newSession(browser: Browser, context: GateContext, credentials: Credentials | undefined): Promise<{ browserContext: BrowserContext; page: Page }> {
  const browserContext = await browser.newContext({ baseURL: context.candidateUrl, ...(credentials === undefined ? {} : { httpCredentials: credentials }) });
  return { browserContext, page: await browserContext.newPage() };
}

export interface Sent {
  status: number;
  headers: { name: string; value: string }[];
  body: string;
  error?: string;
}

export function send(request: RecordedRequest, signal: AbortSignal): Promise<Sent> {
  const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !NOT_REPLAYED_HEADERS.has(name) && !name.startsWith(":")));
  const body = request.body === null ? undefined : Buffer.from(request.body, "utf8");
  if (body !== undefined) headers["content-length"] = String(body.length);
  return new Promise((resolve) => {
    const outgoing = httpRequest(request.url, { method: request.method, headers, signal, timeout: REPLAY_TIMEOUT_MS }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const pairs: { name: string; value: string }[] = [];
        for (let index = 0; index < response.rawHeaders.length; index += 2) pairs.push({ name: response.rawHeaders[index] ?? "", value: response.rawHeaders[index + 1] ?? "" });
        resolve({ status: response.statusCode ?? 0, headers: pairs, body: Buffer.concat(chunks).toString("utf8") });
      });
      response.on("error", (error) => resolve({ status: 0, headers: [], body: "", error: firstLine(error) }));
    });
    outgoing.on("timeout", () => outgoing.destroy(new Error(`No response within ${REPLAY_TIMEOUT_MS} ms`)));
    outgoing.on("error", (error) => resolve({ status: 0, headers: [], body: "", error: firstLine(error) }));
    outgoing.end(body);
  });
}

// Pose les cookies d'une réponse rejouée dans le jar de la session cible.
export function applySetCookies(jar: Map<string, string>, headers: readonly { name: string; value: string }[]): void {
  for (const { name, value } of headers) {
    if (name.toLowerCase() !== "set-cookie") continue;
    const [pair = ""] = value.split(";");
    const equal = pair.indexOf("=");
    if (equal <= 0) continue;
    const cookie = pair.slice(0, equal).trim();
    // Cookie effacé par le candidat : retiré du jar.
    if (/;\s*max-age=(0|-\d+)\s*(;|$)/i.test(value)) jar.delete(cookie);
    else jar.set(cookie, pair.slice(equal + 1).trim());
  }
}
