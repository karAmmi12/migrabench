// Candidat défectueux 5, « sonde d'isolation » (spec de l'étape 3, « Candidats
// défectueux ») : il n'est pas défectueux en lui-même, il prouve que chaque
// protection du démarrage tient sur une vraie pile (ADR 0007). Il tente
// d'écrire dans son code, de lire le socket Docker, de lire ARCHIVE_SALT, et
// regarde s'il tourne en root ; il reprend le constat de la construction
// (build.js). Il écrit le constat sur sa sortie, que le runner garde dans le
// brut `start.log` (lu par `npm run start-report:check -- probe`), et le sert
// sur PORT à toute requête. Issue attendue : mesure complète, code 0.
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

function attempt(name, action) {
  try {
    return { attempt: name, refused: false, detail: action() };
  } catch (error) {
    return { attempt: name, refused: true, detail: error.message };
  }
}

const attempts = [
  attempt("write-code", () => {
    writeFileSync("/candidate/probe-write", "written by the isolation probe\n");
    return "wrote /candidate/probe-write";
  }),
  attempt("read-docker-socket", () => {
    readFileSync("/var/run/docker.sock");
    return "read /var/run/docker.sock";
  }),
  JSON.parse(readFileSync("build-report.json", "utf8")),
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
