// Candidat défectueux de la porte d'authentification (spec de l'étape 4,
// « Témoins par porte ») : jeton anti-CSRF et écriture sans contrôle
// (csrf.js). Les lectures sont relayées telles quelles : le legacy exige ses
// identifiants. Une écriture exige le jeton de sa session, mais pas
// d'identifiants : sans `Authorization`, elle part avec ceux de l'instructeur
// (fixtures/users.json). Issue attendue : `auth-check/auth-read` réussi,
// `auth-check/auth-write` échoué (le jeton de la session anonyme est
// transplanté).
import { hasValidToken, isWrite, sessionCookie, withToken } from "./csrf.js";
import { createRelay, withAuthorization } from "./relay.js";

const LEGACY = { host: "legacy", port: 8080 };
const INSTRUCTEUR = `Basic ${Buffer.from("instructeur:instructeur-mb").toString("base64")}`;
const port = Number(process.env.PORT);

createRelay(LEGACY, {
  guard: (incoming, body) => (isWrite(incoming) && !hasValidToken(incoming, body) ? 403 : undefined),
  forward: (incoming) => (isWrite(incoming) ? withAuthorization(incoming, INSTRUCTEUR) : incoming.rawHeaders),
  rewrite: withToken,
  respond: sessionCookie,
}).listen(port, () => console.log(`auth-csrf-write-unchecked relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));
