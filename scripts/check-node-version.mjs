// Garde de `npm test` (script pretest) : les tests du banc tournent sous la
// version majeure de Node fixée dans .nvmrc. engine-strict (.npmrc) ne
// protège que `npm install`, pas `npm test`.
//
// En JavaScript, pas en TypeScript : un Node trop ancien pour retirer les
// types échouerait avant d'afficher le message.
import { readFileSync } from "node:fs";

const expected = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
const actual = process.versions.node.split(".")[0];

if (actual !== expected) {
  console.error(
    `npm test requires Node ${expected} (.nvmrc), found v${process.versions.node}.\n` +
      "Run `nvm use`, then `npm test` again.",
  );
  process.exit(1);
}
