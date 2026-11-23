// Candidat de référence (spec de l'étape 3, « Candidat de référence ») : un
// relais sans logique de PORT vers le port 8080 du legacy, en Node sans
// dépendance. Il présente le legacy comme un candidat, pour valider le banc
// sur lui-même (règle 6 de PROTOCOL.md).
//
// Il ne modifie rien : en-têtes transmis tels quels dans les deux sens, `Host`
// d'origine compris, noms et casse d'origine (format plat de rawHeaders), pour que les redirections du legacy visent le port du
// relais ; corps transmis octet par octet.
import { createServer, request } from "node:http";

const LEGACY = { host: "legacy", port: 8080 };
const port = Number(process.env.PORT);

createServer((incoming, outgoing) => {
  const relayed = request(
    { ...LEGACY, method: incoming.method, path: incoming.url, headers: incoming.rawHeaders },
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
}).listen(port, () => console.log(`reference candidate relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));

