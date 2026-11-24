// Seam A : ce que l'API interne applique (sémantique de la recherche, refus de
// la remise d'un BROUILLON, verrou du statut) et ce qu'elle n'applique pas
// (règles de validation.xml, contrôle de rôle). Appels depuis mb-internal,
// par le port 8081.
import { describe, expect, it } from "vitest";
import { UNKNOWN_USER } from "../../scripts/users.ts";
import { basicAuthHeader, legacyFetch, userWithRole } from "./legacy-client.ts";
import { callInternalApi, fetchFromInternal, INTERNAL_API_URL } from "./internal-api-client.ts";

interface Criteria {
  number?: string;
  applicant?: string;
  status?: string;
  filedFrom?: string; // aaaa-mm-jj
  filedTo?: string; // aaaa-mm-jj
}

async function searchByApi(criteria: Criteria): Promise<string[]> {
  const { status, json } = await callInternalApi("GET", `/api/dossiers?${new URLSearchParams({ ...criteria })}`);
  expect(status).toBe(200);
  return (json as { dossiers: { number: string }[] }).dossiers.map((dossier) => dossier.number);
}

// Numéros affichés par l'écran 1 pour les mêmes critères, dates saisies en jj/mm/aaaa.
async function searchByScreen(criteria: Criteria): Promise<string[]> {
  const toScreenDate = (date = "") => date.split("-").reverse().join("/");
  const query = new URLSearchParams({
    number: criteria.number ?? "",
    applicant: criteria.applicant ?? "",
    status: criteria.status ?? "",
    filedFrom: toScreenDate(criteria.filedFrom),
    filedTo: toScreenDate(criteria.filedTo),
  });
  const response = await legacyFetch(`/rechercher.do?${query}`, {
    headers: { Authorization: basicAuthHeader(userWithRole("agent")) },
  });
  expect(response.status).toBe(200);
  const html = await response.text();
  // Struts réécrit l'URL avec ;jsessionid=… tant que la session n'a pas de cookie.
  return [...html.matchAll(/fiche\.do(?:;jsessionid=\w+)?\?number=(D-\d{4})/g)].map((match) => match[1]!);
}

describe("internal API search", () => {
  it.each<{ name: string; criteria: Criteria; expected: string[] | "non-empty" }>([
    { name: "no criterion returns every dossier", criteria: {}, expected: "non-empty" },
    { name: "exact number", criteria: { number: "D-0007" }, expected: ["D-0007"] },
    { name: "unknown number", criteria: { number: "D-0099" }, expected: [] },
    { name: "applicant contains, case-insensitive", criteria: { applicant: "o'NEILL" }, expected: ["D-0011", "D-0112"] },
    { name: "applicant is accent-sensitive (Élodie)", criteria: { applicant: "élodie" }, expected: ["D-0001"] },
    { name: "applicant is accent-sensitive (Elodie)", criteria: { applicant: "ELODIE" }, expected: ["D-0004"] },
    { name: "status", criteria: { status: "EN_INSTRUCTION" }, expected: "non-empty" },
    {
      name: "inclusive date bounds",
      criteria: { filedFrom: "2025-02-14", filedTo: "2025-02-14" },
      expected: ["D-0012", "D-0019"],
    },
    { name: "lower bound only", criteria: { filedFrom: "2025-10-27" }, expected: ["D-0030", "D-0108", "D-0109"] },
    { name: "upper bound only", criteria: { filedTo: "2024-05-21" }, expected: ["D-0001", "D-0002"] },
    {
      name: "criteria combined with AND",
      criteria: { applicant: "margaux", status: "REMIS", filedFrom: "2025-06-01" },
      expected: ["D-0110"],
    },
  ])("$name, like screen 1", async ({ criteria, expected }) => {
    const byApi = await searchByApi(criteria);

    expect(byApi).toEqual(await searchByScreen(criteria));
    if (expected === "non-empty") expect(byApi.length).toBeGreaterThan(1);
    else expect(byApi).toEqual(expected);
  });

  it("sorts the results by number", async () => {
    const numbers = await searchByApi({});

    expect(numbers).toEqual([...numbers].sort());
  });

  it("returns dossiers with their fields, dates in ISO format", async () => {
    const { json } = await callInternalApi("GET", "/api/dossiers?number=D-0001");

    expect(json).toEqual({
      dossiers: [
        {
          number: "D-0001",
          applicant: "Élodie Marchand",
          subject: "Permis de construire d'une véranda",
          status: "REMIS",
          filedOn: "2024-05-06",
          submittedOn: "2024-07-15",
        },
      ],
    });
  });
});

