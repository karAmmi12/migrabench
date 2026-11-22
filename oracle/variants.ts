// Variantes observées (spec de l'étape 2, « Variantes observées ») : quand le
// moyen est libre, l'oracle enregistre celui du candidat, pour le rapport,
// jamais pour juger. Seules les clés et valeurs du tableau de la spec existent.
import { SKIPPED_STEP_ANNOTATION, VARIANT_ANNOTATION } from "./collect.ts";

export interface Variants {
  // Seuls verrous valides d'un champ de formulaire natif : aria-readonly seul
  // le laisse modifiable, c'est un faux verrou (F11 et F12 échouent).
  lock: "readonly" | "disabled";
  maxlength: "input-blocked" | "message";
  "receipt-tab": "same-tab" | "new-tab";
}

export type VariantKey = keyof Variants;

export interface Annotation {
  type: string;
  description: string;
}

// Annotation `mb:variant` = `<clé>=<valeur>` (spec, « Résultat JSON »).
export function variantAnnotation<K extends VariantKey>(key: K, value: Variants[K]): Annotation {
  return { type: VARIANT_ANNOTATION, description: `${key}=${value}` };
}

// Annotation `mb:skipped-step` : étape sautée et variante qui la justifie
// (spec, « Résultat JSON »), pour qu'elle ne passe pas pour une étape ignorée.
export function skippedStepAnnotation<K extends VariantKey>(
  step: string,
  key: K,
  value: Variants[K],
): Annotation {
  return { type: SKIPPED_STEP_ANNOTATION, description: `${step} (${key}=${value})` };
}
