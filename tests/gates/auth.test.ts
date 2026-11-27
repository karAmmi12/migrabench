// Porte d'authentification (spec de l'étape 4, « Authentification ») : lecture
// des HAR de l'oracle, transplantation vers une session anonyme, recherche
// des numéros de dossier et jugement des deux résultats, fonctions pures.
// Les HAR sont ceux d'une vraie mesure (tests/fixtures/measure-d905931-har/),
// les requêtes, réponses et rejeux du legacy ceux de la sonde de #132
// (tests/fixtures/probe132-ca289e1/PROVENANCE.md).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { type AuthObservation, type Replay, authDossiersOf, authGate, authResults, datasetNumbersOf, harUnits, NO_CONTROL_NUMBER, NO_CONTROL_WRITE, numbersIn, replayUnit, type ReplayUnit } from "../../gates/auth.ts";
import { type Received, sessionBoundValues, transplant } from "../../gates/transplant.ts";
import type { Har } from "../../gates/witness-value.ts";
import { readJsonFixture } from "../real-fixtures.ts";

const DATASET = readFileSync(new URL("../../fixtures/legacy-app/src/main/resources/dossiers.json", import.meta.url), "utf8");
const NUMBERS = datasetNumbersOf(DATASET);
const CANDIDATE = "http://127.0.0.1:8100";
const har = (scenario: string) => ({ scenario, har: readJsonFixture<Har>(`measure-d905931-har/${scenario}/scenario.har`) });
const HARS = [har("search-search-status-chromium"), har("sheet-sheet-save-brouillon-chromium")];

interface ProbeResponse { method: string; url: string; status: number; headers: { name: string; value: string }[]; body: string | null }
const PROBE = readJsonFixture<{
  anonymous: { responses: ProbeResponse[]; cookies: { name: string; value: string }[] };
  replayNoCookie: { status: number; headers: string[]; body: string }[];
}>("probe132-ca289e1/probe-output.json");
// Ce qu'a reçu la session anonyme du legacy : la page 401 de BASE_URL, aucun cookie.
const ANONYMOUS: Received = { cookies: PROBE.anonymous.cookies, responses: PROBE.anonymous.responses };

describe("harUnits", () => {
  it("keeps the GET and HEAD of each HAR to the candidate, one unit per scenario, and counts the others as skipped", () => {
    const { units, skipped } = harUnits(HARS, CANDIDATE);
    expect(units.map(({ source, requests }) => [source, requests.map(({ request }) => request.method)])).toEqual([
      ["search-search-status-chromium", ["GET", "GET"]],
      ["sheet-sheet-save-brouillon-chromium", ["GET", "GET", "GET", "GET", "GET", "GET", "GET"]],
    ]);
    expect(skipped).toBe(1);
  });

  it("lowercases the request headers, and gives each request what its session received before it", () => {
    const [search] = harUnits(HARS, CANDIDATE).units;
    const second = search!.requests[1]!;
    expect(second.request.url).toMatch(/^http:\/\/127\.0\.0\.1:8100\/rechercher\.do;jsessionid=[0-9A-F]+\?number=&applicant=&status=REMIS/);
    expect(second.request.headers.authorization).toBe(`Basic ${Buffer.from("agent:agent-mb").toString("base64")}`);
    expect(second.request.headers.cookie).toMatch(/^JSESSIONID=[0-9A-F]+$/);
    expect(second.received.responses.map(({ method, url }) => `${method} ${url}`)).toEqual([`GET ${CANDIDATE}/`]);
    expect(second.received.cookies.map(({ name }) => name)).toEqual(["JSESSIONID"]);
    expect(search!.requests[0]!.received.responses).toEqual([]);
  });

  it("leaves out the requests to another origin", () => {
    expect(harUnits(HARS, "http://127.0.0.1:9999").units.every(({ requests }) => requests.length === 0)).toBe(true);
  });
});