describe("internal API read", () => {
  it("answers 404 for an unknown number", async () => {
    const { status } = await callInternalApi("GET", "/api/dossiers/D-0099");

    expect(status).toBe(404);
  });
});

// Dossiers réservés à ces tests (test:internal-api dans le jeu de données).
// Les dossiers partagés D-0001 à D-0003 ne servent qu'à des lectures et à
// des refus, qui n'enregistrent rien.
// Chaque modification acceptée est annulée par une seconde modification qui
// remet les valeurs initiales : les tests peuvent tourner sans redémarrage.
const RESERVED_BROUILLON = {
  number: "D-0113",
  applicant: "Lucie Arnaud",
  subject: "Demande de carte d'accès à la déchetterie",
};
const RESERVED_EN_INSTRUCTION = {
  number: "D-0114",
  applicant: "Bastien Royer",
  subject: "Occupation temporaire d'une place de marché",
};
const RESERVED_REMIS = {
  number: "D-0115",
  applicant: "Hugo Perrault",
  subject: "Déclaration d'un puits domestique",
};

interface EditableFields {
  applicant: string;
  subject: string;
}

async function updateThenRestore(
  dossier: EditableFields & { number: string },
  change: EditableFields,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  const path = `/api/dossiers/${dossier.number}`;
  try {
    return await callInternalApi("PUT", path, change, headers);
  } finally {
    const restored = await callInternalApi("PUT", path, { applicant: dossier.applicant, subject: dossier.subject });
    expect(restored.status, `restore ${dossier.number}`).toBe(200);
  }
}

describe("internal API update, under the status lock of screen 2", () => {
  it("edits the applicant and the subject of a BROUILLON dossier", async () => {
    const change = { applicant: "Lucie Arnaud-Morel", subject: "Carte d'accès « déchetterie » renouvelée" };

    const { status, json } = await updateThenRestore(RESERVED_BROUILLON, change);

    expect(status).toBe(200);
    expect(json).toMatchObject({ number: "D-0113", status: "BROUILLON", ...change });
  });

  it("edits the subject of an EN_INSTRUCTION dossier", async () => {
    const change = { applicant: RESERVED_EN_INSTRUCTION.applicant, subject: "Occupation d'une place de marché" };

    const { status, json } = await updateThenRestore(RESERVED_EN_INSTRUCTION, change);

    expect(status).toBe(200);
    expect(json).toMatchObject({ number: "D-0114", ...change });
  });

  // D-0003 : EN_INSTRUCTION, D-0001 : REMIS, partagés en lecture. Un refus
  // n'enregistre rien, et renvoyer les valeurs actuelles ne modifie rien.
  it.each([
    { name: "the applicant of an EN_INSTRUCTION dossier", number: "D-0003", field: "applicant" },
    { name: "the applicant of a REMIS dossier", number: "D-0001", field: "applicant" },
    { name: "the subject of a REMIS dossier", number: "D-0001", field: "subject" },
  ])("refuses with 409 a change of $name, and saves nothing", async ({ number, field }) => {
    const before = await callInternalApi("GET", `/api/dossiers/${number}`);
    const current = before.json as EditableFields;

    const { status } = await callInternalApi("PUT", `/api/dossiers/${number}`, {
      applicant: current.applicant,
      subject: current.subject,
      [field]: "Valeur forgée",
    });

    expect(status).toBe(409);
    expect((await callInternalApi("GET", `/api/dossiers/${number}`)).json).toEqual(before.json);
  });

  // Renvoyer les valeurs actuelles passe par un enregistrement : sur des
  // dossiers réservés, pas sur les dossiers partagés en lecture.
  it.each([
    { status: "EN_INSTRUCTION", dossier: RESERVED_EN_INSTRUCTION },
    { status: "REMIS", dossier: RESERVED_REMIS },
  ])("accepts the current values of a $status dossier, which are no change", async ({ status, dossier }) => {
    const path = `/api/dossiers/${dossier.number}`;
    const before = await callInternalApi("GET", path);
    expect(before.json).toMatchObject({ status, applicant: dossier.applicant, subject: dossier.subject });

    const response = await callInternalApi("PUT", path, { applicant: dossier.applicant, subject: dossier.subject });

    expect(response.status).toBe(200);
    expect(response.json).toEqual(before.json);
  });

  it("refuses with 409 a locked change that also breaks an input rule", async () => {
    const { status } = await callInternalApi("PUT", "/api/dossiers/D-0003", { applicant: "", subject: "" });

    expect(status).toBe(409);
  });

  it("answers 404 for an unknown number", async () => {
    const { status } = await callInternalApi("PUT", "/api/dossiers/D-0099", { applicant: "A", subject: "B" });

    expect(status).toBe(404);
  });
});

