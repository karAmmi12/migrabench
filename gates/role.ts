// Porte de rôle (spec de l'étape 4, « Rôle », TRAPS.md « Contrôle de rôle dans
// la vue ») : la remise de `D-0112` (`gate:role`), réservée aux instructeurs,
// ne doit pas être possible en agent, ni par le rejeu de la requête de
// l'instructeur, ni par l'écran de remise atteint directement.
//
// 1. L'enregistrement : l'instructeur va de BASE_URL jusqu'à la remise du
//    dossier, par clics, puis clique sur « Remettre ». Chaque requête émise
//    vers le candidat après le clic, jusqu'au repos du réseau, est
//    enregistrée, et l'API interne doit confirmer la remise. Sans cela, les
//    trois résultats sont `not-evaluable`, sans aucun redémarrage.
// 2. Trois tentatives, chacune après un redémarrage du legacy
//    (`restartLegacy()`, qui recrée aussi le candidat et le navigateur) :
//    - `role-replay-control` : une nouvelle session d'instructeur refait la
//      navigation jusqu'à la remise, sans cliquer, puis les requêtes
//      enregistrées sont rejouées dans l'ordre, transplantées dans cette
//      session (gates/role-transplant.ts). Réussi si le dossier est remis ;
//    - `role-replay` : la même chose dans une session d'agent. Réussi si le
//      dossier reste `EN_INSTRUCTION`. Si le contrôle n'a pas remis le
//      dossier, `not-evaluable` avec le constat NOT_REPLAYABLE ; un dossier
//      remis par l'agent reste `failed` (#153) ;
//    - `role-forced-browsing` : en agent, l'URL de l'écran de remise si elle
//      diffère de BASE_URL et de la fiche, puis le chemin par clics. Toute
//      tentative qui n'aboutit pas à un bouton « Remettre » cliquable (clic
//      d'essai de Playwright, sans effet) est un refus.
// `examined` : le nombre de requêtes rejouées pour les deux rejeux, le nombre
// de tentatives pour l'accès direct.
//
// Le rejeu part du banc, en HTTP, sans suivre les redirections : chaque
// requête enregistrée, redirections comprises, est rejouée une fois. Il ne
// demande aucune compression (`accept-encoding` retiré), pour que les
// réponses rejouées soient lisibles comme ce que la session a reçu.
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { connectBenchBrowser } from "../oracle/browser.ts";
import { button, goToSheet, goToSubmissionFromSheet, remiseLink } from "../oracle/navigation.ts";
import { parseUsersWithoutUnknown, type Role } from "../scripts/users.ts";
import { ROOT } from "../shared/root.ts";
import type { GateContext } from "./context.ts";
import type { Gate } from "./registry.ts";
import { saveGateRaw } from "./raw.ts";
import { judged, type JudgedResult } from "./result.ts";
import { type Received, type ReceivedResponse, type RecordedRequest, type TransplantedValue, transplant } from "./role-transplant.ts";
import { settle, trackNetwork } from "./settle.ts";

// Jamais `role` seul : vocabulaire Java EE que la copie expurgée garde
// (décision de Karim du 26/11 sur #125, tests/legacy-copy/legacy-copy-real.test.ts).
const GATE = "role-check";

export const NOT_REPLAYABLE = "transformation de session non rejouable : jeton probablement dérivé côté client";

// Délai de conception de la porte : l'enregistrement, trois redémarrages de
// la pile et du candidat, chacun sous le délai de disponibilité, et trois
// sessions de navigateur. Étalonné par #100.
const ROLE_TIMEOUT_MS = 15 * 60_000;
// Clic d'essai sur un bouton « Remettre » : au-delà, il n'est pas cliquable.
const TRIAL_CLICK_TIMEOUT_MS = 2_000;
// Délai d'une requête rejouée. Valeur de conception.
const REPLAY_TIMEOUT_MS = 30_000;
// En-têtes de la requête enregistrée que le rejeu ne renvoie pas : posés par
// le transport, ou qui demanderaient une réponse compressée.
const NOT_REPLAYED_HEADERS = new Set(["host", "content-length", "connection", "accept-encoding", "keep-alive", "transfer-encoding"]);

