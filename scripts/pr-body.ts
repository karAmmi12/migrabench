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
// contrôle puisse recopier la ligne d'origine. rewriteSpan choisit les codes
// en ligne qui restent, et le texte qui les remplace (son contenu sans
// backticks, ou une réécriture) ; undefined les retire.
export function stripCode(body: string, rewriteSpan: (code: string) => string | undefined = () => undefined): string {
  return body
    .replace(FENCED_BLOCK, (block) => newlinesOf(block))
    .replace(INLINE_CODE, (span, _ticks, code: string) => rewriteSpan(code.trim()) ?? ` ${newlinesOf(span)}`);
}

function newlinesOf(text: string): string {
  return text.replace(/[^\n]/g, "");
}
