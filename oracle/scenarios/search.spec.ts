// Scénarios @recherche de l'oracle (spec de l'étape 2, tableau « Recherche »).
// Valeurs attendues relevées sur le legacy ; messages au texte exact de
// ApplicationResources.properties (SEARCH_MESSAGES). Un scénario de recherche
// ne lit que les numéros partagés affichés (displayedSharedNumbers), comparés
// à la liste attendue par égalité exacte : ordre relatif et absence du
// complément vérifiés d'un coup, sans observer un dossier réservé ni le nombre
// de lignes.
import type { Page } from "@playwright/test";
import {
  atLeastOne,
  button,
  displayedNumbers,
  displayedSharedNumbers,
  exactText,
  expect,
  field,
  type Identity,
  markReached,
  openSearch,
  SEARCH_MESSAGES,
  test,
} from "../support.ts";

// Critères de la recherche, par libellé de champ. Le statut est choisi par le
// libellé de son option.
interface Criteria {
  Numéro?: string;
  Demandeur?: string;
  Statut?: string;
  "Déposé du"?: string;
  "Déposé au"?: string;
}

async function search(page: Page, criteria: Criteria): Promise<void> {
  for (const [label, value] of Object.entries(criteria) as [keyof Criteria, string][]) {
    if (label === "Statut") await field(page, label).selectOption({ label: value });
    else await field(page, label).fill(value);
  }
  await button(page, "Rechercher").click();
}

// Recherche acceptée : la suite des numéros partagés affichés vaut la liste attendue.
function searchScenario(title: string, criteria: Criteria, expected: string[]): void {
  test(title, { tag: "@recherche" }, async ({ page }) => {
    await openSearch(page);
    markReached();

    await test.step(`verification: shared numbers ${expected.join(", ")}`, async () => {
      await search(page, criteria);
      await expect.poll(() => displayedSharedNumbers(page)).toEqual(expected);
    });
  });
}

// Saisie refusée (R12 à R16) : le message est affiché, aucun numéro partagé
// n'est affiché, et les valeurs saisies sont gardées. Le message, qui n'existe
// qu'après la réponse, est attendu en premier : l'absence de numéros n'est lue
// qu'ensuite, sur la page de la réponse.
function refusedScenario(title: string, criteria: Criteria, message: string): void {
  test(title, { tag: "@recherche" }, async ({ page }) => {
    await openSearch(page);
    markReached();

    await test.step("verification: refused with its message, no shared number", async () => {
      await search(page, criteria);
      await expect(atLeastOne(exactText(page, message))).toBeVisible();
      expect(await displayedSharedNumbers(page)).toEqual([]);
    });
    await test.step("verification: input kept", async () => {
      for (const [label, value] of Object.entries(criteria) as [keyof Criteria, string][]) {
        await expect(field(page, label)).toHaveValue(value);
      }
    });
  });
}

test("search-initial-focus", { tag: ["@recherche", "@clavier"] }, async ({ page }) => {
  await openSearch(page);
  markReached();

  await test.step("verification: focus on Numéro", async () => {
    await expect(field(page, "Numéro")).toBeFocused();
  });
});

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

searchScenario("search-number-exact", { Numéro: "D-0007" }, ["D-0007"]);

// « Jérôme Perrin-Lagarde » : milieu du nom, autre casse.
searchScenario("search-applicant-contains-case", { Demandeur: "pERRIN" }, ["D-0016"]);

// « Élodie Marchand » (D-0001) n'est pas trouvé par « Elodie » : seul D-0004.
searchScenario("search-applicant-accents", { Demandeur: "Elodie" }, ["D-0004"]);

searchScenario("search-status", { Statut: "Remis" }, [
  "D-0001",
  "D-0004",
  "D-0007",
  "D-0010",
  "D-0013",
  "D-0016",
  "D-0019",
  "D-0022",
  "D-0025",
  "D-0028",
]);

// Bornes incluses, même jour.
searchScenario("search-filed-same-day", { "Déposé du": "14/02/2025", "Déposé au": "14/02/2025" }, [
  "D-0012",
  "D-0019",
]);

searchScenario("search-filed-from-only", { "Déposé du": "27/10/2025" }, ["D-0030"]);

searchScenario("search-filed-to-only", { "Déposé au": "06/05/2024" }, ["D-0001"]);

// Critères en ET : D-0026 (« d' », Brouillon) est absent.
searchScenario("search-criteria-and", { Demandeur: "d'", Statut: "Remis" }, ["D-0007", "D-0019"]);

// Un numéro, pas un demandeur : aucun dossier, réservé ou non, ne peut répondre.
test("search-no-result", { tag: "@recherche" }, async ({ page }) => {
  await openSearch(page);
  markReached();

  await test.step("verification: no-result message, no number", async () => {
    await search(page, { Numéro: "D-0999" });
    await expect(atLeastOne(exactText(page, "Aucun dossier ne correspond à vos critères."))).toBeVisible();
    expect(await displayedNumbers(page)).toEqual([]);
  });
});

refusedScenario("search-number-mask", { Numéro: "D-1" }, SEARCH_MESSAGES.numberMask);

refusedScenario("search-number-spaces", { Numéro: "D-0001 " }, SEARCH_MESSAGES.numberMask);

refusedScenario("search-filed-from-format", { "Déposé du": "2025-01-01" }, SEARCH_MESSAGES.filedFromDate);

// Date impossible.
refusedScenario("search-filed-to-format", { "Déposé au": "31/02/2025" }, SEARCH_MESSAGES.filedToDate);

refusedScenario(
  "search-filed-range-order",
  { "Déposé du": "02/01/2025", "Déposé au": "01/01/2025" },
  SEARCH_MESSAGES.filedRangeOrder,
);

// R17 et R18 : navigation réduite au chargement de BASE_URL, atteint dès
// qu'une réponse HTTP arrive. Une erreur de connexion rend le scénario non
// atteint, pour ne pas la confondre avec un front qui accepte l'accès sans
// identifiants valides.
function refusedAccessScenario(title: string, identity: Identity, description: string): void {
  test.describe(() => {
    test.use({ identity });

    test(title, { tag: "@recherche" }, async ({ page, baseURL }) => {
      const origin = new URL(baseURL ?? "").origin;
      const statuses: number[] = [];
      page.on("response", (response) => {
        if (new URL(response.url()).origin === origin) statuses.push(response.status());
      });

      await test.step("navigation: load BASE_URL", async () => {
        await page.goto("/");
      });
      markReached();

      await test.step(`verification: ${description} refused with 401, search not shown`, async () => {
        expect(statuses).toContain(401);
        await expect(field(page, "Numéro")).toHaveCount(0);
      });
    });
  });
}

refusedAccessScenario("auth-no-credentials", "no-credentials", "no credentials");

// Le nom inconnu commun (UNKNOWN_USER), absent de fixtures/users.json : le
// LockOutRealm de Tomcat ne bloque jamais l'agent ni l'instructeur.
refusedAccessScenario("auth-unknown-user", "unknown-user", "unknown user");
