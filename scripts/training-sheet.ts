// Tickets fermés par une PR (#54, porté du perl de fiche-ticket.yml). Mots-clés
// de fermeture de GitHub : close, closes, closed, fix, fixes, fixed, resolve,
// resolves, resolved, en toute casse, suivis de « #N ». Comme GitHub, un
// mot-clé écrit dans du code ne compte pas (stripCode).
import { stripCode } from "./pr-body.ts";

const CLOSING_KEYWORD = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):? +#(\d+)/gi;

// Numéros des tickets fermés, chacun une fois, dans l'ordre croissant.
export function closedTickets(body: string): number[] {
  const numbers = [...stripCode(body).matchAll(CLOSING_KEYWORD)].map((match) => Number(match[1]));
  return [...new Set(numbers)].sort((a, b) => a - b);
}
