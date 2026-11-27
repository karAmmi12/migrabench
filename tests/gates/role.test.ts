// Porte de rôle (spec de l'étape 4, « Rôle ») : transplantation d'une requête
// enregistrée vers une autre session, et jugement des trois résultats,
// fonctions pures. Les requêtes, réponses et cookies du legacy sont ceux
// relevés par la sonde de #131 (tests/fixtures/probe131-6e514ab/PROVENANCE.md).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NOT_REPLAYABLE, type ReplayAttempt, type RoleObservation, roleDossierOf, roleGate, roleResults } from "../../gates/role.ts";
import { type Received, type RecordedRequest, transplant } from "../../gates/role-transplant.ts";
import { readJsonFixture } from "../real-fixtures.ts";

interface ProbeSession {
  responses: (Received["responses"][number] & { afterClick: boolean })[];
  posted: RecordedRequest[];
  cookies: Received["cookies"];
}
const PROBE = readJsonFixture<{ instructeur: ProbeSession; agent: ProbeSession }>("probe131-6e514ab/probe-output.json");

// Ce que chaque session a reçu avant le clic sur « Remettre ».
const received = (session: ProbeSession): Received => ({ cookies: session.cookies, responses: session.responses.filter(({ afterClick }) => !afterClick) });
const INSTRUCTEUR = received(PROBE.instructeur);
const AGENT = received(PROBE.agent);
const [POST] = PROBE.instructeur.posted;
const AGENT_AUTHORIZATION = `Basic ${Buffer.from("agent:agent-mb").toString("base64")}`;

describe("transplant, on the legacy", () => {
  it("replaces Authorization and the session cookie with those of the agent, and keeps the dossier number", () => {
    const { request } = transplant(POST!, { source: INSTRUCTEUR, target: AGENT, authorization: AGENT_AUTHORIZATION });
    const agentSession = PROBE.agent.cookies.find(({ name }) => name === "JSESSIONID")!.value;
    expect(request).toMatchObject({ method: "POST", url: "http://127.0.0.1:8080/remettre.do", body: "number=D-0112" });
    expect(request.headers.authorization).toBe(AGENT_AUTHORIZATION);
    expect(request.headers.cookie).toBe(`JSESSIONID=${agentSession}`);
  });
});

describe("transplant, of a session id in the path", () => {
  // Requête réelle de la recherche : l'URL cite le premier JSESSIONID, posé
  // par la réponse de BASE_URL et repris dans l'action du formulaire.
  it("takes the id of the target from the same place of the page of BASE_URL", () => {
    const [home, search] = PROBE.instructeur.responses;
    const request: RecordedRequest = { method: "GET", url: search!.url, headers: {}, body: null };
    const source: Received = { cookies: [], responses: [home!] };
    const target: Received = { cookies: [], responses: [PROBE.agent.responses[0]!] };
    const agentFirstSession = /;jsessionid=([0-9A-F]+)/.exec(PROBE.agent.responses[1]!.url)![1];
    const { request: replayed, values } = transplant(request, { source, target, authorization: AGENT_AUTHORIZATION });
    expect(replayed.url).toBe(`http://127.0.0.1:8080/rechercher.do;jsessionid=${agentFirstSession}?number=D-0112&applicant=&status=&filedFrom=&filedTo=`);
    expect(values.find(({ where }) => where === "path:jsessionid")).toMatchObject({ found: true, changed: true, place: { kind: "response", response: "GET /", part: "body" } });
  });
});

// Candidat avec jeton anti-CSRF : la page de remise du legacy, un jeton par
// session dans un <meta> en tête de page, repris par le formulaire.
const withToken = (session: ProbeSession, token: string | undefined): Received => {
  const base = received(session);
  return {
    ...base,
    responses: base.responses.map((response) =>
      response.body === null || token === undefined ? response : { ...response, body: response.body.replace("<head>", `<head>\n<meta name="csrf-token" content="${token}">`) },
    ),
  };
};
const TOKEN_INSTRUCTEUR = "3f9a1c0e7b5d4a2f";
const TOKEN_AGENT = "c81d2e4f6a0b9e7d";
const CSRF_POST: RecordedRequest = { ...POST!, headers: { ...POST!.headers, "x-csrf-token": TOKEN_INSTRUCTEUR, "x-requested-with": "XMLHttpRequest" }, body: `number=D-0112&_csrf=${TOKEN_INSTRUCTEUR}` };

describe("transplant, of an anti-CSRF token", () => {
  it("takes the token of the target from the same place, in the body and in a header, and keeps a value never received", () => {
    const { request, values } = transplant(CSRF_POST, { source: withToken(PROBE.instructeur, TOKEN_INSTRUCTEUR), target: withToken(PROBE.agent, TOKEN_AGENT), authorization: AGENT_AUTHORIZATION });
    expect(request.body).toBe(`number=D-0112&_csrf=${TOKEN_AGENT}`);
    expect(request.headers["x-csrf-token"]).toBe(TOKEN_AGENT);
    expect(request.headers["x-requested-with"]).toBe("XMLHttpRequest");
    expect(values.filter(({ changed }) => changed).map(({ where }) => where).sort()).toEqual(["cookie:JSESSIONID", "form:_csrf", "header:x-csrf-token"]);
  });

  it("removes the token when the target session has none at the same place", () => {
    const { request, values } = transplant(CSRF_POST, { source: withToken(PROBE.instructeur, TOKEN_INSTRUCTEUR), target: withToken(PROBE.agent, undefined), authorization: AGENT_AUTHORIZATION });
    expect(request.body).toBe("number=D-0112");
    expect(request.headers["x-csrf-token"]).toBeUndefined();
    expect(values.find(({ where }) => where === "form:_csrf")).toMatchObject({ found: false });
  });

  it("always sets Authorization, even on a request sent without it", () => {
    const { authorization: _authorization, ...headers } = POST!.headers;
    expect(transplant({ ...POST!, headers }, { source: INSTRUCTEUR, target: AGENT, authorization: AGENT_AUTHORIZATION }).request.headers.authorization).toBe(AGENT_AUTHORIZATION);
  });
});

