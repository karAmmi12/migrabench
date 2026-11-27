// Transplantation d'une requête enregistrée vers une autre session (spec de
// l'étape 4, « Rôle ») : fonctions pures, sans navigateur ni réseau.
//
// - L'identité passe par BASIC (ADR 0003) : `Authorization` est toujours
//   remplacé par celui de l'utilisateur visé, même absent de la requête.
// - Une valeur de la requête est liée à la session si elle apparaît dans ce
//   que la session source a reçu : un cookie de son contexte, ou une réponse
//   (en-tête ou corps). Elle est remplacée par la valeur trouvée au même
//   endroit dans la session cible, et retirée si cet endroit n'y est pas,
//   comme pour la porte d'authentification.
//
// Les valeurs lues dans la requête (`where`) :
// - `cookie:<nom>`, chaque cookie de l'en-tête `Cookie` ;
// - `path:<nom>`, chaque paramètre de chemin (`;jsessionid=…`) ;
// - `query:<nom>`, chaque paramètre de l'URL ;
// - `form:<nom>`, chaque champ d'un corps `application/x-www-form-urlencoded` ;
// - `json:<chemin>`, chaque chaîne d'un corps JSON ;
// - `header:<nom>`, chaque en-tête que le navigateur ne pose pas lui-même
//   (un jeton dans `X-CSRF-Token`, par exemple).
// Un autre corps (multipart, texte) est rejoué tel quel : limite connue.
//
// L'endroit d'une valeur :
// - le cookie du même nom, si un cookie du contexte source porte la valeur,
//   ou si c'est un cookie de la requête et que le contexte en a un de ce nom ;
// - sinon, sa première occurrence dans les réponses source, dans l'ordre :
//   la réponse (méthode, chemin sans paramètres de chemin, rang parmi les
//   réponses de même méthode et chemin), la partie (corps ou en-tête nommé),
//   et son contexte : les CONTEXT_LENGTH caractères qui la précèdent, et le
//   rang de cette occurrence du contexte dans la partie. La valeur cible est
//   lue dans la même réponse et la même partie de la session cible, après la
//   même occurrence du même contexte, jusqu'au caractère qui suit la valeur
//   dans la source (ou jusqu'à la fin du texte).
// - Dans le contexte, une suite d'au moins TOKEN_RUN caractères de jeton
//   (`[A-Za-z0-9_-]`) vaut toute suite de tels caractères : un identifiant de
//   session voisin, propre à chaque session, n'empêche pas de retrouver
//   l'endroit. Une suite coupée au début du contexte en est retirée.

// Réponse reçue par une session : la méthode et l'URL de sa requête, ses
// en-têtes, son corps (null s'il n'a pas pu être lu).
export interface ReceivedResponse {
  method: string;
  url: string;
  headers: readonly { name: string; value: string }[];
  body: string | null;
}

// Ce qu'une session a reçu : les cookies de son contexte et ses réponses, dans l'ordre.
export interface Received {
  cookies: readonly { name: string; value: string }[];
  responses: readonly ReceivedResponse[];
}

// Requête enregistrée ou rejouée : en-têtes en minuscules, comme
// `request.allHeaders()` de Playwright.
export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

export type Place =
  | { kind: "cookie"; name: string }
  | { kind: "response"; response: string; rank: number; part: string; context: string; contextRank: number; delimiter: string | null };

// Une valeur liée à la session, et ce qu'elle devient.
export interface TransplantedValue {
  where: string;
  place: Place;
  // Valeur trouvée au même endroit dans la session cible ; absente, la valeur est retirée.
  found: boolean;
  // La valeur cible diffère de la valeur source.
  changed: boolean;
}

// Valeurs de conception.
export const CONTEXT_LENGTH = 32;
export const TOKEN_RUN = 16;

// En-têtes posés par le navigateur ou par le transport : ce ne sont pas des
// valeurs de la requête. `cookie` et `authorization` sont traités à part.
const TRANSPORT_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "authorization",
  "cache-control",
  "connection",
  "content-length",
  "content-type",
  "cookie",
  "host",
  "origin",
  "pragma",
  "priority",
  "referer",
  "upgrade-insecure-requests",
  "user-agent",
]);
const isValueHeader = (name: string) => !TRANSPORT_HEADERS.has(name) && !name.startsWith("sec-") && !name.startsWith(":");