// Une tentative de rejeu : requêtes rejouées, statut du dossier après, valeurs
// transplantées, réponses du candidat, et l'étape où la navigation de la
// session cible s'est arrêtée, s'il y en a une.
export interface ReplayAttempt {
  requests: number;
  statusAfter: string;
  values: (TransplantedValue & { request: number })[];
  responses: { method: string; url: string; status: number; error?: string }[];
  navigation?: { step: string; message: string };
}

export interface ForcedAttempt {
  attempt: "direct-url" | "clicks";
  url: string;
  clickable: boolean;
  unreached?: { step: string; message: string };
}

export type RoleObservation =
  | { recorded: false; step: string; message: string }
  | { recorded: true; control: ReplayAttempt; replay: ReplayAttempt; forced: ForcedAttempt[] };

const SUBMITTED = "REMIS";
const AWAITING = "EN_INSTRUCTION";

function replayValues({ requests, values }: ReplayAttempt): Record<string, number> {
  return { requests, transplanted: values.filter(({ found, changed }) => found && changed).length, removed: values.filter(({ found }) => !found).length };
}

function replayFindings(attempt: ReplayAttempt): unknown[] {
  return [{ statusAfter: attempt.statusAfter }, ...(attempt.navigation === undefined ? [] : [{ navigation: attempt.navigation }]), ...attempt.responses, ...attempt.values];
}

export function roleResults(observation: RoleObservation, raw: Record<string, string>): JudgedResult[] {
  if (!observation.recorded) {
    const findings = [{ unrecorded: observation.step, message: observation.message }];
    return ["role-replay-control", "role-replay", "role-forced-browsing"].map((name) => judged({ gate: GATE, name, examined: 0, passed: false, findings, raw }));
  }
  const { control, replay, forced } = observation;
  const controlPassed = control.statusAfter === SUBMITTED;
  const clickable = forced.filter((attempt) => attempt.clickable).length;
  return [
    judged({ gate: GATE, name: "role-replay-control", examined: control.requests, passed: controlPassed, findings: replayFindings(control), values: replayValues(control), raw }),
    judged({
      gate: GATE,
      name: "role-replay",
      examined: replay.requests,
      passed: replay.statusAfter === AWAITING,
      evaluable: controlPassed,
      findings: [...(controlPassed ? [] : [{ message: NOT_REPLAYABLE }]), ...replayFindings(replay)],
      values: replayValues(replay),
      raw,
    }),
    judged({ gate: GATE, name: "role-forced-browsing", examined: forced.length, passed: clickable === 0, findings: forced, values: { attempts: forced.length, clickable }, raw }),
  ];
}

// Dossier de `gate:role` et son objet, marqueur d'atteinte de la remise.
export function roleDossierOf(datasetJson: string): { number: string; subject: string } {
  const dataset = JSON.parse(datasetJson) as { dossiers: { number: string; subject: string; status: string }[]; reservations: Record<string, string[]> };
  const [number, ...others] = dataset.reservations["gate:role"] ?? [];
  if (number === undefined || others.length > 0) throw new Error("gate:role must reserve exactly one dossier");
  const dossier = dataset.dossiers.find((entry) => entry.number === number);
  if (dossier === undefined) throw new Error(`No dossier ${number} in the dataset`);
  if (dossier.status !== AWAITING) throw new Error(`${number} is ${dossier.status}, expected ${AWAITING}`);
  return { number, subject: dossier.subject };
}

type Credentials = Record<Role, { username: string; password: string }>;

interface Prepared {
  credentials: Credentials;
  number: string;
  subject: string;
}