describe("transplant to the anonymous session", () => {
  const [search] = harUnits(HARS, CANDIDATE).units;
  const { request: recorded, received } = search!.requests[1]!;

  // Décision de Karim du 27/11 sur #132 : seules les valeurs qui diffèrent
  // dans la nouvelle session du contrôle sont liées à la session. Ici, le
  // `jsessionid` du chemin ; `REMIS`, reçu dans la page de BASE_URL, ne l'est pas.
  const BOUND = new Set(["path:jsessionid"]);

  it("sends neither the Authorization nor the cookies of the authenticated session, and removes the session id of the path", () => {
    const { request, values } = transplant(recorded, { source: received, target: ANONYMOUS, authorization: null, sessionBound: BOUND });
    expect(request.headers.authorization).toBeUndefined();
    expect(request.headers.cookie).toBeUndefined();
    expect(request.url).toBe(`${CANDIDATE}/rechercher.do?number=&applicant=&status=REMIS&filedFrom=&filedTo=`);
    expect(values.map(({ where, found }) => [where, found])).toEqual([["path:jsessionid", false], ["cookie:JSESSIONID", false]]);
  });

  it("would remove REMIS, received in the page of BASE_URL, if every received value were bound to the session", () => {
    const { request } = transplant(recorded, { source: received, target: ANONYMOUS, authorization: null });
    expect(request.url).not.toContain("status=REMIS");
  });

  // Décision de Karim du 27/11 sur #132 : les cookies sont transplantés
  // depuis la session anonyme.
  it("sends the cookie of the same name received by the anonymous session", () => {
    const anonymous: Received = { ...ANONYMOUS, cookies: [{ name: "JSESSIONID", value: "ANONYMOUS0000000000000000000000AA" }] };
    const { request } = transplant(recorded, { source: received, target: anonymous, authorization: null, sessionBound: BOUND });
    expect(request.headers.cookie).toBe("JSESSIONID=ANONYMOUS0000000000000000000000AA");
  });
});

describe("sessionBoundValues", () => {
  // La session du second scénario, au même point (BASE_URL reçu, cookie posé),
  // joue la nouvelle session de même droit.
  const [search, sheet] = harUnits(HARS, CANDIDATE).units;
  const { request: recorded, received } = search!.requests[1]!;
  const fresh = sheet!.requests[1]!.received;

  it("binds to the session the id that differs in a fresh session, and keeps REMIS, the same in both, as recorded", () => {
    const { values } = transplant(recorded, { source: received, target: fresh, authorization: "Basic x" });
    const bound = sessionBoundValues(values);
    expect([...bound].sort()).toEqual(["cookie:JSESSIONID", "path:jsessionid"]);
    expect(values.find(({ where }) => where === "query:status")).toMatchObject({ found: true, changed: false });
    const { request } = transplant(recorded, { source: received, target: ANONYMOUS, authorization: null, sessionBound: bound });
    expect(new URL(request.url).searchParams.get("status")).toBe("REMIS");
  });
});

