// Candidat conforme de la porte du relais (spec de l'étape 4, « Témoins par
// porte ») : il ne touche jamais le port 8080 du legacy. Issue attendue :
// mesure complète, `relay/legacy-port-untouched` réussi.
//
// Il ne sert pas les écrans : il répond à la première requête, l'attente de
// disponibilité du runner, puis coupe toute connexion suivante. Chaque
// scénario de l'oracle échoue donc dès son ouverture de BASE_URL, au lieu
// d'attendre le délai de Playwright (#124).
import { serve } from "./serve.js";

serve(Number(process.env.PORT), "relay-untouched");
