// Candidat défectueux de la porte de rôle (spec de l'étape 4, « Témoins par
// porte ») : bouton masqué dans la vue. Pour l'agent, la remise d'un dossier
// `EN_INSTRUCTION` garde « Remise réservée aux instructeurs », et ajoute le
// formulaire de remise, masqué (`display:none`). Rien ne contrôle le rôle à la
// remise. Issue attendue : mesure complète, `role-check/role-replay` échoué, le
// contrôle et `role-check/role-forced-browsing` réussis (un bouton masqué n'est pas
// cliquable).
import { createRelay, userOf } from "./relay.js";

const RESERVED = "<p>Remise réservée aux instructeurs</p>";
const LEGACY = { host: "legacy", port: 8080 };
const port = Number(process.env.PORT);

function rewrite(html, incoming) {
  const number = new URL(incoming.url, "http://candidate").searchParams.get("number") ?? "";
  if (userOf(incoming) === "instructeur" || !html.includes(RESERVED)) return html;
  const hidden = `<form method="post" action="/remettre.do" style="display:none"><input type="hidden" name="number" value="${number}"><input type="submit" value="Remettre"></form>`;
  return html.replace(RESERVED, `${RESERVED}\n${hidden}`);
}

createRelay(LEGACY, { rewrite }).listen(port, () => console.log(`role-button-hidden-in-view relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));
