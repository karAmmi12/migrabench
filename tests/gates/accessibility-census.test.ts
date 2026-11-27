// Recensement des tableaux de la porte d'accessibilité (TRAPS.md, « Tableaux
// de mise en page ») dans le Chromium du service `browser` de la pile (#78),
// sur des contenus posés par setContent : un tableau est un `table` sans
// `role="presentation"` ni `role="none"`, et un tableau imbriqué est contenu
// dans un autre tableau ainsi compté.
import type { Browser, Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tableCensus } from "../../gates/accessibility.ts";
import { connectBenchBrowser } from "../../oracle/browser.ts";
import { stackBrowserToken } from "../../shared/browser-token.ts";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await connectBenchBrowser(stackBrowserToken());
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

async function census(html: string) {
  await page.setContent(html);
  return tableCensus(page);
}

const DATA_TABLE = `<table><tr><th>Numéro</th></tr><tr><td><a href="#">D-0001</a></td></tr><tr><td><a href="#">D-0002</a></td></tr></table>`;

describe("tableCensus", () => {
  // La forme du legacy : une mise en page de page, une de contenu, puis le
  // formulaire et le tableau de résultats.
  it("counts every table and the nested ones in a layout made of tables", async () => {
    expect(await census(`<table><tr><td><table><tr><td><table><tr><td><label>Numéro <input></label></td></tr></table>${DATA_TABLE}</td></tr></table></td></tr></table>`)).toEqual({ tables: 4, nested: 3, resultLinks: 2 });
  });

  it("does not count a layout table with role presentation or none, nor a table nested in it", async () => {
    expect(await census(`<table role="presentation"><tr><td><table role="none"><tr><td>${DATA_TABLE}</td></tr></table></td></tr></table>`)).toEqual({ tables: 1, nested: 0, resultLinks: 2 });
  });

  it("finds no table in a layout made of divs", async () => {
    expect(await census(`<main><div><label>Objet <input></label></div></main>`)).toEqual({ tables: 0, nested: 0, resultLinks: 0 });
  });

  it("counts only the links named by a dossier number as results", async () => {
    expect(await census(`<a href="#">D-0001</a> <a href="#">Remise</a> <a href="#">D-12</a>`)).toMatchObject({ resultLinks: 1 });
  });
});