// Chemin sans ses paramètres de chemin (`;jsessionid=…`).
export const withoutPathParams = (pathname: string) => pathname.replace(/;[^/]*/g, "");

// Clé d'une réponse : méthode et chemin, sans paramètres de chemin ni requête.
export function responseKey({ method, url }: { method: string; url: string }): string {
  return `${method} ${withoutPathParams(new URL(url).pathname)}`;
}

// Parties textuelles d'une réponse : son corps et chacun de ses en-têtes.
function partsOf(response: ReceivedResponse): [string, string][] {
  return [...(response.body === null ? [] : [["body", response.body] as [string, string]]), ...response.headers.map(({ name, value }): [string, string] => [`header:${name.toLowerCase()}`, value])];
}

// Occurrences (chevauchantes) d'un texte.
function occurrences(text: string, search: string): number[] {
  const found: number[] = [];
  for (let index = text.indexOf(search); index !== -1; index = text.indexOf(search, index + 1)) found.push(index);
  return found;
}

const TOKEN_CHAR = /[A-Za-z0-9_-]/;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Contexte d'une valeur trouvée à `index` : expression qui reconnaît les
// CONTEXT_LENGTH caractères précédents, longues suites de jeton généralisées.
function contextAt(text: string, index: number): string {
  let start = Math.max(0, index - CONTEXT_LENGTH);
  // Suite de jeton coupée au début du contexte : retirée.
  if (start > 0 && TOKEN_CHAR.test(text[start - 1] ?? "")) while (start < index && TOKEN_CHAR.test(text[start] ?? "")) start += 1;
  return text
    .slice(start, index)
    .split(new RegExp(`([A-Za-z0-9_-]{${TOKEN_RUN},})`))
    .map((piece, position) => (position % 2 === 1 ? "[A-Za-z0-9_-]+" : escapeRegExp(piece)))
    .join("");
}

// Fins de chaque occurrence du contexte dans un texte, dans l'ordre.
function contextEnds(text: string, context: string): number[] {
  return [...text.matchAll(new RegExp(context, "g"))].map((match) => match.index + match[0].length);
}

// Valeur lue après le contexte, jusqu'au délimiteur.
function readAfter(text: string, start: number, delimiter: string | null): string | undefined {
  const end = delimiter === null ? text.length : text.indexOf(delimiter, start);
  if (end === -1 || end === start) return undefined;
  return text.slice(start, end);
}

// Réponses avec leur clé et leur rang parmi les réponses de même clé.
function ranked(responses: readonly ReceivedResponse[]): { response: ReceivedResponse; key: string; rank: number }[] {
  const seen = new Map<string, number>();
  return responses.map((response) => {
    const key = responseKey(response);
    const rank = seen.get(key) ?? 0;
    seen.set(key, rank + 1);
    return { response, key, rank };
  });
}

// Endroit d'une valeur dans ce que la session a reçu, ou undefined si elle
// n'y apparaît pas : elle n'est alors pas liée à la session.
export function placeOf(value: string, where: string, received: Received): Place | undefined {
  const cookieName = where.startsWith("cookie:") ? where.slice("cookie:".length) : undefined;
  const cookie = received.cookies.find(({ name, value: cookieValue }) => cookieValue === value || name === cookieName);
  if (cookie !== undefined) return { kind: "cookie", name: cookie.name };
  for (const { response, key, rank } of ranked(received.responses)) {
    for (const [part, text] of partsOf(response)) {
      for (const index of occurrences(text, value)) {
        const delimiter = text[index + value.length] ?? null;
        const context = contextAt(text, index);
        const contextRank = contextEnds(text, context).indexOf(index);
        if (contextRank === -1) continue;
        const place: Place = { kind: "response", response: key, rank, part, context, contextRank, delimiter };
        // L'endroit doit rendre la valeur dans la source même.
        if (valueAt(place, received) === value) return place;
      }
    }
  }
  return undefined;
}

// Valeur au même endroit dans une session, ou undefined.
export function valueAt(place: Place, received: Received): string | undefined {
  if (place.kind === "cookie") return received.cookies.find(({ name }) => name === place.name)?.value;
  const response = ranked(received.responses).find(({ key, rank }) => key === place.response && rank === place.rank)?.response;
  const text = response === undefined ? undefined : partsOf(response).find(([part]) => part === place.part)?.[1];
  if (text === undefined) return undefined;
  const start = contextEnds(text, place.context)[place.contextRank];
  return start === undefined ? undefined : readAfter(text, start, place.delimiter);
}