const basic = ({ username, password }: { username: string; password: string }) => `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

// Lecture de l'API interne en échec : une erreur de la porte, jamais un enregistrement manqué.
class InternalApiFailed extends Error {}

async function statusOf(context: GateContext, number: string): Promise<string> {
  const response = await context.internalApi.get(`/api/dossiers/${number}`);
  if (response.status !== 200) throw new InternalApiFailed(`Internal API: dossier ${number} read with status ${response.status}`);
  return (JSON.parse(response.body) as { status: string }).status;
}

const firstLine = (error: unknown) => (error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error));

// Ce qu'une page reçoit, réponse par réponse, dans l'ordre d'arrivée, avec
// le rang de chaque événement (réponse ou requête) dans la session.
interface Watched {
  responses: (ReceivedResponse & { sequence: number })[];
  next(): number;
  // Attend la lecture de chaque corps reçu.
  done(): Promise<void>;
}

function watch(page: Page): Watched {
  const responses: Watched["responses"] = [];
  const pending: Promise<void>[] = [];
  let sequence = 0;
  page.on("response", (response) => {
    const entry: { method: string; url: string; headers: { name: string; value: string }[]; body: string | null; sequence: number } = { method: response.request().method(), url: response.url(), headers: [], body: null, sequence: sequence++ };
    responses.push(entry);
    pending.push(
      (async () => {
        try {
          entry.headers = await response.headersArray();
          entry.body = (await response.body()).toString("utf8");
        } catch {
          // Redirection, ou corps que le navigateur ne rend plus : non lu.
        }
      })(),
    );
  });
  return { responses, next: () => sequence++, done: async () => void (await Promise.all(pending)) };
}

async function withBrowser<T>(run: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await connectBenchBrowser();
  try {
    return await run(browser);
  } finally {
    await browser.close();
  }
}

async function newSession(browser: Browser, context: GateContext, credentials: { username: string; password: string }): Promise<{ browserContext: BrowserContext; page: Page }> {
  const browserContext = await browser.newContext({ baseURL: context.candidateUrl, httpCredentials: credentials });
  return { browserContext, page: await browserContext.newPage() };
}

const sameOrigin = (url: string, base: string) => new URL(url).origin === new URL(base).origin;

// Enregistrement : ce que l'instructeur a reçu avant chaque requête émise
// après son clic sur « Remettre ».
interface Recording {
  requests: (RecordedRequest & { sequence: number })[];
  cookies: Received["cookies"];
  responses: Watched["responses"];
  sheetUrl: string;
  remiseUrl: string;
}

class Unrecorded extends Error {
  readonly step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
  }
}

async function record(context: GateContext, prepared: Prepared): Promise<{ recording: Recording } | { step: string; message: string }> {
  return withBrowser(async (browser) => {
    const { browserContext, page } = await newSession(browser, context, prepared.credentials.instructeur);
    const watched = watch(page);
    const inFlight = trackNetwork(page);
    let step = "search";
    try {
      await goToSheet(page, prepared.number);
      const sheetUrl = page.url();
      step = `remise ${prepared.number}`;
      await goToSubmissionFromSheet(page, prepared.subject);
      const remiseUrl = page.url();
      await settle(page, inFlight);
      step = "Remettre";
      const before = await statusOf(context, prepared.number);
      if (before !== AWAITING) throw new Unrecorded(step, `${prepared.number} is ${before} before the click, expected ${AWAITING}`);
      const cookies = (await browserContext.cookies(context.candidateUrl)).map(({ name, value }) => ({ name, value }));
      const requests: Recording["requests"] = [];
      const reading: Promise<void>[] = [];
      page.on("request", (request) => {
        if (!sameOrigin(request.url(), context.candidateUrl)) return;
        const entry = { method: request.method(), url: request.url(), headers: {} as Record<string, string>, body: request.postData(), sequence: watched.next() };
        requests.push(entry);
        reading.push(request.allHeaders().then((headers) => void (entry.headers = headers)));
      });
      await button(page, "Remettre").click({ timeout: TRIAL_CLICK_TIMEOUT_MS * 5 });
      await settle(page, inFlight);
      await Promise.all(reading);
      await watched.done();
      if (requests.length === 0) throw new Unrecorded(step, "No request to the candidate after the click on Remettre");
      const after = await statusOf(context, prepared.number);
      if (after !== SUBMITTED) throw new Unrecorded(step, `The internal API does not confirm the submission: ${prepared.number} is ${after}`);
      return { recording: { requests, cookies, responses: watched.responses, sheetUrl, remiseUrl } };
    } catch (error) {
      if (error instanceof Unrecorded) return { step: error.step, message: error.message };
      // Écran ou bouton non atteint : rien d'enregistré. Une erreur de l'API
      // interne reste une erreur de la porte.
      if (error instanceof InternalApiFailed) throw error;
      return { step, message: firstLine(error) };
    } finally {
      await browserContext.close();
    }
  });
}

interface Sent {
  status: number;
  headers: { name: string; value: string }[];
  body: string;
  error?: string;
}

function send(request: RecordedRequest, signal: AbortSignal): Promise<Sent> {
  const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !NOT_REPLAYED_HEADERS.has(name) && !name.startsWith(":")));
  const body = request.body === null ? undefined : Buffer.from(request.body, "utf8");
  if (body !== undefined) headers["content-length"] = String(body.length);
  return new Promise((resolve) => {
    const outgoing = httpRequest(request.url, { method: request.method, headers, signal, timeout: REPLAY_TIMEOUT_MS }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const pairs: { name: string; value: string }[] = [];
        for (let index = 0; index < response.rawHeaders.length; index += 2) pairs.push({ name: response.rawHeaders[index] ?? "", value: response.rawHeaders[index + 1] ?? "" });
        resolve({ status: response.statusCode ?? 0, headers: pairs, body: Buffer.concat(chunks).toString("utf8") });
      });
      response.on("error", (error) => resolve({ status: 0, headers: [], body: "", error: firstLine(error) }));
    });
    outgoing.on("timeout", () => outgoing.destroy(new Error(`No response within ${REPLAY_TIMEOUT_MS} ms`)));
    outgoing.on("error", (error) => resolve({ status: 0, headers: [], body: "", error: firstLine(error) }));
    outgoing.end(body);
  });
}

// Navigation de la session cible jusqu'à la remise, sans cliquer : le
// chemin de l'instructeur, ou l'URL de la remise si le lien manque. Ce
// qu'elle a reçu sert à la transplantation, même si elle s'est arrêtée.
async function targetSession(browser: Browser, context: GateContext, prepared: Prepared, recording: Recording, role: Role): Promise<{ received: Received; navigation?: { step: string; message: string } }> {
  const { browserContext, page } = await newSession(browser, context, prepared.credentials[role]);
  const watched = watch(page);
  const inFlight = trackNetwork(page);
  let step = "search";
  let navigation: { step: string; message: string } | undefined;
  try {
    await goToSheet(page, prepared.number);
    step = `remise ${prepared.number}`;
    if ((await remiseLink(page).count()) > 0) await remiseLink(page).first().click();
    else await page.goto(recording.remiseUrl);
    await settle(page, inFlight);
  } catch (error) {
    navigation = { step, message: firstLine(error) };
  }
  await watched.done();
  const cookies = (await browserContext.cookies(context.candidateUrl)).map(({ name, value }) => ({ name, value }));
  await browserContext.close();
  return { received: { cookies, responses: watched.responses }, ...(navigation === undefined ? {} : { navigation }) };
}

function applySetCookies(jar: Map<string, string>, headers: readonly { name: string; value: string }[]): void {
  for (const { name, value } of headers) {
    if (name.toLowerCase() !== "set-cookie") continue;
    const [pair = ""] = value.split(";");
    const equal = pair.indexOf("=");
    if (equal > 0) jar.set(pair.slice(0, equal).trim(), pair.slice(equal + 1).trim());
  }
}

async function replayAs(role: Role, context: GateContext, prepared: Prepared, recording: Recording): Promise<{ attempt: ReplayAttempt; raw: unknown }> {
  const { received: target, navigation } = await withBrowser((browser) => targetSession(browser, context, prepared, recording, role));
  const jar = new Map(target.cookies.map(({ name, value }) => [name, value]));
  const replayed: ReceivedResponse[] = [];
  const attempt: ReplayAttempt = { requests: 0, statusAfter: "", values: [], responses: [], ...(navigation === undefined ? {} : { navigation }) };
  const sentRequests: RecordedRequest[] = [];
  for (const [index, recorded] of recording.requests.entries()) {
    if (context.signal.aborted) throw new Error("Role gate aborted");
    const source: Received = { cookies: recording.cookies, responses: recording.responses.filter(({ sequence }) => sequence < recorded.sequence) };
    const targetNow: Received = { cookies: [...jar].map(([name, value]) => ({ name, value })), responses: [...target.responses, ...replayed] };
    const { request, values } = transplant(recorded, { source, target: targetNow, authorization: basic(prepared.credentials[role]) });
    const sent = await send(request, context.signal);
    sentRequests.push(request);
    attempt.requests += 1;
    attempt.values.push(...values.map((value) => ({ ...value, request: index })));
    attempt.responses.push({ method: request.method, url: request.url, status: sent.status, ...(sent.error === undefined ? {} : { error: sent.error }) });
    replayed.push({ method: request.method, url: request.url, headers: sent.headers, body: sent.body });
    applySetCookies(jar, sent.headers);
  }
  attempt.statusAfter = await statusOf(context, prepared.number);
  return { attempt, raw: { role, target, sent: sentRequests, replayed, attempt } };
}

// Un bouton « Remettre » cliquable : le clic d'essai de Playwright vérifie
// qu'il est visible, stable, actif et qu'il reçoit le clic, sans cliquer.
async function clickable(page: Page): Promise<boolean> {
  const buttons = button(page, "Remettre");
  for (let index = 0; index < (await buttons.count()); index += 1) {
    try {
      await buttons.nth(index).click({ trial: true, timeout: TRIAL_CLICK_TIMEOUT_MS });
      return true;
    } catch {
      // Pas cliquable : le suivant.
    }
  }
  return false;
}

// URL comparées sans paramètres de chemin (`;jsessionid=…`).
const comparable = (url: string) => {
  const parsed = new URL(url);
  parsed.pathname = parsed.pathname.replace(/;[^/]*/g, "");
  return parsed.toString();
};

async function forcedBrowsing(context: GateContext, prepared: Prepared, recording: Recording): Promise<ForcedAttempt[]> {
  return withBrowser(async (browser) => {
    const attempts: ForcedAttempt[] = [];
    const tryAs = async (attempt: ForcedAttempt["attempt"], reach: (page: Page) => Promise<void>) => {
      const { browserContext, page } = await newSession(browser, context, prepared.credentials.agent);
      const inFlight = trackNetwork(page);
      let unreached: ForcedAttempt["unreached"];
      try {
        await reach(page);
        await settle(page, inFlight);
      } catch (error) {
        unreached = { step: attempt, message: firstLine(error) };
      }
      attempts.push({ attempt, url: page.url(), clickable: await clickable(page), ...(unreached === undefined ? {} : { unreached }) });
      await browserContext.close();
    };
    const direct = comparable(recording.remiseUrl);
    if (direct !== comparable(new URL("/", context.candidateUrl).toString()) && direct !== comparable(recording.sheetUrl)) {
      await tryAs("direct-url", async (page) => void (await page.goto(recording.remiseUrl)));
    }
    await tryAs("clicks", async (page) => {
      await goToSheet(page, prepared.number);
      await goToSubmissionFromSheet(page, prepared.subject);
    });
    return attempts;
  });
}

export const roleGate: Gate<Prepared> = {
  name: GATE,
  group: "writes",
  results: { "role-replay-control": "judged", "role-replay": "judged", "role-forced-browsing": "judged" },
  timeoutMs: ROLE_TIMEOUT_MS,
  // Entrées du banc : ses identités et le dossier de `gate:role`.
  prepare: async () => {
    const users = parseUsersWithoutUnknown(readFileSync(`${ROOT}/fixtures/users.json`, "utf8"));
    const credential = (role: Role) => {
      const user = users.find((entry) => entry.role === role);
      if (user === undefined) throw new Error(`No user with role ${role} in fixtures/users.json`);
      return { username: user.username, password: user.password };
    };
    const dossier = roleDossierOf(readFileSync(`${ROOT}/fixtures/legacy-app/src/main/resources/dossiers.json`, "utf8"));
    return { credentials: { agent: credential("agent"), instructeur: credential("instructeur") }, ...dossier };
  },
  examine: async (context, prepared) => {
    const save = async (file: string, content: unknown) => saveGateRaw(context.rawDir, GATE, file, `${JSON.stringify(content, null, 2)}\n`);
    const recorded = await record(context, prepared);
    const recordingRaw = await save("recording.json", recorded);
    if (!("recording" in recorded)) return roleResults({ recorded: false, ...recorded }, Object.fromEntries([recordingRaw]));
    const { recording } = recorded;
    await context.restartLegacy();
    const control = await replayAs("instructeur", context, prepared, recording);
    const controlRaw = await save("control.json", control.raw);
    await context.restartLegacy();
    const replay = await replayAs("agent", context, prepared, recording);
    const replayRaw = await save("replay.json", replay.raw);
    await context.restartLegacy();
    const forced = await forcedBrowsing(context, prepared, recording);
    const forcedRaw = await save("forced-browsing.json", forced);
    return roleResults({ recorded: true, control: control.attempt, replay: replay.attempt, forced }, Object.fromEntries([recordingRaw, controlRaw, replayRaw, forcedRaw]));
  },
};
