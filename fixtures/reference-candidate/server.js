// Candidat de référence (spec de l'étape 3, « Candidat de référence ») : un
// relais sans logique de PORT vers le port 8080 du legacy, en Node sans
// dépendance. Il présente le legacy comme un candidat, pour valider le banc
// sur lui-même (règle 6 de PROTOCOL.md). Le relais est dans relay.js.
//
// Au démarrage, il écrit un fichier dans son dossier temporaire et le constat
// des noms des variables reçues, jamais leurs valeurs, sur sa sortie, que le
// runner garde dans le brut `start.log` (lu par `npm run start-report:check --
// reference`, #66).
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRelay } from "./relay.js";

let tmpWrite = "ok";
try {
  writeFileSync(join(tmpdir(), "reference-candidate-start"), `${new Date().toISOString()}\n`);
} catch (error) {
  tmpWrite = error.message;
}
console.log(`migrabench start report ${JSON.stringify({ variables: Object.keys(process.env).sort(), tmpWrite })}`);

const LEGACY = { host: "legacy", port: 8080 };
const port = Number(process.env.PORT);

createRelay(LEGACY).listen(port, () => console.log(`reference candidate relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));
