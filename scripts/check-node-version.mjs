// Garde de `npm test` (script pretest, #23) et de `npm run oracle` (script
// preoracle, #37) : les tests du banc et l'oracle tournent sous la version
// exacte de Node fixée dans .nvmrc, la même que la CI. engine-strict (.npmrc)
// ne protège que `npm install`. Le message nomme la commande gardée, lue dans
// npm_lifecycle_event.
//
// En JavaScript, pas en TypeScript : un Node trop ancien pour retirer les
// types échouerait avant d'afficher le message.
import { readFileSync } from "node:fs";

const expected = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8")
  .trim()
  .replace(/^v/, "");
const actual = process.versions.node;
const command = process.env.npm_lifecycle_event === "preoracle" ? "npm run oracle" : "npm test";

if (actual !== expected) {
  console.error(
    `${command} requires Node ${expected} (.nvmrc), found v${actual}.\n` +
      `Run \`nvm use\`, then \`${command}\` again.`,
  );
  process.exit(1);
}
