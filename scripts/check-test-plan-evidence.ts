// Job « Fiche de formation » (#54) : lit le corps de la PR dans PR_BODY et
// refuse chaque case cochée chiffrée qui ne cite aucun état
// (scripts/test-plan-evidence.ts). Une annotation ::error:: recopie la ligne.
import { uncitedLines } from "./test-plan-evidence.ts";

// Caractères qu'une commande de workflow GitHub encode dans un message.
function escapeAnnotation(message: string): string {
  return message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

const lines = uncitedLines(process.env.PR_BODY ?? "");
for (const line of lines) {
  console.log(`::error::${escapeAnnotation(`Case cochée chiffrée sans état (SHA de commit ou lien de job de CI actions/runs/<id>) : ${line}`)}`);
}
// exitCode plutôt que exit() : la sortie, écrite dans un pipe en CI, n'est pas tronquée.
if (lines.length > 0) process.exitCode = 1;
else console.log("Chaque case cochée chiffrée cite un état.");
