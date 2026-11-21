// Ouverture de l'accusé de remise (spec de l'étape 2, M5 et M6) : un clic sur
// le lien doit mener à une page, dans le même onglet ou dans un nouvel onglet,
// jamais à un téléchargement. L'onglet est rendu pour être enregistré comme
// variante (`receipt-tab`), pas pour juger.
import type { Download, Locator, Page } from "@playwright/test";
import type { Variants } from "./variants.ts";

export type ReceiptTab = Variants["receipt-tab"];

// Lien « Accusé de remise » de l'écran de remise.
export function receiptLink(page: Page): Locator {
  return page.getByRole("link", { name: "Accusé de remise", exact: true });
}

export interface OpenedReceipt {
  page: Page;
  tab: ReceiptTab;
}

type Outcome = { kind: "same-tab" } | { kind: "new-tab"; page: Page } | { kind: "download"; download: Download };

export async function openReceipt(link: Locator): Promise<OpenedReceipt> {
  const page = link.page();
  // Chromium émet le téléchargement sur la page du lien, même pour un lien
  // `target="_blank"` : le nouvel onglet s'ouvre puis se ferme sans rien émettre.
  const download = page.waitForEvent("download").then((file) => ({ kind: "download" as const, download: file }));
  const sameTab = page
    .waitForEvent("framenavigated", (frame) => frame === page.mainFrame())
    .then(() => ({ kind: "same-tab" as const }));
  const newTab = page
    .context()
    .waitForEvent("page")
    .then((opened) => ({ kind: "new-tab" as const, page: opened }));
  // Les attentes perdantes expirent plus tard : leur rejet ne doit rien faire tomber.
  for (const wait of [download, sameTab, newTab]) wait.catch(() => {});

  await link.click();
  const outcome: Outcome = await Promise.race([download, sameTab, newTab]);
  if (outcome.kind === "download") throw downloaded(outcome.download);
  const receipt = outcome.kind === "same-tab" ? page : outcome.page;
  // Le téléchargement peut encore arriver pendant le chargement de la page.
  const settled = await Promise.race([receipt.waitForLoadState("load").then(() => undefined), download]);
  if (settled !== undefined) throw downloaded(settled.download);
  return { page: receipt, tab: outcome.kind };
}

function downloaded(download: Download): Error {
  return new Error(`Receipt downloaded as an attachment ("${download.suggestedFilename()}"), not displayed in a page`);
}
