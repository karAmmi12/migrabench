// Seam A : le relais du candidat de référence ne modifie rien des réponses du
// legacy (spec de l'étape 3, « Candidat de référence »), pour que son 100 %
// à l'oracle soit celui du legacy (règle 6 de PROTOCOL.md). Le relais tourne
// ici dans le processus du test, vers le port publié du legacy : c'est le
// même code (fixtures/reference-candidate/relay.js) que le candidat lance
// vers legacy:8080. Prérequis : `docker compose up -d --build --wait`.
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basicAuthHeader, LEGACY_URL, userWithRole } from "./legacy-client.ts";
import {
  captureResponse,
  compareResponses,
  sessionIdsOutsideFormat,
  type CapturedResponse,
  type CaptureRequest,
} from "./relay-fidelity.ts";

interface RelayModule {
  createRelay(target: { host: string; port: number }): Server;
}

// Import par une adresse calculée : relay.js est du JavaScript sans types.
const RELAY_MODULE = new URL("../../fixtures/reference-candidate/relay.js", import.meta.url).href;
// Candidat défectueux 6 : le test négatif de la comparaison.
const ALTERING_RELAY_MODULE = new URL(
  "../../fixtures/defective-candidates/relay-alters-label/relay.js",
  import.meta.url,
).href;

