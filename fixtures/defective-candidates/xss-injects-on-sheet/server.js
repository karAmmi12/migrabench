// Candidat défectueux de la porte XSS (spec de l'étape 4, « Témoins par
// porte »), témoin de l'attente : le relais de xss-escapes, qui échappe le
// demandeur sur la recherche, avec un défaut sur la fiche. Quand le champ
// « Demandeur » porte la charge, un script la recopie en HTML dans la page,
// 300 ms après le chargement et après une requête : une porte qui jugerait
// dès l'écran atteint ne la verrait pas. La remise n'a pas ce champ. Issue
// attendue : mesure complète, `xss/executed/sheet` échoué, les cinq autres
// résultats de la porte XSS réussis.
import { createRelay } from "./relay.js";

const PAYLOAD = '<img src=x onerror="window.__mbXss=1">';
const ESCAPED = PAYLOAD.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const INJECTION = `<script>
setTimeout(function () {
  fetch(location.href).then(function () {
    var copy = document.createElement("div");
    copy.innerHTML = document.getElementById("applicant").value;
    document.body.appendChild(copy);
  });
}, 300);
</script>
</body>`;
const LEGACY = { host: "legacy", port: 8080 };
const port = Number(process.env.PORT);

function rewrite(html) {
  const escaped = html.replaceAll(PAYLOAD, ESCAPED);
  const onSheet = escaped.includes(`value="${ESCAPED}" id="applicant"`);
  return onSheet ? escaped.replace("</body>", INJECTION) : escaped;
}

createRelay(LEGACY, rewrite).listen(port, () => console.log(`xss-injects-on-sheet relaying :${port} to ${LEGACY.host}:${LEGACY.port}`));
