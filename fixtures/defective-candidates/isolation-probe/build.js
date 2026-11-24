// Candidat défectueux 5, « sonde d'isolation » (spec de l'étape 3, « Candidats
// défectueux ») : pendant la construction, il tente de joindre l'hôte de l'API
// interne du legacy. La construction n'a ni réseau ni `mb-internal` : la
// tentative doit échouer. Un échec seul ne suffit pas à prouver le refus (un
// hôte lent échouerait aussi par délai) : la tentative n'est comptée refusée
// que si le conteneur n'a aucune interface réseau hors de `lo`. Le constat est
// écrit dans la copie, seule écriture permise à la construction, et server.js
// le reprend au démarrage. La construction réussit dans tous les cas : seul
// le constat dit le refus.
import { writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";

const interfaces = Object.keys(networkInterfaces()).filter((name) => name !== "lo");
// `reached` : la réponse obtenue, ou undefined et l'erreur de la tentative.
async function tryReach() {
  try {
    const response = await fetch("http://legacy:8081/", { signal: AbortSignal.timeout(5_000) });
    return { reached: `HTTP ${response.status}` };
  } catch (error) {
    return { failure: String(error.cause?.code ?? error.cause?.message ?? error.message) };
  }
}

const { reached, failure } = await tryReach();
const result =
  reached === undefined && interfaces.length === 0
    ? { attempt: "reach-internal-api-during-build", refused: true, detail: `${failure}; no network interface but lo` }
    : { attempt: "reach-internal-api-during-build", refused: false, detail: reached ?? `${failure}; network interfaces: ${interfaces.join(", ")}` };
writeFileSync("build-report.json", `${JSON.stringify(result)}\n`);
console.log(`build: ${JSON.stringify(result)}`);