describe("internal API update, with a malformed body", () => {
  // Le 400 est le contrat de l'API, pas une règle de saisie. Un corps refusé
  // n'enregistre rien : les tests visent quand même un dossier réservé.
  it.each([
    { name: "a body that is not JSON", body: "pas du json" },
    { name: "no body", body: "" },
    { name: "a missing subject", body: JSON.stringify({ applicant: RESERVED_BROUILLON.applicant }) },
    { name: "a non-string applicant", body: JSON.stringify({ applicant: 42, subject: RESERVED_BROUILLON.subject }) },
    { name: "a null subject", body: JSON.stringify({ applicant: RESERVED_BROUILLON.applicant, subject: null }) },
    { name: "a JSON array", body: "[]" },
  ])("refuses with 400 $name, and saves nothing", async ({ body }) => {
    const path = `/api/dossiers/${RESERVED_BROUILLON.number}`;
    const before = await callInternalApi("GET", path);

    const response = await fetchFromInternal(`${INTERNAL_API_URL}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toHaveProperty("error");
    expect((await callInternalApi("GET", path)).json).toEqual(before.json);
  });
});

describe("internal API, without the input rules of validation.xml", () => {
  it("accepts an empty applicant and an over-long subject", async () => {
    const change = { applicant: "", subject: "x".repeat(300) };

    const { status, json } = await updateThenRestore(RESERVED_BROUILLON, change);

    expect(status).toBe(200);
    expect(json).toMatchObject(change);
  });

  it.each([
    { name: "a malformed number", criteria: { number: "abc" } },
    { name: "an upper date bound before the lower one", criteria: { filedFrom: "2025-02-14", filedTo: "2024-02-14" } },
  ])("searches with $name instead of refusing it", async ({ criteria }) => {
    expect(await searchByApi(criteria)).toEqual([]);
  });
});

describe("internal API submission", () => {
  it("refuses with 409 to submit a BROUILLON dossier, which stays BROUILLON", async () => {
    // D-0002 : BROUILLON partagé en lecture.
    const { status } = await callInternalApi("POST", "/api/dossiers/D-0002/remise");

    expect(status).toBe(409);
    expect((await callInternalApi("GET", "/api/dossiers/D-0002")).json).toMatchObject({ status: "BROUILLON" });
  });

  it("answers 404 for an unknown number", async () => {
    const { status } = await callInternalApi("POST", "/api/dossiers/D-0099/remise");

    expect(status).toBe(404);
  });
});

describe("internal API, ignoring the caller's identity", () => {
  it.each([
    { name: "without credentials", headers: {} },
    { name: "with the agent's credentials", headers: { Authorization: basicAuthHeader(userWithRole("agent")) } },
    { name: "with unknown credentials", headers: { Authorization: basicAuthHeader(UNKNOWN_USER) } },
  ])("edits a dossier $name", async ({ headers }) => {
    const change = { applicant: RESERVED_BROUILLON.applicant, subject: "Objet modifié sans contrôle de rôle" };

    const { status, json } = await updateThenRestore(RESERVED_BROUILLON, change, headers);

    expect(status).toBe(200);
    expect(json).toMatchObject(change);
  });
});
