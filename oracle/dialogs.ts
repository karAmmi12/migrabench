// Refus des boîtes de dialogue (spec de l'étape 2, M4 : remise « sans
// confirmation »). Chaque boîte ouverte par la page est refusée (`dismiss` :
// un `confirm` rend faux) et notée ; `expectNone` échoue en la nommant, pour
// que l'échec dise qu'une confirmation a été demandée plutôt qu'un texte manquant.
import type { Dialog, Page } from "@playwright/test";

export interface RefusedDialogs {
  expectNone(): void;
}

export function refuseDialogs(page: Page): RefusedDialogs {
  const refused: string[] = [];
  page.on("dialog", (dialog: Dialog) => {
    refused.push(`${dialog.type()} "${dialog.message()}"`);
    dialog.dismiss().catch(() => {});
  });
  return {
    expectNone() {
      if (refused.length > 0) throw new Error(`Dialog refused: ${refused.join(", ")}`);
    },
  };
}
