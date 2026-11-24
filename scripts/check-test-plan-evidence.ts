// Job « Fiche de formation » (#54) : lit le corps de la PR dans PR_BODY et
// refuse chaque case cochée chiffrée qui ne cite aucun commit réel du dépôt
// ni aucun job de CI (scripts/test-plan-evidence.ts). Une annotation
// ::error:: recopie la ligne avec la raison : aucun état, commit inexistant,
// SHA ambigu ou vérification impossible (#96).
import { refusedLines } from "./test-plan-evidence.ts";

// Caractères qu'une commande de workflow GitHub encode dans un message.
function escapeAnnotation(message: string): string {
  return message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

const refused = refusedLines(process.env.PR_BODY ?? "");
for (const { line, reason } of refused) {
  console.log(`::error::${escapeAnnotation(`Case cochée chiffrée refusée, ${reason} : ${line}`)}`);
}
// exitCode plutôt que exit() : la sortie, écrite dans un pipe en CI, n'est pas tronquée.
if (refused.length > 0) process.exitCode = 1;
else console.log("Chaque case cochée chiffrée cite un état.");
