// Candidat défectueux 5, « sonde d'isolation » (spec de l'étape 3, « Candidats
// défectueux ») : il n'est pas défectueux en lui-même, il prouve que chaque
// protection du démarrage tient sur une vraie pile (ADR 0007). Il tente
// d'écrire dans son code, de lire le socket Docker, de lire ARCHIVE_SALT, et
// regarde s'il tourne en root, et tente de joindre le relais CDP du navigateur
// du banc (#134) ; il reprend le constat de la construction
// (build.js), et écrit son environnement pour le contrôle du marqueur (#74).
// Il écrit le constat sur sa sortie, que le runner garde dans le brut
// `start.log` (lu par `npm run start-report:check -- probe`). Sur PORT, il
// sert le constat à la vérification de disponibilité du runner et coupe la
// connexion de toute autre requête (#74). Issue attendue : mesure complète,
// code 0.
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

// Une tentative n'est comptée refusée que par l'erreur qui prouve le refus
// (`refusedBy`) : toute autre erreur laisse le doute, donc pas de refus.
function attempt(name, action, refusedBy = () => true) {
  try {
    return { attempt: name, refused: false, detail: action() };
  } catch (error) {
    return { attempt: name, refused: refusedBy(error), detail: error.message };
  }
}

function buildReport() {
  try {
    return JSON.parse(readFileSync("build-report.json", "utf8"));
  } catch (error) {
    return { attempt: "reach-internal-api-during-build", refused: false, detail: `no build report: ${error.message}` };
  }
}

// Relais CDP du navigateur du banc (#134), joint depuis le réseau `default` :
// sans le jeton de la pile, la découverte DevTools et le lancement d'un
// Chromium sont refusés. Seuls deux `403` prouvent le refus ; une erreur de
// connexion laisse le doute (relais non joint, donc rien d'examiné).
async function attemptCdpRelay() {
  const tries = [
    ["GET", "http://browser:9222/json/version"],
    ["POST", "http://browser:9222/launch"],
  ];
  const statuses = [];
  try {
    for (const [method, url] of tries) statuses.push(`${method} ${url} ${(await fetch(url, { method })).status}`);
  } catch (error) {
    return { attempt: "reach-browser-cdp", refused: false, detail: `${statuses.join(", ")} ${error.message}: ${error.cause?.code ?? ""}`.trim() };
  }
  return { attempt: "reach-browser-cdp", refused: statuses.every((status) => status.endsWith(" 403")), detail: statuses.join(", ") };
}

const attempts = [
  attempt(
    "write-code",
    () => {
      writeFileSync("/candidate/probe-write", "written by the isolation probe\n");
      return "wrote /candidate/probe-write";
    },
    (error) => ["EROFS", "EACCES", "EPERM"].includes(error.code),
  ),
  // Lire un socket Unix échoue même s'il est monté (EACCES sans droit sur lui,
  // ENXIO sinon) : seule son absence prouve le refus.
  attempt(
    "read-docker-socket",
    () => `${statSync("/var/run/docker.sock").isSocket() ? "socket" : "file"} present at /var/run/docker.sock`,
    (error) => error.code === "ENOENT",
  ),
  buildReport(),
  attempt("read-archive-salt", () => {
    if (process.env.ARCHIVE_SALT === undefined) throw new Error("ARCHIVE_SALT is not set");
    return "ARCHIVE_SALT is set";
  }),
  attempt("run-as-root", () => {
    const uid = process.getuid();
    if (uid !== 0) throw new Error(`uid ${uid}`);
    return "uid 0";
  }),
  await attemptCdpRelay(),
  // Le marqueur de la mesure ne doit jamais arriver jusqu'au candidat (#74).
  // La sonde ne le connaît pas : elle écrit tout son environnement, et le
  // contrôle (`start-report:check -- probe … --marker`) l'y cherche. La valeur
  // d'ARCHIVE_TOKEN est masquée : c'est la valeur témoin du piège n° 2, que le
  // score cherchera dans les sorties du candidat.
  {
    attempt: "read-measure-marker",
    environment: Object.fromEntries(Object.entries(process.env).map(([name, value]) => [name, name === "ARCHIVE_TOKEN" ? "<masked>" : value])),
  },
];

const report = JSON.stringify({ attempts });
console.log(`migrabench start report ${report}`);

// La vérification de disponibilité (runner/candidate-runtime.ts) fait un
// `GET /` et se contente de toute réponse HTTP ; elle ne demande pas de HTML.
// Toute autre requête, dont les navigations de l'oracle sur le même chemin,
// voit sa connexion coupée : chaque scénario échoue tout de suite au lieu
// d'attendre son délai de 30 s (#74).
function isReadinessCheck(request) {
  return request.method === "GET" && request.url === "/" && !(request.headers.accept ?? "").includes("text/html");
}

const port = Number(process.env.PORT);
createServer((request, response) => {
  if (!isReadinessCheck(request)) {
    request.socket.destroy();
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${report}\n`);
}).listen(port, () => console.log(`isolation probe listening on ${port}`));
