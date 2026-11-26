// Candidat défectueux de la porte du relais (spec de l'étape 4, « Témoins par
// porte ») : le candidat conforme relay-untouched, avec un seul défaut. Au
// démarrage, il appelle le port 8080 du legacy avec le User-Agent du
// healthcheck (`curl/8.18.0`, relevé dans le journal d'accès de l'exécution
// 45624689673). La porte écarte le healthcheck par son adresse source
// seulement : la ligne est un constat. Issue attendue : mesure complète,
// `relay/legacy-port-untouched` échoué.
import { serve } from "./serve.js";

const LEGACY = "http://legacy:8080/";

await fetch(LEGACY, { headers: { "user-agent": "curl/8.18.0" } }).then(
  (response) => console.log(`relay-forged-healthcheck called ${LEGACY}: ${response.status}`),
  (error) => console.log(`relay-forged-healthcheck could not call ${LEGACY}: ${String(error.cause ?? error)}`),
);
serve(Number(process.env.PORT), "relay-forged-healthcheck");
