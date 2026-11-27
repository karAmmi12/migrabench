// Porte d'authentification (spec de l'étape 4, « Authentification ») : aucune
// requête rejouée sans identifiants ne renvoie de données ni ne modifie un
// dossier.
//
// 1. Ce qui est rejoué, par unités (une session source chacune) :
//    - les `GET` et `HEAD` de chaque HAR de l'oracle vers l'origine du
//      candidat, une unité par scénario ; les autres méthodes sont comptées
//      dans `skipped` ;
//    - le parcours propre de la porte, enregistré : l'agent recherche le
//      `BROUILLON` de `gate:auth`, ouvre sa fiche et enregistre un nouvel
//      objet ; puis l'instructeur fait de même sur l'`EN_INSTRUCTION`, puis
//      le remet. Toutes les requêtes émises vers le candidat, quelle que soit
//      leur méthode. Une étape non atteinte arrête l'unité, ce qui a été
//      enregistré est gardé, et l'étape est citée.
// Chaque unité rejouée ouvre elle-même sa session : comme le scénario ou le
// parcours qu'elle rejoue, elle part d'un jar vide et commence par BASE_URL.
// Ce que cette session a reçu, réponses rejouées et cookies posés, sert à la
// transplantation (`replayUnit`).
// 2. Le legacy est redémarré, puis le **contrôle** rejoue les unités dans une
//    nouvelle session authentifiée. Il transplante toute valeur vue dans ce
//    que la session source a reçu (règle par défaut de gates/transplant.ts) :
//    c'est ce qui lui permet de relever lesquelles changent. L'agent pour les
//    unités des HAR, qui ne font que lire, et pour une unité du parcours,
//    l'utilisateur qui l'a enregistrée, seul à avoir le droit d'y écrire. Il
//    relève, requête par requête, les valeurs liées à la session : celles que
//    cette nouvelle session reçoit autrement (règle différentielle,
//    `sessionBoundValues` de gates/transplant.ts, décision de Karim du 27/11
//    sur #132).
// 3. Le legacy est redémarré, puis chaque unité est rejouée dans une session
//    **anonyme** (BASE_URL ouvert sans identifiants, par le rejeu) : jamais les cookies ni
//    l'`Authorization` de la session authentifiée ; les cookies et les valeurs
//    liées à la session sont transplantés depuis la session anonyme, et
//    retirés s'ils n'y existent pas (décision de Karim du 27/11 sur #132). Les
//    autres valeurs sont rejouées telles quelles.
//
// Les deux résultats jugés :
// - `auth-read` : aucune réponse rejouée sans identifiants (corps ou en-tête)
//   ne contient un numéro du jeu de données. Évaluable seulement si une
//   réponse du contrôle en contient un ; un numéro vu reste `failed` (#153).
//   `examined` : les requêtes rejouées ;
// - `auth-write` : l'état des dossiers de `gate:auth`, lu par l'API interne,
//   est le même avant et après le rejeu sans identifiants. Évaluable
//   seulement si le contrôle le change ; un dossier changé reste `failed`.
//   `examined` : les requêtes rejouées du parcours.
// Sans aucune requête à rejouer, rien n'est redémarré : `not-evaluable`.
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { button, field, goToSheet, goToSubmissionFromSheet } from "../oracle/navigation.ts";
import type { Role } from "../scripts/users.ts";
import { ROOT } from "../shared/root.ts";
import type { GateContext } from "./context.ts";
import { saveGateRaw } from "./raw.ts";
import type { Gate } from "./registry.ts";
import { applySetCookies, basic, benchCredentials, type Credentials, firstLine, newSession, sameOrigin, type Sent, send, watch, withBrowser } from "./replay.ts";
import { judged, type JudgedResult } from "./result.ts";
import { type Received, type ReceivedResponse, type RecordedRequest, sessionBoundValues, type TransplantedValue, transplant } from "./transplant.ts";
import { settle, trackNetwork } from "./settle.ts";
import type { Har } from "./witness-value.ts";

// Jamais `auth` seul : vocabulaire Java EE que la copie expurgée garde
// (décision de Karim du 26/11 sur #125, tests/legacy-copy/legacy-copy-real.test.ts).
const GATE = "auth-check";

export const NO_CONTROL_NUMBER = "aucune réponse du contrôle ne contient un numéro de dossier : lecture non rejouable";
export const NO_CONTROL_WRITE = "le contrôle n'a changé aucun dossier réservé à la porte : écriture non rejouable";

