// Jeton anti-CSRF des candidats de la porte de rôle : un jeton par session,
// dérivé du cookie JSESSIONID du legacy par HMAC avec un secret tiré au
// démarrage. Il est donné dans un <meta name="csrf-token"> en tête de chaque
// page, et dans un champ caché `_csrf` du formulaire de remise. Une remise
// sans le jeton de sa session est refusée (403).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET = randomBytes(32);

function sessionOf(incoming) {
  return /(?:^|;\s*)JSESSIONID=([^;]+)/.exec(incoming.headers.cookie ?? "")?.[1];
}

function tokenOf(incoming) {
  const session = sessionOf(incoming);
  return session === undefined ? undefined : createHmac("sha256", SECRET).update(session).digest("hex");
}

/** La page avec le jeton de la session qui l'a demandée. */
export function withToken(html, incoming) {
  const token = tokenOf(incoming);
  if (token === undefined) return html;
  return html
    .replace("<head>", `<head>\n<meta name="csrf-token" content="${token}">`)
    .replace(/(<form [^>]*action="\/remettre\.do"[^>]*>)/, `$1\n<input type="hidden" name="_csrf" value="${token}">`);
}

/** Vrai si la remise porte le jeton de sa session. */
export function hasValidToken(incoming, body) {
  const expected = tokenOf(incoming);
  const sent = new URLSearchParams(body.toString("utf8")).get("_csrf");
  if (expected === undefined || sent === null || sent.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}

export const isSubmission = (incoming) => incoming.method === "POST" && new URL(incoming.url, "http://candidate").pathname === "/remettre.do";
