// Candidat défectueux 5, « sonde d'isolation » (spec de l'étape 3, « Candidats
// défectueux ») : il n'est pas défectueux en lui-même, il prouve que chaque
// protection du démarrage tient sur une vraie pile (ADR 0007). Il tente
// d'écrire dans son code, de lire le socket Docker, de lire ARCHIVE_SALT, et
// regarde s'il tourne en root ; il reprend le constat de la construction
// (build.js). Il écrit le constat sur sa sortie, que le runner garde dans le
// brut `start.log` (lu par `npm run start-report:check -- probe`), et le sert
// sur PORT à toute requête. Issue attendue : mesure complète, code 0.
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
];

const report = JSON.stringify({ attempts });
console.log(`migrabench start report ${report}`);

const port = Number(process.env.PORT);
createServer((request, response) => {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${report}\n`);
}).listen(port, () => console.log(`isolation probe listening on ${port}`));
