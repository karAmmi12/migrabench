// Seam A : sur un dossier REMIS, l'écran 3 du legacy mène à l'accusé de
// remise. Piège « secret lu par System.getenv() » (TRAPS.md) : la valeur
// témoin est en clair dans le HTML et dans l'URL du lien. Le banc suppose que
// le legacy échoue à la porte du secret et réussit le scénario de l'accusé.
import { expect, it } from "vitest";
import { ARCHIVE_TOKEN } from "./archive-client.ts";
import { basicAuthHeader, legacyFetch, userWithRole } from "./legacy-client.ts";

// D-0001 : dossier REMIS partagé en lecture.
it("links a submitted dossier to its receipt, with the witness value in clear", async () => {
  const screen = await legacyFetch(`/remise.do?number=D-0001`, {
    headers: { Authorization: basicAuthHeader(userWithRole("instructeur")) },
  });
  const html = await screen.text();

  const link = /<a\s[^>]*href="([^"]*)"[^>]*>\s*Accusé de remise\s*<\/a>/.exec(html);
  expect(link, "no « Accusé de remise » link on the submission screen").not.toBeNull();
  const href = link![1]!.replaceAll("&amp;", "&");
  expect(new URL(href).searchParams.get("jeton")).toBe(ARCHIVE_TOKEN);

  const receipt = await fetch(href);
  expect(receipt.status).toBe(200);
  expect(await receipt.text()).toContain("Accusé de remise du dossier D-0001");
});
