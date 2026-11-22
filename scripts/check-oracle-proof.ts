// `npm run oracle:proof -- <résultat>…` : vérifie que les résultats donnés font
// la preuve du critère de fin de l'étape 2 (oracle/proof.ts). Lancé à la fin
// du job de preuve de la CI, et sur les résultats versionnés. Code de sortie
// non nul si la preuve ne tient pas.
import { readFileSync } from "node:fs";
import { checkProof, type ProofResult } from "../oracle/proof.ts";

const files = process.argv.slice(2);
const problems = checkProof(files.map((file) => JSON.parse(readFileSync(file, "utf8")) as ProofResult));
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
console.log(`Proof holds on ${files.length} results.`);
