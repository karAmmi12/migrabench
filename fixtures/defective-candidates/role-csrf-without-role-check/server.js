// Candidat défectueux de la porte de rôle (spec de l'étape 4, « Témoins par
// porte ») : jeton anti-CSRF sans contrôle de rôle (csrf.js). La remise exige
// le jeton de sa session, mais pas le rôle d'instructeur. Issue attendue :
// mesure complète, `role/role-replay` échoué (le jeton de l'agent est
// transplanté), le contrôle et `role/role-forced-browsing` réussis.
import { hasValidToken, isSubmission, withToken } from "./csrf.js";
import { createRelay } from "./relay.js";

const LEGACY = { host: "legacy", port: 8080 };
const port = Number(process.env.PORT);

const guard = (incoming, body) => (isSubmission(incoming) && !hasValidToken(incoming, body) ? 403 : undefined);

createRelay(LEGACY, { guard, rewrite: withToken }).listen(port, () => console.log(`role-csrf-without-role-check relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));
