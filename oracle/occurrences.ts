// Vérification de présence (spec de l'étape 2, « Vérifications de texte ») :
// au moins une occurrence exacte affichée suffit. Un candidat peut répéter un
// texte (un numéro dans un fil d'Ariane, par exemple) sans être jugé infidèle.
// La vérification d'absence, elle, n'accepte aucune occurrence : elle garde
// le localisateur entier (`toHaveCount(0)`).
import type { Locator } from "@playwright/test";

// La première occurrence affichée : une occurrence masquée qui la précède
// n'est pas retenue, et plusieurs occurrences ne violent pas le mode strict.
export function atLeastOne(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}
