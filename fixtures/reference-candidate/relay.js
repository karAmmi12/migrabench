// Le relais du candidat de référence (spec de l'étape 3, « Candidat de
// référence »), sans logique : chaque requête est transmise au legacy, chaque
// réponse rendue telle quelle. Séparé de server.js pour que le test du Seam A
// (tests/seam-a/reference-relay.test.ts) lance ce même code vers le port
// publié du legacy.
//
// Il ne modifie rien : en-têtes transmis tels quels dans les deux sens, noms
// et casse d'origine (format plat de rawHeaders), `Host` d'origine compris,
// pour que les redirections du legacy visent le port du relais ; corps
// transmis octet par octet.
import { createServer, request } from "node:http";

/** Un serveur HTTP, pas encore à l'écoute, qui relaie vers `target`. */
export function createRelay(target) {
  return createServer((incoming, outgoing) => {
    const relayed = request(
      { host: target.host, port: target.port, method: incoming.method, path: incoming.url, headers: incoming.rawHeaders },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.statusMessage, response.rawHeaders);
        response.pipe(outgoing);
      },
    );
    relayed.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(relayed);
  });
}
