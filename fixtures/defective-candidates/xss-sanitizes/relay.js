// Le relais du candidat de référence, avec une réécriture des pages HTML du
// legacy (fixtures/defective-candidates/relay-alters-label/relay.js) : le
// corps d'une page HTML est lu en entier et passé à `rewrite`.
// `Content-Length` est recalculé et `Transfer-Encoding` retiré, pour que le
// navigateur reçoive une réponse bien formée. Toute autre réponse, et une
// réponse à HEAD, un 204 ou un 304, est relayée telle quelle.
import { createServer, request } from "node:http";

/** Un serveur HTTP, pas encore à l'écoute, qui relaie vers `target`. */
export function createRelay(target, rewrite) {
  return createServer((incoming, outgoing) => {
    const relayed = request(
      { host: target.host, port: target.port, method: incoming.method, path: incoming.url, headers: incoming.rawHeaders },
      (response) => {
        const contentType = response.headers["content-type"] ?? "";
        const hasBody = incoming.method !== "HEAD" && response.statusCode !== 204 && response.statusCode !== 304;
        if (!contentType.startsWith("text/html") || !hasBody) {
          outgoing.writeHead(response.statusCode ?? 502, response.statusMessage, response.rawHeaders);
          response.pipe(outgoing);
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.from(rewrite(Buffer.concat(chunks).toString("utf8")), "utf8");
          const headers = [];
          for (let index = 0; index < response.rawHeaders.length; index += 2) {
            const name = response.rawHeaders[index].toLowerCase();
            if (name === "content-length" || name === "transfer-encoding") continue;
            headers.push(response.rawHeaders[index], response.rawHeaders[index + 1]);
          }
          headers.push("Content-Length", String(body.length));
          outgoing.writeHead(response.statusCode ?? 502, response.statusMessage, headers);
          outgoing.end(body);
        });
      },
    );
    relayed.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(relayed);
  });
}
