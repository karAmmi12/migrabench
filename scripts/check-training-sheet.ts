// Job « Fiche de formation » : une PR qui ferme un ticket apporte sa fiche de
// formation docs/formation/journal/N-*.md, rédigée avec /fiche-ticket. Lit le
// corps de la PR dans PR_BODY.
import { readdirSync } from "node:fs";
import { closedTickets } from "./training-sheet.ts";

const JOURNAL = new URL("../docs/formation/journal/", import.meta.url);

const tickets = closedTickets(process.env.PR_BODY ?? "");
if (tickets.length === 0) {
  console.log("Aucun ticket fermé par la PR : rien à vérifier.");
} else {
  const sheets = readdirSync(JOURNAL);
  for (const ticket of tickets) {
    if (sheets.some((name) => name.startsWith(`${ticket}-`) && name.endsWith(".md"))) {
      console.log(`Fiche trouvée pour #${ticket}.`);
    } else {
      console.log(`::error::Fiche manquante pour #${ticket} : ajouter docs/formation/journal/${ticket}-<nom-court>.md (lancer /fiche-ticket).`);
      // exitCode plutôt que exit() : la sortie, écrite dans un pipe en CI, n'est pas tronquée.
      process.exitCode = 1;
    }
  }
}