/** Lance le relais du module vers le port publié du legacy ; rend son adresse. */
async function startRelay(module: string): Promise<{ server: Server; url: string }> {
  const { createRelay } = (await import(module)) as RelayModule;
  const legacy = new URL(LEGACY_URL);
  const server = createRelay({ host: legacy.hostname, port: Number(legacy.port) });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

const started: Server[] = [];
let relayUrl: string;
let alteringRelayUrl: string;

beforeAll(async () => {
  const relay = await startRelay(RELAY_MODULE);
  started.push(relay.server);
  relayUrl = relay.url;
  const altering = await startRelay(ALTERING_RELAY_MODULE);
  started.push(altering.server);
  alteringRelayUrl = altering.url;
});

afterAll(async () => {
  await Promise.all(started.map((server) => new Promise((resolve) => server.close(resolve))));
});

const AGENT = { Authorization: basicAuthHeader(userWithRole("agent")) };
const INSTRUCTEUR = { Authorization: basicAuthHeader(userWithRole("instructeur")) };

// Pages des trois écrans pour chaque rôle, servies après authentification.
// Lectures seules, sur les dossiers partagés. Le legacy ne sert aucune
// ressource statique (ni feuille de style, ni script, ni image) : la seule
// réponse hors page est le 404 de Tomcat, comparée avec les refus.
const AUTHENTICATED = [
  { name: "search screen, agent", path: "/recherche.do", headers: AGENT },
  { name: "search screen, instructeur", path: "/recherche.do", headers: INSTRUCTEUR },
  { name: "search results", path: "/rechercher.do?number=D-0001", headers: AGENT },
  { name: "dossier sheet, agent", path: "/fiche.do?number=D-0001", headers: AGENT },
  { name: "dossier sheet, instructeur", path: "/fiche.do?number=D-0003", headers: INSTRUCTEUR },
  { name: "submission screen, agent", path: "/remise.do?number=D-0003", headers: AGENT },
  { name: "submission screen, instructeur", path: "/remise.do?number=D-0003", headers: INSTRUCTEUR },
] as const;

// Refus du legacy : 401 sans identifiants, 404 d'un chemin inconnu.
const REFUSED = [
  { name: "root, no credentials", path: "/", headers: {}, status: 401 },
  { name: "dossier sheet, no credentials", path: "/fiche.do?number=D-0001", headers: {}, status: 401 },
  { name: "unknown path", path: "/favicon.ico", headers: AGENT, status: 404 },
] as const;

function both(path: string, init: CaptureRequest = {}): Promise<[CapturedResponse, CapturedResponse]> {
  return Promise.all([captureResponse(`${LEGACY_URL}${path}`, init), captureResponse(`${relayUrl}${path}`, init)]);
}

/** Le cookie de session que pose une réponse, à renvoyer tel quel. */
function sessionCookie(response: CapturedResponse): string {
  const index = response.rawHeaders.findIndex(
    (value, position) => position % 2 === 0 && value.toLowerCase() === "set-cookie",
  );
  const setCookie = response.rawHeaders[index + 1];
  if (index < 0 || setCookie === undefined) throw new Error("The legacy set no session cookie");
  return setCookie.split(";")[0] ?? "";
}

describe("reference relay, compared with the legacy served directly", () => {
  describe.each(AUTHENTICATED)("$name", ({ path, headers }) => {
    // Sans cookie, chaque côté ouvre sa session et Tomcat réécrit les liens
    // avec son identifiant : seule sa valeur est masquée.
    it("answers a client without a session cookie like the legacy, session id of the links masked", async () => {
      const [direct, relayed] = await both(path, { headers });

      expect(direct.status).toBe(200);
      expect(sessionIdsOutsideFormat(direct.body)).toEqual([]);
      expect(compareResponses(direct, relayed, { maskSessionIds: true })).toEqual([]);
    });

    // Dans une session ouverte, plus de réécriture : comparaison stricte. La
    // session est ouverte sur l'écran de recherche, qui en crée une.
    it("answers a client inside its session like the legacy, byte for byte", async () => {
      const [directOpening, relayedOpening] = await both("/recherche.do", { headers });
      const [direct, relayed] = await Promise.all([
        captureResponse(`${LEGACY_URL}${path}`, { headers: { ...headers, Cookie: sessionCookie(directOpening) } }),
        captureResponse(`${relayUrl}${path}`, { headers: { ...headers, Cookie: sessionCookie(relayedOpening) } }),
      ]);

      expect(direct.status).toBe(200);
      expect(compareResponses(direct, relayed)).toEqual([]);
    });
  });

  it.each(REFUSED)("refuses like the legacy: $name", async ({ path, headers, status }) => {
    const [direct, relayed] = await both(path, { headers });

    expect(direct.status).toBe(status);
    expect(compareResponses(direct, relayed)).toEqual([]);
  });

  it("serves pages whose links carry a session id, so that the mask is exercised", async () => {
    const [direct] = await both("/recherche.do", { headers: AGENT });

    expect(direct.body.toString("latin1")).toContain(";jsessionid=");
  });

  // Test négatif : le candidat défectueux 6 change le libellé « Demandeur ».
  it("finds the label changed by defective candidate 6 on the dossier sheet", async () => {
    const path = "/fiche.do?number=D-0001";
    const [direct, altered] = await Promise.all([
      captureResponse(`${LEGACY_URL}${path}`, { headers: AGENT }),
      captureResponse(`${alteringRelayUrl}${path}`, { headers: AGENT }),
    ]);

    expect(direct.status).toBe(200);
    expect(compareResponses(direct, altered, { maskSessionIds: true })).toContainEqual(
      expect.stringMatching(/^body: first difference at byte \d+/),
    );
  });
});

describe("reference relay, on a real redirect of the legacy", () => {
  // D-0117, BROUILLON, réservé à ce test (test:relay-fidelity dans le jeu de
  // données, vérifié par tests/seam-b). L'enregistrement renvoie ses valeurs
  // actuelles, lues dans le jeu de données : il ne change rien, et le test
  // peut tourner sans redémarrage.
  const RESERVED = reservedDossier("D-0117");

  it("redirects to the candidate port after a save, and the redirect is followed through the relay", async () => {
    const saved = await captureResponse(`${relayUrl}/enregistrer.do`, {
      method: "POST",
      headers: { ...AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(RESERVED).toString(),
    });

    expect(saved.status).toBe(302);
    const locationAt = saved.rawHeaders.findIndex(
      (value, position) => position % 2 === 0 && value.toLowerCase() === "location",
    );
    const location = saved.rawHeaders[locationAt + 1];
    if (locationAt < 0 || location === undefined) throw new Error("The redirect has no Location header");
    // Absolue (Host d'origine conservé) ou relative, comme Tomcat 9 le fait
    // par défaut : résolue comme le ferait un navigateur.
    const target = new URL(location, relayUrl);
    expect(target.origin).toBe(relayUrl);
    expect(target.pathname).toMatch(/^\/fiche\.do(;jsessionid=[0-9A-F]{32})?$/);
    expect(target.searchParams.get("number")).toBe(RESERVED.number);

    const followed = await captureResponse(target.href, { headers: AGENT });

    expect(followed.status).toBe(200);
    expect(followed.body.toString("utf8")).toContain("Fiche dossier");
    expect(followed.body.toString("utf8")).toContain(RESERVED.number);
  });
});

/** Numéro, demandeur et objet d'un dossier, tels que le jeu de données les charge. */
function reservedDossier(number: string): { number: string; applicant: string; subject: string } {
  const dataset = JSON.parse(
    readFileSync(new URL("../../fixtures/legacy-app/src/main/resources/dossiers.json", import.meta.url), "utf8"),
  ) as { dossiers: { number: string; applicant: string; subject: string }[] };
  const dossier = dataset.dossiers.find((entry) => entry.number === number);
  if (!dossier) throw new Error(`No dossier ${number} in the dataset`);
  return { number: dossier.number, applicant: dossier.applicant, subject: dossier.subject };
}