// Candidat à jeton anti-CSRF lié à son propre cookie, posé par la première
// réponse (fixtures/defective-candidates/auth-csrf-write-unchecked) : le
// rejeu ouvre lui-même la session, et prend le jeton qui va avec son cookie.
describe("replayUnit", () => {
  const page = (token: string) => `<html><head>\n<meta name="csrf-token" content="${token}"></head><body>D-0119</body></html>`;
  const SOURCE_TOKEN = "a".repeat(64);
  const home = { method: "GET", url: `${CANDIDATE}/`, headers: {}, body: null };
  const post = { method: "POST", url: `${CANDIDATE}/enregistrer.do`, headers: { cookie: "csrf-session=source0000", "content-type": "application/x-www-form-urlencoded" }, body: `_csrf=${SOURCE_TOKEN}&number=D-0119` };
  const unit: ReplayUnit = {
    source: "path:agent",
    role: "agent",
    path: true,
    requests: [
      { request: home, received: { cookies: [], responses: [] } },
      { request: post, received: { cookies: [{ name: "csrf-session", value: "source0000" }], responses: [{ method: "GET", url: `${CANDIDATE}/`, headers: [], body: page(SOURCE_TOKEN) }] } },
    ],
  };
  // Une nouvelle session par cookie absent, et son jeton dans chaque page.
  const fakeCandidate = () => {
    const received: { method: string; cookie: string | undefined; body: string | null }[] = [];
    let sessions = 0;
    const send = async (request: { method: string; headers: Record<string, string>; body: string | null }) => {
      received.push({ method: request.method, cookie: request.headers.cookie, body: request.body });
      if (request.headers.cookie === undefined) {
        sessions += 1;
        return { status: 401, headers: [{ name: "Set-Cookie", value: `csrf-session=fresh${sessions}; Path=/` }], body: page(`${"b".repeat(63)}${sessions}`) };
      }
      return { status: 302, headers: [], body: "" };
    };
    return { received, send };
  };

  it("sends the cookie set by its own first response, with the token that goes with it", async () => {
    const candidate = fakeCandidate();
    const { replay, bound } = await replayUnit(unit, { authorization: null, sessionBound: [new Set(), new Set(["form:_csrf"])], numbers: NUMBERS, send: candidate.send });
    expect(candidate.received[1]).toEqual({ method: "POST", cookie: "csrf-session=fresh1", body: `_csrf=${"b".repeat(63)}1&number=D-0119` });
    expect(replay.responses.map(({ status, numbers }) => [status, numbers])).toEqual([[401, ["D-0119"]], [302, []]]);
    expect(bound.map((set) => [...set].sort())).toEqual([[], ["cookie:csrf-session", "form:_csrf"]]);
  });
});

describe("numbersIn", () => {
  it("finds the numbers of the dataset in the HAR response of the search by status", () => {
    const body = HARS[0]!.har.log.entries[1]!.response.content.text ?? "";
    expect(numbersIn(body, NUMBERS).length).toBeGreaterThan(0);
  });

  it("finds none in the 401 responses of the legacy to the anonymous replay", () => {
    for (const { body, headers } of PROBE.replayNoCookie) expect(numbersIn(`${body}\n${headers.join("\n")}`, NUMBERS)).toEqual([]);
  });

  it("finds a whole number only, of the dataset only", () => {
    expect(numbersIn("D-0001 D-00011 xD-0002 D-9999 D-0003", NUMBERS)).toEqual(["D-0001", "D-0003"]);
  });
});

describe("authDossiersOf", () => {
  it("reads D-0119, BROUILLON, and D-0120, EN_INSTRUCTION, reserved to gate:auth, with their subjects", () => {
    expect(authDossiersOf(DATASET)).toEqual({
      draft: { number: "D-0119", subject: "Demande d'installation d'une enseigne lumineuse" },
      awaiting: { number: "D-0120", subject: "Déclaration d'une clôture en limite de propriété" },
    });
  });

  it("refuses a gate:auth without a BROUILLON", () => {
    const parsed = JSON.parse(DATASET) as { dossiers: { number: string; status: string }[] };
    const changed = { ...parsed, dossiers: parsed.dossiers.map((dossier) => (dossier.number === "D-0119" ? { ...dossier, status: "EN_INSTRUCTION" } : dossier)) };
    expect(() => authDossiersOf(JSON.stringify(changed))).toThrow("gate:auth must reserve one BROUILLON and one EN_INSTRUCTION");
  });
});

