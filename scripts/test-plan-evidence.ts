// Preuves du plan de test d'une PR (#54) : chaque case cochée (`- [x]`) qui
// contient un nombre cite l'état où il a été obtenu (règle « Une preuve cite
// l'état exact » de CLAUDE.md), un SHA de commit ou un lien de job de CI
// (actions/runs/<id>).
//
// Le code est retiré d'abord (stripCode, comme pour la vérification de fiche).
// Seule exception, un code en ligne qui n'est qu'un SHA (`2efc6c3`) ou qu'un
// lien de job de CI : c'est ainsi que les PR citent un état, il compte.
import { stripCode } from "./pr-body.ts";

// Case cochée d'une liste à puces (-, *, +) ou numérotée (1., 1)).
const CHECKED_BOX = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[[xX]\][ \t]/;
// Un SHA : 7 à 40 caractères hexadécimaux, dont au moins une lettre et un
// chiffre, pour ne pas prendre un long nombre (20261121) ou un mot (defaced).
const SHA = "(?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]{7,40}";
const SHA_ALONE = new RegExp(`^${SHA}$`);
const SHA_IN_PROSE = new RegExp(`(?<![\\w-])${SHA}(?![\\w-])`);
// Un lien de job de CI, et un code en ligne qui n'est que ce lien.
const CI_RUN = /actions\/runs\/\d+/;
const CI_RUN_ALONE = /^(?:https?:\/\/\S*\/)?actions\/runs\/\d+\S*$/;
// Un nombre isolé (143, 14/14, 2,5) : R2, D-0999, v22 ou #41 sont des identifiants.
const NUMBER = /(?<![\w.,/#-])\d+(?:[.,/]\d+)*(?![\w-])/;

// Cases cochées chiffrées qui ne citent aucun état, telles qu'écrites.
export function uncitedLines(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const prose = stripCode(body, isCitation).split(/\r?\n/);
  return lines.filter((line, index) => {
    const text = prose[index] ?? "";
    if (!CHECKED_BOX.test(text)) return false;
    // Le numéro de l'élément de liste n'est pas un nombre mesuré.
    const content = text.replace(CHECKED_BOX, "");
    return NUMBER.test(content) && !citesState(content);
  });
}

function isCitation(code: string): boolean {
  return SHA_ALONE.test(code) || CI_RUN_ALONE.test(code);
}

function citesState(prose: string): boolean {
  return SHA_IN_PROSE.test(prose) || CI_RUN.test(prose);
}
