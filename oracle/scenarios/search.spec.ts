// Scénarios @recherche de l'oracle (spec de l'étape 2, tableau « Recherche »).
import { button, displayedSharedNumbers, expect, field, markReached, openSearch, test } from "../support.ts";

test("search-empty-form", { tag: "@recherche" }, async ({ page }) => {
  await openSearch(page);
  markReached();

  await test.step("verification: every shared dossier, sorted by number", async () => {
    await button(page, "Rechercher").click();
    await expect
      .poll(() => displayedSharedNumbers(page))
      .toEqual(Array.from({ length: 30 }, (_, index) => `D-${String(index + 1).padStart(4, "0")}`));
  });
});

test.describe(() => {
  test.use({ identity: "no-credentials" });

  // Aucune navigation : le chargement est la vérification.
  test("auth-no-credentials", { tag: "@recherche" }, async ({ page, baseURL }) => {
    markReached();

    await test.step("verification: refused with 401, search not shown", async () => {
      const origin = new URL(baseURL ?? "").origin;
      const statuses: number[] = [];
      page.on("response", (response) => {
        if (new URL(response.url()).origin === origin) statuses.push(response.status());
      });
      await page.goto("/");

      expect(statuses).toContain(401);
      await expect(field(page, "Numéro")).toHaveCount(0);
    });
  });
});