// États des dossiers de gate:auth : le jeu de données, puis ce qu'en fait la
// sonde de #132 en agent et en instructeur.
const INITIAL = { "D-0119": { status: "BROUILLON", subject: "a" }, "D-0120": { status: "EN_INSTRUCTION", subject: "b" } };
const WRITTEN = { "D-0119": { status: "BROUILLON", subject: "a (modifié)" }, "D-0120": { status: "REMIS", subject: "b (modifié)" } };
const response = (numbers: string[] = []) => ({ unit: "gate:instructeur", method: "GET", url: `${CANDIDATE}/fiche.do?number=D-0120`, status: numbers.length > 0 ? 200 : 401, numbers });
const replay = (fields: Partial<Replay> = {}): Replay => ({ requests: 20, pathRequests: 13, responses: [response()], values: [], before: INITIAL, after: INITIAL, ...fields });
// Le legacy : 401 partout sans identifiants ; le contrôle lit des numéros et écrit.
const LEGACY: AuthObservation = { skipped: 1, anonymous: replay(), control: replay({ responses: [response(["D-0120"])], after: WRITTEN }) };
const RAW = { "gates/auth-check/anonymous.json": "sha256:anonymous" };
const outcomes = (observation: AuthObservation) => authResults(observation, RAW).map(({ name, outcome, examined }) => [name, outcome, examined]);

describe("authResults", () => {
  it("passes both on the legacy", () => {
    expect(outcomes(LEGACY)).toEqual([
      ["auth-read", "passed", 20],
      ["auth-write", "passed", 13],
    ]);
  });

  it("fails auth-read when an anonymous response holds a number, and cites it", () => {
    const [read] = authResults({ ...LEGACY, anonymous: replay({ responses: [response(["D-0001"])] }) }, RAW);
    expect(read?.outcome).toBe("failed");
    expect(read?.findings).toContainEqual(response(["D-0001"]));
  });

  it("makes auth-read not-evaluable when no response of the control holds a number, unless a leak is seen", () => {
    const [read] = authResults({ ...LEGACY, control: replay({ after: WRITTEN }) }, RAW);
    expect(read?.outcome).toBe("not-evaluable");
    expect(read?.findings).toContainEqual({ message: NO_CONTROL_NUMBER });
    expect(authResults({ ...LEGACY, control: replay({ after: WRITTEN }), anonymous: replay({ responses: [response(["D-0001"])] }) }, RAW)[0]?.outcome).toBe("failed");
  });

  it("fails auth-write when the anonymous replay changes a dossier, and cites it", () => {
    const [, write] = authResults({ ...LEGACY, anonymous: replay({ after: WRITTEN }) }, RAW);
    expect(write?.outcome).toBe("failed");
    expect(write?.findings).toContainEqual({ number: "D-0120", before: INITIAL["D-0120"], after: WRITTEN["D-0120"] });
    expect(write?.values).toMatchObject({ changedByReplay: 2, changedByControl: 2 });
  });

  it("makes auth-write not-evaluable when the control changes no dossier, unless the anonymous replay does", () => {
    const [, write] = authResults({ ...LEGACY, control: replay({ responses: [response(["D-0120"])] }) }, RAW);
    expect(write?.outcome).toBe("not-evaluable");
    expect(write?.findings).toContainEqual({ message: NO_CONTROL_WRITE });
    expect(authResults({ ...LEGACY, control: replay(), anonymous: replay({ after: WRITTEN }) }, RAW)[1]?.outcome).toBe("failed");
  });

  it("makes both not-evaluable when nothing was replayed", () => {
    const nothing = replay({ requests: 0, pathRequests: 0, responses: [] });
    expect(outcomes({ skipped: 0, anonymous: nothing, control: nothing })).toEqual([
      ["auth-read", "not-evaluable", 0],
      ["auth-write", "not-evaluable", 0],
    ]);
  });
});

describe("auth gate", () => {
  it("declares two judged results, in the group of the gates that write, never named auth alone", () => {
    expect(authGate).toMatchObject({ name: "auth-check", group: "writes" });
    expect(Object.entries(authGate.results)).toEqual([
      ["auth-read", "judged"],
      ["auth-write", "judged"],
    ]);
  });
});