// Tentatives observées : statut de D-0112 lu par l'API interne après le rejeu.
const attempt = (statusAfter: string): ReplayAttempt => ({ requests: 2, statusAfter, values: [], responses: [] });
const REFUSED = [
  { attempt: "direct-url" as const, url: "http://127.0.0.1:8100/remise.do?number=D-0112", clickable: false },
  { attempt: "clicks" as const, url: "http://127.0.0.1:8100/remise.do?number=D-0112", clickable: false },
];
// Le legacy : le contrôle et le rejeu en agent remettent le dossier (sonde de
// #131, `afterAgentReplay`), l'agent ne voit aucun bouton « Remettre ».
const LEGACY: RoleObservation = { recorded: true, control: attempt("REMIS"), replay: attempt("REMIS"), forced: REFUSED };
const RAW = { "gates/role-check/recording.json": "sha256:recording" };
const outcomes = (observation: RoleObservation) => roleResults(observation, RAW).map(({ name, outcome, examined }) => [name, outcome, examined]);

describe("roleResults", () => {
  it("fails role-replay on the legacy, the control and the forced browsing passed", () => {
    expect(outcomes(LEGACY)).toEqual([
      ["role-replay-control", "passed", 2],
      ["role-replay", "failed", 2],
      ["role-forced-browsing", "passed", 2],
    ]);
  });

  it("passes the three when the replay as agent leaves the dossier EN_INSTRUCTION", () => {
    expect(outcomes({ ...LEGACY, replay: attempt("EN_INSTRUCTION") }).map(([, outcome]) => outcome)).toEqual(["passed", "passed", "passed"]);
  });

  it("makes role-replay not-evaluable, with its finding, when the control does not submit the dossier", () => {
    const [control, replay] = roleResults({ ...LEGACY, control: attempt("EN_INSTRUCTION"), replay: attempt("EN_INSTRUCTION") }, RAW);
    expect(control?.outcome).toBe("failed");
    expect(replay?.outcome).toBe("not-evaluable");
    expect(replay?.findings).toContainEqual({ message: NOT_REPLAYABLE });
    expect(NOT_REPLAYABLE).toBe("transformation de session non rejouable : jeton probablement dérivé côté client");
  });

  // Un échec constaté reste `failed` (#153), même sans contrôle réussi.
  it("keeps role-replay failed when the agent submits the dossier although the control did not", () => {
    expect(roleResults({ ...LEGACY, control: attempt("EN_INSTRUCTION") }, RAW)[1]?.outcome).toBe("failed");
  });

  it("fails the forced browsing when one attempt reaches a clickable Remettre", () => {
    const [direct, clicks] = REFUSED;
    const [, , forced] = roleResults({ ...LEGACY, forced: [{ ...direct!, clickable: true }, clicks!] }, RAW);
    expect(forced).toMatchObject({ outcome: "failed", examined: 2, values: { attempts: 2, clickable: 1 } });
    expect(forced?.findings).toContainEqual({ ...direct, clickable: true });
  });

  it("makes the three not-evaluable when the submission by the instructeur could not be recorded", () => {
    const results = roleResults({ recorded: false, step: "remise D-0112", message: "no Remettre button" }, RAW);
    expect(results.map(({ outcome, examined }) => [outcome, examined])).toEqual([
      ["not-evaluable", 0],
      ["not-evaluable", 0],
      ["not-evaluable", 0],
    ]);
    expect(results[0]?.findings).toEqual([{ unrecorded: "remise D-0112", message: "no Remettre button" }]);
  });
});

describe("role gate", () => {
  it("declares three judged results, in the group of the gates that write", () => {
    expect(roleGate).toMatchObject({ name: "role-check", group: "writes" });
    expect(Object.entries(roleGate.results)).toEqual([
      ["role-replay-control", "judged"],
      ["role-replay", "judged"],
      ["role-forced-browsing", "judged"],
    ]);
  });
});

describe("roleDossierOf", () => {
  const dataset = readFileSync(new URL("../../fixtures/legacy-app/src/main/resources/dossiers.json", import.meta.url), "utf8");

  it("reads D-0112, reserved to gate:role, and its subject", () => {
    expect(roleDossierOf(dataset)).toEqual({ number: "D-0112", subject: "Demande d'autorisation de « vide-grenier »" });
  });

  it("refuses a dossier of gate:role that is not EN_INSTRUCTION", () => {
    const parsed = JSON.parse(dataset) as { dossiers: { number: string; status: string }[] };
    const changed = { ...parsed, dossiers: parsed.dossiers.map((dossier) => (dossier.number === "D-0112" ? { ...dossier, status: "REMIS" } : dossier)) };
    expect(() => roleDossierOf(JSON.stringify(changed))).toThrow("D-0112 is REMIS, expected EN_INSTRUCTION");
  });
});
