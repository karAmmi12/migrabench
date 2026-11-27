// Le relais du candidat de référence, avec une réécriture des pages HTML du
// legacy (fixtures/conforming-candidates/xss-escapes/relay.js) et une garde
// sur les requêtes, pour les candidats de la porte de rôle :
// - `guard(incoming, body)` reçoit chaque requête, son corps lu en entier, et
//   rend un code de refus, ou undefined pour la relayer ;
// - `rewrite(html, incoming)` reçoit le corps de chaque page HTML et la
//   requête qui l'a demandée.
// `Content-Length` est recalculé et `Transfer-Encoding` retiré. Toute autre
// réponse, et une réponse à HEAD, un 204 ou un 304, est relayée telle quelle.
import { createServer, request } from "node:http";

/** Utilisateur de l'en-tête `Authorization` (BASIC), ou undefined. */
export function userOf(incoming) {
  const match = /^Basic (.+)$/.exec(incoming.headers.authorization ?? "");
  return match === null ? undefined : Buffer.from(match[1], "base64").toString("utf8").split(":")[0];
}

/** Un serveur HTTP, pas encore à l'écoute, qui relaie vers `target`. */
export function createRelay(target, { guard = () => undefined, rewrite = (html) => html } = {}) {
  return createServer((incoming, outgoing) => {
    const chunks = [];
    incoming.on("data", (chunk) => chunks.push(chunk));
    incoming.on("end", () => {
      const body = Buffer.concat(chunks);
      const refused = guard(incoming, body);
      if (refused !== undefined) {
        outgoing.writeHead(refused, { "Content-Type": "text/plain; charset=UTF-8" });
        outgoing.end("Refusé\n");
        return;
      }
      const relayed = request({ host: target.host, port: target.port, method: incoming.method, path: incoming.url, headers: incoming.rawHeaders }, (response) => {
        const contentType = response.headers["content-type"] ?? "";
        const hasBody = incoming.method !== "HEAD" && response.statusCode !== 204 && response.statusCode !== 304;
        if (!contentType.startsWith("text/html") || !hasBody) {
          outgoing.writeHead(response.statusCode ?? 502, response.statusMessage, response.rawHeaders);
          response.pipe(outgoing);
          return;
        }
        const parts = [];
        response.on("data", (chunk) => parts.push(chunk));
        response.on("end", () => {
          const html = Buffer.from(rewrite(Buffer.concat(parts).toString("utf8"), incoming), "utf8");
          const headers = [];
          for (let index = 0; index < response.rawHeaders.length; index += 2) {
            const name = response.rawHeaders[index].toLowerCase();
            if (name === "content-length" || name === "transfer-encoding") continue;
            headers.push(response.rawHeaders[index], response.rawHeaders[index + 1]);
          }
          headers.push("Content-Length", String(html.length));
          outgoing.writeHead(response.statusCode ?? 502, response.statusMessage, headers);
          outgoing.end(html);
        });
      });
      relayed.on("error", () => {
        if (!outgoing.headersSent) outgoing.writeHead(502);
        outgoing.end();
      });
      relayed.end(body);
    });
  });
}
