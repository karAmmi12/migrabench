// Variante `lock` (spec de l'étape 2, F11 et F12) : le moyen qui rend un champ
// non modifiable, lu pour être enregistré, jamais pour juger. Le jugement
// reste sur l'état « éditable » de Playwright, qui couvre les trois moyens.
import type { Locator } from "@playwright/test";
import type { Variants } from "./variants.ts";

export type Lock = Variants["lock"];

// Rend undefined pour un champ modifiable, ou verrouillé par un moyen que la
// spec ne liste pas (`aria-disabled`, par exemple) : rien n'est alors enregistré.
export async function lockVariant(field: Locator): Promise<Lock | undefined> {
  return field.evaluate((element): Lock | undefined => {
    if (element.matches(":disabled")) return "disabled";
    if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.readOnly) return "readonly";
    if (element.getAttribute("aria-readonly") === "true") return "aria-readonly";
    return undefined;
  });
}
