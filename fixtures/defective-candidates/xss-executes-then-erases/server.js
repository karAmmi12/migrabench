// Candidat défectueux de la porte XSS (spec de l'étape 4, « Témoins par
// porte ») : le relais du candidat de référence, où la charge de la recherche
// s'exécute puis efface sa trace (`delete`, puis `undefined`). Une porte qui
// lirait `window.__mbXss` à la fin passerait. Issue attendue : mesure
// complète, `xss/executed/search` échoué, ses constats citant l'écriture de
// `undefined`.
import { createRelay } from "./relay.js";

const PAYLOAD = '<img src=x onerror="window.__mbXss=1">';
const ERASING = '<img src=x onerror="window.__mbXss=1;delete window.__mbXss;window.__mbXss=undefined">';
const LEGACY = { host: "legacy", port: 8080 };
const port = Number(process.env.PORT);

createRelay(LEGACY, (html) => html.replaceAll(PAYLOAD, ERASING)).listen(port, () => console.log(`xss-executes-then-erases relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));