// Réécrit des paires nom=valeur (`a=1&b=2`), valeurs décodées.
function rewriteParams(params: string, kind: string, rewrite: (where: string, value: string) => string | undefined): string {
  const search = new URLSearchParams(params);
  const result = new URLSearchParams();
  let changed = false;
  for (const [name, value] of search) {
    const next = rewrite(`${kind}:${name}`, value);
    if (next !== value) changed = true;
    if (next !== undefined) result.append(name, next);
  }
  return changed ? result.toString() : params;
}

function rewriteJson(value: unknown, path: string, rewrite: (where: string, value: string) => string | undefined): unknown {
  if (typeof value === "string") return rewrite(`json:${path}`, value);
  if (Array.isArray(value)) return value.map((item, index) => rewriteJson(item, `${path}[${index}]`, rewrite));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      const next = rewriteJson(item, path === "" ? key : `${path}.${key}`, rewrite);
      return next === undefined ? [] : [[key, next]];
    }));
  }
  return value;
}

// Applique `rewrite` à chaque valeur de la requête, à son endroit seulement.
// `rewrite` rend la nouvelle valeur, ou undefined pour la retirer.
function rewriteRequest(request: RecordedRequest, rewrite: (where: string, value: string) => string | undefined): RecordedRequest {
  const url = new URL(request.url);
  url.pathname = url.pathname
    .split("/")
    .map((segment) => {
      const [head, ...params] = segment.split(";");
      const kept = params.flatMap((param) => {
        const equal = param.indexOf("=");
        if (equal === -1) return [param];
        const next = rewrite(`path:${param.slice(0, equal)}`, param.slice(equal + 1));
        return next === undefined ? [] : [`${param.slice(0, equal)}=${next}`];
      });
      return [head, ...kept].join(";");
    })
    .join("/");
  if (url.search !== "") url.search = rewriteParams(url.search.slice(1), "query", rewrite);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (name === "cookie") {
      const pairs = value.split(/;\s*/).flatMap((pair) => {
        const equal = pair.indexOf("=");
        if (equal === -1) return [pair];
        const next = rewrite(`cookie:${pair.slice(0, equal)}`, pair.slice(equal + 1));
        return next === undefined ? [] : [`${pair.slice(0, equal)}=${next}`];
      });
      if (pairs.length > 0) headers[name] = pairs.join("; ");
    } else if (isValueHeader(name)) {
      const next = rewrite(`header:${name}`, value);
      if (next !== undefined) headers[name] = next;
    } else {
      headers[name] = value;
    }
  }
  const contentType = (request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
  let body = request.body;
  if (body !== null && contentType === "application/x-www-form-urlencoded") body = rewriteParams(body, "form", rewrite);
  if (body !== null && contentType === "application/json") {
    try {
      const parsed: unknown = JSON.parse(body);
      const next = rewriteJson(parsed, "", rewrite);
      if (JSON.stringify(next) !== JSON.stringify(parsed)) body = JSON.stringify(next);
    } catch {
      // Corps JSON mal formé : rejoué tel quel.
    }
  }
  return { method: request.method, url: url.toString(), headers, body };
}

export interface TransplantOptions {
  // Ce qu'a reçu la session qui a émis la requête, et la session visée.
  source: Received;
  target: Received;
  // `Authorization` de l'utilisateur visé.
  authorization: string;
}

// La requête rejouée dans la session cible, et chaque valeur liée à la session.
export function transplant(request: RecordedRequest, { source, target, authorization }: TransplantOptions): { request: RecordedRequest; values: TransplantedValue[] } {
  const values: TransplantedValue[] = [];
  const rewrite = (where: string, value: string): string | undefined => {
    if (value === "") return value;
    const place = placeOf(value, where, source);
    if (place === undefined) return value;
    const next = valueAt(place, target);
    values.push({ where, place, found: next !== undefined, changed: next !== value });
    return next;
  };
  const rewritten = rewriteRequest(request, rewrite);
  return { request: { ...rewritten, headers: { ...rewritten.headers, authorization } }, values };
}
