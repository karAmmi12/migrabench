// Variantes observées (spec de l'étape 2, « Variantes observées ») : quand le
// moyen est libre, l'oracle enregistre celui du candidat, pour le rapport,
// jamais pour juger. Seules les clés et valeurs du tableau de la spec existent.
import { VARIANT_ANNOTATION } from "./collect.ts";

export interface Variants {
  lock: "readonly" | "disabled" | "aria-readonly";
  maxlength: "input-blocked" | "message";
  "receipt-tab": "same-tab" | "new-tab";
}

export type VariantKey = keyof Variants;

// Annotation `mb:variant` = `<clé>=<valeur>` (spec, « Résultat JSON »).
export function variantAnnotation<K extends VariantKey>(key: K, value: Variants[K]): { type: string; description: string } {
  return { type: VARIANT_ANNOTATION, description: `${key}=${value}` };
}
