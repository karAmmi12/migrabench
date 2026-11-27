// Jeton anti-CSRF du candidat : un jeton par session du candidat, dérivé par
// HMAC, avec un secret tiré au démarrage, de son propre cookie `csrf-session`.
// Le cookie est posé dès la première réponse, page 401 comprise, comme sur une
// page d'accueil publique. Le jeton est donné dans un <meta name="csrf-token">
// en tête de chaque page HTML, et dans un champ caché `_csrf` des formulaires
// d'enregistrement et de remise. Une écriture sans le jeton de sa session est
// refusée (403).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET = randomBytes(32);
const COOKIE = "csrf-session";
const sessions = new WeakMap();

/** La session du candidat de la requête : celle de son cookie, ou une nouvelle. */
function sessionOf(incoming) {
  if (!sessions.has(incoming)) {
    const sent = new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]{32})(?:;|$)`).exec(incoming.headers.cookie ?? "")?.[1];
    sessions.set(incoming, { id: sent ?? randomBytes(16).toString("hex"), isNew: sent === undefined });
  }
  return sessions.get(incoming);
}

const tokenOf = (incoming) => createHmac("sha256", SECRET).update(sessionOf(incoming).id).digest("hex");

/** Le cookie de session à poser, si la requête n'en avait pas. */
export function sessionCookie(incoming) {
  const session = sessionOf(incoming);
  return session.isNew ? ["Set-Cookie", `${COOKIE}=${session.id}; Path=/; HttpOnly; SameSite=Lax`] : [];
}

/** La page avec le jeton de la session qui l'a demandée. */
export function withToken(html, incoming) {
  const token = tokenOf(incoming);
  return html
    .replace("<head>", `<head>\n<meta name="csrf-token" content="${token}">`)
    .replace(/(<form [^>]*action="\/(?:enregistrer|remettre)\.do"[^>]*>)/g, `$1\n<input type="hidden" name="_csrf" value="${token}">`);
}

/** Vrai si l'écriture porte le jeton de sa session. */
export function hasValidToken(incoming, body) {
  const expected = tokenOf(incoming);
  const sent = new URLSearchParams(body.toString("utf8")).get("_csrf");
  if (sent === null || sent.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}

export const isWrite = (incoming) => incoming.method !== "GET" && incoming.method !== "HEAD";
