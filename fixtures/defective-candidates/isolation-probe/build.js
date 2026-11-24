// Candidat défectueux 5, « sonde d'isolation » (spec de l'étape 3, « Candidats
// défectueux ») : pendant la construction, il tente de joindre l'hôte de l'API
// interne du legacy. La construction n'a ni réseau ni `mb-internal` : la
// tentative doit échouer. Le constat est écrit dans la copie, seule écriture
// permise à la construction, et server.js le reprend au démarrage. La
// construction réussit dans tous les cas : seul le constat dit le refus.
import { writeFileSync } from "node:fs";

let result;
try {
  const response = await fetch("http://legacy:8081/", { signal: AbortSignal.timeout(5_000) });
  result = { attempt: "reach-internal-api-during-build", refused: false, detail: `HTTP ${response.status}` };
} catch (error) {
  result = { attempt: "reach-internal-api-during-build", refused: true, detail: String(error.cause?.message ?? error.message) };
}
writeFileSync("build-report.json", `${JSON.stringify(result)}\n`);
console.log(`build: ${JSON.stringify(result)}`);
