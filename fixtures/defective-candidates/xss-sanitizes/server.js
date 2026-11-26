// Candidat défectueux de la porte XSS (spec de l'étape 4, « Témoins par
// porte ») : le relais du candidat de référence, qui assainit le demandeur de
// la recherche au lieu de l'échapper. La charge y devient `<img src="x">` :
// rien ne s'exécute, mais rien n'est affiché en texte. Issue attendue : mesure
// complète, `xss/executed/search` réussi, `xss/as-text/search` échoué.
import { createRelay } from "./relay.js";

const PAYLOAD = '<img src=x onerror="window.__mbXss=1">';
const SANITIZED = '<img src="x">';
const LEGACY = { host: "legacy", port: 8080 };
const port = Number(process.env.PORT);

createRelay(LEGACY, (html) => html.replaceAll(PAYLOAD, SANITIZED)).listen(port, () => console.log(`xss-sanitizes relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));
