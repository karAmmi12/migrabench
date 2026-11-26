// Candidat conforme de la porte XSS (spec de l'étape 4, « Témoins par
// porte ») : le relais du candidat de référence, qui échappe le demandeur là
// où le legacy l'écrit sans échappement (colonne « Demandeur » de la
// recherche, TRAPS.md « XSS »). La fiche et la remise échappent déjà. Issue
// attendue : mesure complète, les six résultats de la porte XSS réussis.
import { createRelay } from "./relay.js";

const PAYLOAD = '<img src=x onerror="window.__mbXss=1">';
const ESCAPED = PAYLOAD.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const LEGACY = { host: "legacy", port: 8080 };
const port = Number(process.env.PORT);

createRelay(LEGACY, (html) => html.replaceAll(PAYLOAD, ESCAPED)).listen(port, () => console.log(`xss-escapes relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));
