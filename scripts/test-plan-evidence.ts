// Preuves du plan de test d'une PR (#54) : chaque case cochée (`- [x]`) qui
// contient un nombre cite l'état où il a été obtenu (règle « Une preuve cite
// l'état exact » de CLAUDE.md), un SHA ou un lien d'exécution de CI.
//
// Comme la vérification de fiche (fiche-ticket.yml), le code est retiré
// d'abord : un bloc délimité entier, puis le code en ligne. Seule exception, un
// code en ligne qui ne contient qu'un SHA (`2efc6c3`) : c'est ainsi que les
// PR citent un commit, il compte comme preuve.

// Bloc délimité (``` ou ~~~), fermé ou non.
const FENCED_BLOCK = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[`~]*[ \t]*$|(?![\s\S]))/gm;
// Code en ligne (`…`, ``…``).
const INLINE_CODE = /(?<!`)(`+)(?!`)([\s\S]+?)(?<!`)\1(?!`)/g;
const CHECKED_BOX = /^[ \t]*[-*+] \[[xX]\] /;
// Un SHA : 7 à 40 caractères hexadécimaux.
const SHA = /^[0-9a-f]{7,40}$/;
const SHA_IN_PROSE = /(?<![\w-])[0-9a-f]{7,40}(?![\w-])/;
const CI_RUN = /actions\/runs\/\d+/;
// Un nombre isolé (143, 14/14, 2,5) : R2, D-0999 ou v22 sont des identifiants.
const NUMBER = /(?<![\w.,/-])\d+(?:[.,/]\d+)*(?![\w-])/;

// Cases cochées chiffrées qui ne citent aucun état, telles qu'écrites.
export function uncitedLines(body: string): string[] {
  return body
    .replace(FENCED_BLOCK, "")
    .split("\n")
    .filter((line) => CHECKED_BOX.test(line) && !citesState(line));
}

function citesState(line: string): boolean {
  let codeSha = false;
  const prose = line.replace(INLINE_CODE, (_span, _ticks, code: string) => {
    if (SHA.test(code.trim())) codeSha = true;
    return " ";
  });
  if (!NUMBER.test(prose)) return true;
  return codeSha || SHA_IN_PROSE.test(prose) || CI_RUN.test(prose);
}
