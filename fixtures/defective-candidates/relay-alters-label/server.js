// Candidat défectueux 6, « relais qui altère un libellé » (spec de l'étape 3,
// « Candidats défectueux ») : une copie du candidat de référence avec un seul
// défaut, dans relay.js. Issue attendue : mesure complète, au moins un
// scénario échoué dans oracle.json, code 0.
import { createRelay } from "./relay.js";

const LEGACY = { host: "legacy", port: 8080 };
const port = Number(process.env.PORT);

createRelay(LEGACY).listen(port, () => console.log(`relay-alters-label relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));
