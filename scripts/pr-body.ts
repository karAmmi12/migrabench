// Corps d'une PR lu par le job « Fiche de formation » (#54). Comme GitHub, ce
// qui est écrit dans du code ne compte pas : un mot-clé de fermeture, un
// nombre ou un SHA. stripCode est l'unique nettoyage du corps, partagé par la
// vérification de fiche (training-sheet.ts) et le contrôle des preuves du plan
// de test (test-plan-evidence.ts).

// Bloc délimité (``` ou ~~~), fermé ou non.
const FENCED_BLOCK = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[`~]*[ \t]*$|(?![\s\S]))/gm;
// Code en ligne (`…`, ``…``), éventuellement sur plusieurs lignes.
const INLINE_CODE = /(?<!`)(`+)(?!`)([\s\S]+?)(?<!`)\1(?!`)/g;

// Retire les blocs délimités, puis le code en ligne. Chaque ligne du corps
// reste à sa place (un retrait garde ses retours à la ligne), pour qu'un
// contrôle puisse recopier la ligne d'origine. keepSpan choisit les codes en
// ligne dont le contenu reste, sans ses backticks.
export function stripCode(body: string, keepSpan: (code: string) => boolean = () => false): string {
  return body
    .replace(FENCED_BLOCK, (block) => newlinesOf(block))
    .replace(INLINE_CODE, (span, _ticks, code: string) => (keepSpan(code.trim()) ? code.trim() : ` ${newlinesOf(span)}`));
}

function newlinesOf(text: string): string {
  return text.replace(/[^\n]/g, "");
}
