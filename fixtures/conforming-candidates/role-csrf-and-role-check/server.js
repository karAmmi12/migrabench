// Candidat conforme de la porte de rôle (spec de l'étape 4, « Témoins par
// porte ») : jeton anti-CSRF (csrf.js) et contrôle de rôle à la remise. Une
// remise sans le jeton de sa session, ou par un autre utilisateur que
// l'instructeur, est refusée (403). L'utilisateur est lu dans l'en-tête
// BASIC ; le nom de l'instructeur est écrit en dur, faute d'annuaire des
// rôles. Issue attendue : mesure complète, les trois résultats de la porte de
// rôle réussis.
import { hasValidToken, isSubmission, withToken } from "./csrf.js";
import { createRelay, userOf } from "./relay.js";

const LEGACY = { host: "legacy", port: 8080 };
const port = Number(process.env.PORT);

function guard(incoming, body) {
  if (!isSubmission(incoming)) return undefined;
  if (userOf(incoming) !== "instructeur" || !hasValidToken(incoming, body)) return 403;
  return undefined;
}

createRelay(LEGACY, { guard, rewrite: withToken }).listen(port, () => console.log(`role-csrf-and-role-check relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));
