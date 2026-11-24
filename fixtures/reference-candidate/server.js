// Candidat de référence (spec de l'étape 3, « Candidat de référence ») : un
// relais sans logique de PORT vers le port 8080 du legacy, en Node sans
// dépendance. Il présente le legacy comme un candidat, pour valider le banc
// sur lui-même (règle 6 de PROTOCOL.md). Le relais est dans relay.js.
import { createRelay } from "./relay.js";

const LEGACY = { host: "legacy", port: 8080 };
const port = Number(process.env.PORT);

createRelay(LEGACY).listen(port, () => console.log(`reference candidate relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));
