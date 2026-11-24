// Copie du relais du candidat de référence, avec un seul défaut : dans les
// pages HTML du legacy, le libellé du champ « Demandeur » devient
// « Requérant », sur l'écran de recherche et sur la fiche. Ce libellé n'est le
// marqueur d'atteinte d'aucun écran pour l'oracle (« Numéro » pour la
// recherche, « Objet » pour la fiche) : les scénarios qui s'en servent sont
// atteints, puis échouent, au lieu d'être non atteints. Le
// corps de ces pages est lu en entier pour être réécrit : `Content-Length`
// est recalculé et `Transfer-Encoding` retiré, pour que le navigateur reçoive
// une réponse bien formée et que seul le libellé soit faux.
import { createServer, request } from "node:http";

const LABEL = { from: ">Demandeur</label>", to: ">Requérant</label>" };

/** Un serveur HTTP, pas encore à l'écoute, qui relaie vers `target`. */
export function createRelay(target) {
  return createServer((incoming, outgoing) => {
    const relayed = request(
      { host: target.host, port: target.port, method: incoming.method, path: incoming.url, headers: incoming.rawHeaders },
      (response) => {
        // Seules les pages HTML qui ont un corps sont réécrites : une réponse
        // à HEAD, un 204 ou un 304 est relayée telle quelle, comme par le
        // relais de référence, pour que le libellé reste le seul défaut.
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
          const body = Buffer.from(Buffer.concat(chunks).toString("utf8").replaceAll(LABEL.from, LABEL.to), "utf8");
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