// Délai de conception de la porte : l'enregistrement, deux redémarrages de
// la pile et du candidat, chacun sous le délai de disponibilité, et deux
// rejeux de toutes les requêtes. Étalonné par #100.
const AUTH_TIMEOUT_MS = 10 * 60_000;
// Clic sur « Enregistrer » ou « Remettre », pendant l'enregistrement. Valeur de conception.
const CLICK_TIMEOUT_MS = 10_000;

// Une requête à rejouer, avec ce que sa session avait reçu avant elle.
export interface UnitRequest {
  request: RecordedRequest;
  received: Received;
}

// Une session source : un scénario de l'oracle, ou un utilisateur du parcours.
export interface ReplayUnit {
  source: string;
  // Utilisateur du contrôle.
  role: Role;
  // Unité du parcours de la porte, qui écrit.
  path: boolean;
  requests: UnitRequest[];
}

export interface ReplayedResponse {
  unit: string;
  method: string;
  url: string;
  status: number;
  // Numéros du jeu de données trouvés dans la réponse.
  numbers: string[];
  error?: string;
}

// Un rejeu : ses requêtes, celles du parcours, ses réponses, les valeurs
// transplantées, et l'état des dossiers de `gate:auth` avant et après.
export interface Replay {
  requests: number;
  pathRequests: number;
  responses: ReplayedResponse[];
  values: TransplantedValue[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

// Ce que rend le rejeu d'une unité, avant les états des dossiers.
type ReplayCounts = Pick<Replay, "requests" | "pathRequests" | "responses" | "values">;

export interface AuthObservation {
  skipped: number;
  // Étapes du parcours non atteintes.
  unreached?: { unit: string; step: string; message: string }[];
  anonymous: Replay;
  control: Replay;
}

interface DatasetView {
  dossiers: { number: string; subject: string; status: string }[];
  reservations: Record<string, string[]>;
}

export function datasetNumbersOf(datasetJson: string): string[] {
  return (JSON.parse(datasetJson) as DatasetView).dossiers.map(({ number }) => number);
}

// Dossiers de `gate:auth` : un `BROUILLON` et un `EN_INSTRUCTION`, avec leur objet.
export function authDossiersOf(datasetJson: string): { draft: { number: string; subject: string }; awaiting: { number: string; subject: string } } {
  const dataset = JSON.parse(datasetJson) as DatasetView;
  const reserved = (dataset.reservations["gate:auth"] ?? []).map((number) => dataset.dossiers.find((dossier) => dossier.number === number));
  const draft = reserved.filter((dossier) => dossier?.status === "BROUILLON");
  const awaiting = reserved.filter((dossier) => dossier?.status === "EN_INSTRUCTION");
  if (reserved.length !== 2 || draft.length !== 1 || awaiting.length !== 1) throw new Error("gate:auth must reserve one BROUILLON and one EN_INSTRUCTION");
  const pick = (dossier: DatasetView["dossiers"][number] | undefined) => ({ number: dossier?.number ?? "", subject: dossier?.subject ?? "" });
  return { draft: pick(draft[0]), awaiting: pick(awaiting[0]) };
}

// Numéros du jeu de données présents en entier dans un texte, sans doublon.
export function numbersIn(text: string, numbers: readonly string[]): string[] {
  const found = new Set(text.match(/(?<![\p{L}\p{N}_-])D-\d{4}(?![\p{L}\p{N}_])/gu) ?? []);
  return numbers.filter((number) => found.has(number));
}

// Cookies de l'en-tête `Cookie` d'une requête.
function cookiesOf(header: string | undefined): Received["cookies"] {
  return (header ?? "").split(/;\s*/).flatMap((pair) => {
    const equal = pair.indexOf("=");
    return equal <= 0 ? [] : [{ name: pair.slice(0, equal).trim(), value: pair.slice(equal + 1) }];
  });
}

// Corps d'une réponse du HAR, en texte ; absent si le HAR ne l'a pas gardé.
function harBody(content: { text?: string; encoding?: string }): string | null {
  if (content.text === undefined) return null;
  return content.encoding === "base64" ? Buffer.from(content.text, "base64").toString("utf8") : content.text;
}

// Unités des HAR de l'oracle : les `GET` et `HEAD` vers le candidat, chacune
// avec les réponses de son scénario qui la précèdent et les cookies qu'elle
// envoie. Les autres requêtes vers le candidat sont comptées dans `skipped`.
export function harUnits(hars: readonly { scenario: string; har: Har }[], candidateUrl: string): { units: ReplayUnit[]; skipped: number } {
  let skipped = 0;
  const units = hars.map(({ scenario, har }): ReplayUnit => {
    const responses: ReceivedResponse[] = [];
    const requests: UnitRequest[] = [];
    for (const entry of har.log.entries) {
      const { method, url } = entry.request;
      if (sameOrigin(url, candidateUrl)) {
        if (method === "GET" || method === "HEAD") {
          const headers: Record<string, string> = {};
          for (const { name, value } of entry.request.headers) {
            const lower = name.toLowerCase();
            headers[lower] = headers[lower] === undefined ? value : `${headers[lower]}${lower === "cookie" ? "; " : ", "}${value}`;
          }
          requests.push({ request: { method, url, headers, body: null }, received: { cookies: cookiesOf(headers.cookie), responses: [...responses] } });
        } else {
          skipped += 1;
        }
      }
      responses.push({ method, url, headers: entry.response.headers, body: harBody(entry.response.content) });
    }
    return { source: scenario, role: "agent", path: false, requests };
  });
  return { units, skipped };
}

const changed = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(before).filter((number) => JSON.stringify(before[number]) !== JSON.stringify(after[number]));

function countValues(values: readonly TransplantedValue[]): { transplanted: number; removed: number } {
  return { transplanted: values.filter(({ found, changed: differs }) => found && differs).length, removed: values.filter(({ found }) => !found).length };
}

export function authResults(observation: AuthObservation, raw: Record<string, string>): JudgedResult[] {
  const { anonymous, control, skipped, unreached = [] } = observation;
  const leaks = anonymous.responses.filter(({ numbers }) => numbers.length > 0);
  const controlRead = control.responses.some(({ numbers }) => numbers.length > 0);
  const changedByReplay = changed(anonymous.before, anonymous.after);
  const changedByControl = changed(control.before, control.after);
  return [
    judged({
      gate: GATE,
      name: "auth-read",
      examined: anonymous.requests,
      passed: leaks.length === 0,
      evaluable: controlRead,
      findings: [...leaks, ...(controlRead ? [] : [{ message: NO_CONTROL_NUMBER }])],
      values: { requests: anonymous.requests, skipped, ...countValues(anonymous.values) },
      raw,
    }),
    judged({
      gate: GATE,
      name: "auth-write",
      examined: anonymous.pathRequests,
      passed: changedByReplay.length === 0,
      evaluable: changedByControl.length > 0,
      findings: [
        ...changedByReplay.map((number) => ({ number, before: anonymous.before[number], after: anonymous.after[number] })),
        ...(changedByControl.length > 0 ? [] : [{ message: NO_CONTROL_WRITE }]),
        ...unreached,
      ],
      values: { requests: anonymous.pathRequests, dossiers: Object.keys(anonymous.before).length, changedByReplay: changedByReplay.length, changedByControl: changedByControl.length },
      raw,
    }),
  ];
}

interface Prepared {
  credentials: Record<Role, Credentials>;
  numbers: string[];
  draft: { number: string; subject: string };
  awaiting: { number: string; subject: string };
}

async function statesOf(context: GateContext, prepared: Prepared): Promise<Record<string, unknown>> {
  const states: Record<string, unknown> = {};
  for (const { number } of [prepared.draft, prepared.awaiting]) {
    const response = await context.internalApi.get(`/api/dossiers/${number}`);
    if (response.status !== 200) throw new Error(`Internal API: dossier ${number} read with status ${response.status}`);
    states[number] = JSON.parse(response.body) as unknown;
  }
  return states;
}

// Nouvel objet enregistré par le parcours.
const edited = (subject: string) => `${subject} (modifié)`;

// Parcours d'un utilisateur, enregistré : chaque requête vers le candidat,
// avec ce que la session avait reçu avant elle.
async function recordUnit(browser: Browser, context: GateContext, role: Role, credentials: Credentials, steps: (page: Page, setStep: (step: string) => void) => Promise<void>): Promise<{ unit: ReplayUnit; unreached?: { unit: string; step: string; message: string } }> {
  const source = `path:${role}`;
  const { browserContext, page } = await newSession(browser, context, credentials);
  const watched = watch(page);
  const inFlight = trackNetwork(page);
  const recorded: (RecordedRequest & { sequence: number })[] = [];
  const reading: Promise<void>[] = [];
  page.on("request", (request) => {
    if (!sameOrigin(request.url(), context.candidateUrl)) return;
    const entry = { method: request.method(), url: request.url(), headers: {} as Record<string, string>, body: request.postData(), sequence: watched.next() };
    recorded.push(entry);
    reading.push(request.allHeaders().then((headers) => void (entry.headers = headers)));
  });
  let step = "search";
  let unreached: { unit: string; step: string; message: string } | undefined;
  try {
    try {
      await steps(page, (next) => (step = next));
      await settle(page, inFlight);
    } catch (error) {
      unreached = { unit: source, step, message: firstLine(error) };
    }
    await Promise.all(reading);
    await watched.done();
  } finally {
    await browserContext.close();
  }
  const requests = recorded.map(({ sequence, ...request }) => ({ request, received: { cookies: cookiesOf(request.headers.cookie), responses: watched.responses.filter((response) => response.sequence < sequence) } }));
  return { unit: { source, role, path: true, requests }, ...(unreached === undefined ? {} : { unreached }) };
}

async function recordPath(context: GateContext, prepared: Prepared): Promise<{ units: ReplayUnit[]; unreached: { unit: string; step: string; message: string }[] }> {
  return withBrowser(async (browser) => {
    const save = async (page: Page, setStep: (step: string) => void, { number, subject }: { number: string; subject: string }) => {
      await goToSheet(page, number);
      setStep(`Enregistrer ${number}`);
      await field(page, "Objet").fill(edited(subject));
      await button(page, "Enregistrer").click({ timeout: CLICK_TIMEOUT_MS });
      await field(page, "Objet").waitFor({ state: "visible" });
    };
    const agent = await recordUnit(browser, context, "agent", prepared.credentials.agent, (page, setStep) => save(page, setStep, prepared.draft));
    const instructeur = await recordUnit(browser, context, "instructeur", prepared.credentials.instructeur, async (page, setStep) => {
      await save(page, setStep, prepared.awaiting);
      setStep(`remise ${prepared.awaiting.number}`);
      await goToSubmissionFromSheet(page, edited(prepared.awaiting.subject));
      setStep("Remettre");
      await button(page, "Remettre").click({ timeout: CLICK_TIMEOUT_MS });
    });
    return { units: [agent.unit, instructeur.unit], unreached: [agent.unreached, instructeur.unreached].flatMap((entry) => (entry === undefined ? [] : [entry])) };
  });
}

// Rejeu d'une unité, qui ouvre elle-même sa session : comme le scénario ou le
// parcours enregistré, elle part d'un jar vide et commence à BASE_URL. Ce
// qu'elle a reçu, réponses rejouées et cookies posés, sert à la
// transplantation. `sessionBound` : les valeurs liées à la session de chaque
// requête, par rang ; absent, la règle par défaut de gates/transplant.ts.
// Rend aussi les valeurs liées à la session relevées par ce rejeu (règle
// différentielle, `sessionBoundValues`).
export async function replayUnit(
  unit: ReplayUnit,
  options: { authorization: string | null; sessionBound?: readonly ReadonlySet<string>[]; numbers: readonly string[]; send: (request: RecordedRequest) => Promise<Sent>; aborted?: () => boolean },
): Promise<{ replay: ReplayCounts; bound: Set<string>[]; sent: unknown[] }> {
  const replay: ReplayCounts = { requests: 0, pathRequests: 0, responses: [], values: [] };
  const jar = new Map<string, string>();
  const replayed: ReceivedResponse[] = [];
  const bound: Set<string>[] = [];
  const sent: unknown[] = [];
  for (const [index, { request: recorded, received }] of unit.requests.entries()) {
    if (options.aborted?.() === true) throw new Error("Auth gate aborted");
    const target: Received = { cookies: [...jar].map(([name, value]) => ({ name, value })), responses: replayed };
    const sessionBound = options.sessionBound === undefined ? undefined : (options.sessionBound[index] ?? new Set<string>());
    const { request, values } = transplant(recorded, { source: received, target, authorization: options.authorization, ...(sessionBound === undefined ? {} : { sessionBound }) });
    const answer = await options.send(request);
    replay.requests += 1;
    if (unit.path) replay.pathRequests += 1;
    replay.values.push(...values);
    bound.push(sessionBoundValues(values));
    const numbers = numbersIn(`${answer.body}\n${answer.headers.map(({ name, value }) => `${name}: ${value}`).join("\n")}`, options.numbers);
    replay.responses.push({ unit: unit.source, method: request.method, url: request.url, status: answer.status, numbers, ...(answer.error === undefined ? {} : { error: answer.error }) });
    replayed.push({ method: request.method, url: request.url, headers: answer.headers, body: answer.body });
    applySetCookies(jar, answer.headers);
    sent.push({ request, values, status: answer.status, headers: answer.headers, body: answer.body });
  }
  return { replay, bound, sent };
}

// Rejoue chaque unité, avec l'`Authorization` que lui donne `authorizationFor`
// (null : sans identifiants), entre deux lectures de l'état des dossiers.
async function replayUnits(
  context: GateContext,
  prepared: Prepared,
  units: readonly ReplayUnit[],
  authorizationFor: (unit: ReplayUnit) => string | null,
  bound?: ReadonlyMap<string, readonly Set<string>[]>,
): Promise<{ replay: Replay; raw: unknown[]; bound: Map<string, Set<string>[]> }> {
  const replay: Replay = { requests: 0, pathRequests: 0, responses: [], values: [], before: await statesOf(context, prepared), after: {} };
  const raw: unknown[] = [];
  const observedBound = new Map<string, Set<string>[]>();
  for (const unit of units) {
    if (unit.requests.length === 0) continue;
    const done = await replayUnit(unit, {
      authorization: authorizationFor(unit),
      ...(bound === undefined ? {} : { sessionBound: bound.get(unit.source) ?? [] }),
      numbers: prepared.numbers,
      send: (request) => send(request, context.signal),
      aborted: () => context.signal.aborted,
    });
    replay.requests += done.replay.requests;
    replay.pathRequests += done.replay.pathRequests;
    replay.responses.push(...done.replay.responses);
    replay.values.push(...done.replay.values);
    observedBound.set(unit.source, done.bound);
    raw.push({ unit: unit.source, sent: done.sent });
  }
  replay.after = await statesOf(context, prepared);
  return { replay, raw, bound: observedBound };
}

export const authGate: Gate<Prepared> = {
  name: GATE,
  group: "writes",
  results: { "auth-read": "judged", "auth-write": "judged" },
  timeoutMs: AUTH_TIMEOUT_MS,
  // Entrées du banc : ses identités, les numéros du jeu de données et les dossiers de `gate:auth`.
  prepare: async () => {
    const dataset = readFileSync(`${ROOT}/fixtures/legacy-app/src/main/resources/dossiers.json`, "utf8");
    return { credentials: benchCredentials(), numbers: datasetNumbersOf(dataset), ...authDossiersOf(dataset) };
  },
  examine: async (context, prepared) => {
    const save = async (file: string, content: unknown) => saveGateRaw(context.rawDir, GATE, file, `${JSON.stringify(content, null, 2)}\n`);
    const hars = await Promise.all(context.oracle.harFiles.map(async (file) => ({ scenario: basename(dirname(file)), har: JSON.parse(await readFile(file, "utf8")) as Har })));
    const { units: harUnitList, skipped } = harUnits(hars, context.candidateUrl);
    const path = await recordPath(context, prepared);
    const units = [...harUnitList, ...path.units];
    const recordingRaw = await save("recording.json", { skipped, unreached: path.unreached, units: path.units });
    if (units.every(({ requests }) => requests.length === 0)) {
      const states = await statesOf(context, prepared);
      const nothing: Replay = { requests: 0, pathRequests: 0, responses: [], values: [], before: states, after: states };
      return authResults({ skipped, unreached: path.unreached, anonymous: nothing, control: nothing }, Object.fromEntries([recordingRaw]));
    }
    await context.restartLegacy();
    const control = await replayUnits(context, prepared, units, ({ role }) => basic(prepared.credentials[role]));
    const bound = Object.fromEntries([...control.bound].map(([unit, sets]) => [unit, sets.map((set) => [...set])]));
    const controlRaw = await save("control.json", { sessionBound: bound, replay: control.replay, units: control.raw });
    await context.restartLegacy();
    const anonymous = await replayUnits(context, prepared, units, () => null, control.bound);
    const anonymousRaw = await save("anonymous.json", { replay: anonymous.replay, units: anonymous.raw });
    return authResults({ skipped, unreached: path.unreached, anonymous: anonymous.replay, control: control.replay }, Object.fromEntries([recordingRaw, controlRaw, anonymousRaw]));
  },
};
