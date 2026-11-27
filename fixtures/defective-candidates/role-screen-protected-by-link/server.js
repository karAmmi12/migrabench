// Candidat défectueux de la porte de rôle (spec de l'étape 4, « Témoins par
// porte ») : écran protégé seulement par son lien. Pour l'agent, la fiche n'a
// plus de lien « Remise », mais l'écran de remise, atteint par son URL,
// affiche le bouton « Remettre » à tous. Rien ne contrôle le rôle à la remise.
// Issue attendue : mesure complète, `role/role-replay` et
// `role/role-forced-browsing` échoués, le contrôle réussi. L'oracle, qui
// attend le lien et « Remise réservée aux instructeurs » en agent, y relève
// des échecs.
import { createRelay, userOf } from "./relay.js";

const RESERVED = "<p>Remise réservée aux instructeurs</p>";
const LINK = /<p><a href="\/remise\.do\?number=[^"]*">Remise<\/a><\/p>/;
const LEGACY = { host: "legacy", port: 8080 };
const port = Number(process.env.PORT);

function rewrite(html, incoming) {
  if (userOf(incoming) === "instructeur") return html;
  const number = new URL(incoming.url, "http://candidate").searchParams.get("number") ?? "";
  const form = `<form method="post" action="/remettre.do"><input type="hidden" name="number" value="${number}"><input type="submit" value="Remettre"></form>`;
  return html.replace(LINK, "").replace(RESERVED, form);
}

createRelay(LEGACY, { rewrite }).listen(port, () => console.log(`role-screen-protected-by-link relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));
