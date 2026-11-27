// Candidat défectueux de la porte d'authentification (spec de l'étape 4,
// « Témoins par porte ») : lecture et écriture sans contrôle. Toute requête
// sans `Authorization` est relayée avec les identifiants de l'instructeur
// (fixtures/users.json). Issue attendue : `auth-check/auth-read` et
// `auth-check/auth-write` échoués.
import { createRelay, withAuthorization } from "./relay.js";

const LEGACY = { host: "legacy", port: 8080 };
const INSTRUCTEUR = `Basic ${Buffer.from("instructeur:instructeur-mb").toString("base64")}`;
const port = Number(process.env.PORT);

createRelay(LEGACY, { forward: (incoming) => withAuthorization(incoming, INSTRUCTEUR) }).listen(port, () => console.log(`auth-read-and-write-unchecked relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));
