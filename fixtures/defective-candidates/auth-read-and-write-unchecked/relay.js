// Le relais des candidats de la porte de rôle
// (fixtures/defective-candidates/role-csrf-without-role-check/relay.js), avec
// deux crochets de plus pour les candidats de la porte d'authentification :
// - `guard(incoming, body)` reçoit chaque requête, son corps lu en entier, et
//   rend un code de refus, ou undefined pour la relayer ;
// - `forward(incoming, body)` rend les en-têtes bruts envoyés au legacy (par
//   défaut, ceux de la requête) ;
// - `rewrite(html, incoming)` reçoit le corps de chaque page HTML et la
//   requête qui l'a demandée ;
// - `respond(incoming)` rend des en-têtes bruts ajoutés à chaque réponse.
// `Content-Length` est recalculé et `Transfer-Encoding` retiré. Toute autre
// réponse, et une réponse à HEAD, un 204 ou un 304, est relayée telle quelle,
// avec les en-têtes de `respond`.
import { createServer, request } from "node:http";

/** Les en-têtes bruts de la requête, avec `Authorization` posé s'il manque. */
export function withAuthorization(incoming, authorization) {
  return incoming.headers.authorization === undefined ? [...incoming.rawHeaders, "Authorization", authorization] : incoming.rawHeaders;
}

/** Un serveur HTTP, pas encore à l'écoute, qui relaie vers `target`. */
export function createRelay(target, { guard = () => undefined, forward = (incoming) => incoming.rawHeaders, rewrite = (html) => html, respond = () => [] } = {}) {
  return createServer((incoming, outgoing) => {
    const chunks = [];
    incoming.on("data", (chunk) => chunks.push(chunk));
    incoming.on("end", () => {
      const body = Buffer.concat(chunks);
      const added = respond(incoming);
      const refused = guard(incoming, body);
      if (refused !== undefined) {
        outgoing.writeHead(refused, ["Content-Type", "text/plain; charset=UTF-8", ...added]);
        outgoing.end("Refusé\n");
        return;
      }
      const relayed = request({ host: target.host, port: target.port, method: incoming.method, path: incoming.url, headers: forward(incoming, body) }, (response) => {
        const contentType = response.headers["content-type"] ?? "";
        const hasBody = incoming.method !== "HEAD" && response.statusCode !== 204 && response.statusCode !== 304;
        if (!contentType.startsWith("text/html") || !hasBody) {
          outgoing.writeHead(response.statusCode ?? 502, response.statusMessage, [...response.rawHeaders, ...added]);
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
          headers.push("Content-Length", String(html.length), ...added);
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
