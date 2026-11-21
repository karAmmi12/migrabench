// Comptage des champs modifiables (spec de l'étape 2, M1 : « aucun champ
// modifiable »). Sorti de support.ts pour être testé sans la fixture Playwright.
import type { Locator, Page } from "@playwright/test";

// Rôles des champs de saisie. `contenteditable` n'a pas de rôle implicite : il
// est lu par l'attribut qui le rend modifiable. L'union (`or`) ne compte
// qu'une fois un élément trouvé par deux voies.
const FIELD_ROLES = [
  "textbox",
  "searchbox",
  "combobox",
  "listbox",
  "spinbutton",
  "checkbox",
  "radio",
  "switch",
  "slider",
] as const;

function fields(page: Page): Locator {
  return FIELD_ROLES.reduce(
    (union, role) => union.or(page.getByRole(role)),
    page.locator("[contenteditable]:not([contenteditable='false'])"),
  );
}

// Modifiable selon l'état « éditable » de Playwright, qui couvre readonly,
// disabled et aria-readonly. Un rôle qui n'admet pas aria-readonly (un
// `role="radio"` hors <input>, par exemple) fait lever isEditable : il est
// alors modifiable s'il est activé.
async function isModifiable(field: Locator): Promise<boolean> {
  try {
    return await field.isEditable();
  } catch {
    return await field.isEnabled();
  }
}

export async function editableFieldCount(page: Page): Promise<number> {
  let count = 0;
  for (const field of await fields(page).all()) {
    if (await isModifiable(field)) count += 1;
  }
  return count;
}
