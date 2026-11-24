// Fidélité du relais du candidat de référence (spec de l'étape 3, « Candidat
// de référence ») : une réponse du legacy reçue à travers le relais doit être
// celle reçue directement, pour que le 100 % du relais soit celui du legacy
// (règle 6 de PROTOCOL.md).
import { request } from "node:http";

/** Une réponse telle qu'elle arrive : en-têtes bruts (noms et valeurs en
 * alternance, doublons compris) et corps non décodé. */
export interface CapturedResponse {
  status: number;
  rawHeaders: readonly string[];
  body: Buffer;
}

export interface CaptureRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Envoie une requête sur une connexion neuve et rend la réponse brute : ni
 * redirection suivie, ni corps décodé, ni en-tête fusionné (contrairement à
 * `fetch`). */
export function captureResponse(url: string, init: CaptureRequest = {}): Promise<CapturedResponse> {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, { method: init.method ?? "GET", headers: init.headers ?? {}, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolve({ status: response.statusCode ?? 0, rawHeaders: response.rawHeaders, body: Buffer.concat(chunks) }),
      );
      response.on("error", reject);
    });
    outgoing.on("error", reject);
    outgoing.end(init.body);
  });
}

/** Propres à une connexion (hop-by-hop, au sens de HTTP) : exclus de la
 * comparaison. Liste fermée de la spec. */
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"]);

/** L'identifiant de session que Tomcat 9 ajoute aux liens d'une page servie
 * sans cookie de session : 16 octets en hexadécimal majuscule, sans
 * `jvmRoute` (server.xml par défaut de l'image du legacy). Le test du Seam A
 * vérifie ce format sur une vraie réponse. */
const SESSION_ID_IN_LINK = /;jsessionid=[0-9A-F]{32}(?![0-9A-Za-z])/g;
const MASKED_SESSION_ID = ";jsessionid=<session>";

export interface CompareOptions {
  /** Remplace par un jeton fixe la seule valeur de `;jsessionid=<valeur>`
   * dans les deux corps avant de les comparer octet par octet : le nombre et
   * la position des occurrences, et tout le reste du lien, restent comparés.
   * Exception propre à la fidélité du relais de référence, dont les deux
   * côtés ouvrent chacun leur session ; jamais pour la mesure d'un candidat. */
  maskSessionIds?: boolean;
}

/** Les différences entre la réponse directe et la réponse relayée, une phrase
 * par différence ; vide si le relais n'a rien modifié. */
export function compareResponses(
  direct: CapturedResponse,
  relayed: CapturedResponse,
  options: CompareOptions = {},
): string[] {
  const differences: string[] = [];
  if (direct.status !== relayed.status) {
    differences.push(`status: ${direct.status} direct, ${relayed.status} relayed`);
  }
  const directHeaders = headersByName(direct.rawHeaders);
  const relayedHeaders = headersByName(relayed.rawHeaders);
  for (const name of new Set([...directHeaders.keys(), ...relayedHeaders.keys()])) {
    const form = name === "set-cookie" ? cookieForm : (value: string) => value;
    const directValues = (directHeaders.get(name) ?? []).map(form);
    const relayedValues = (relayedHeaders.get(name) ?? []).map(form);
    if (name === "date") {
      // Comparé sur sa présence : sa valeur change d'une réponse à l'autre.
      if (directValues.length !== relayedValues.length) {
        differences.push(`header date: ${directValues.length} direct, ${relayedValues.length} relayed`);
      }
    } else if (directValues.join("\n") !== relayedValues.join("\n")) {
      differences.push(`header ${name}: [${directValues.join(", ")}] direct, [${relayedValues.join(", ")}] relayed`);
    }
  }
  const directBody = options.maskSessionIds ? maskSessionIds(direct.body) : direct.body;
  const relayedBody = options.maskSessionIds ? maskSessionIds(relayed.body) : relayed.body;
  if (!directBody.equals(relayedBody)) {
    differences.push(
      `body: first difference at byte ${firstDifference(directBody, relayedBody)} ` +
        `(${directBody.length} bytes direct, ${relayedBody.length} relayed)`,
    );
  }
  return differences;
}

/** Un `Set-Cookie` sans la valeur du cookie, tirée à chaque session : son nom
 * et ses attributs restent comparés. */
function cookieForm(setCookie: string): string {
  return setCookie.replace(/^([^=;]*)=[^;]*/, "$1=…");
}

/** Les valeurs de `;jsessionid=` du corps que le masque laisserait telles
 * quelles, parce qu'elles sortent du format exact : le Seam A exige qu'il n'y
 * en ait aucune dans une vraie réponse du legacy. */
export function sessionIdsOutsideFormat(body: Buffer): string[] {
  return [...body.toString("latin1").matchAll(/;jsessionid=([^?#"'&;\s]*)/g)]
    .filter((match) => !new RegExp(`^${SESSION_ID_IN_LINK.source}$`).test(match[0]))
    .map((match) => match[1] ?? "");
}

/** Le corps, chaque valeur de `;jsessionid=` au format exact remplacée par le
 * même jeton. Le latin1 rend chaque octet tel quel, aller et retour. */
function maskSessionIds(body: Buffer): Buffer {
  return Buffer.from(body.toString("latin1").replace(SESSION_ID_IN_LINK, MASKED_SESSION_ID), "latin1");
}

function firstDifference(left: Buffer, right: Buffer): number {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}

/** Les valeurs de chaque en-tête, dans leur ordre d'arrivée, sous son nom en
 * minuscules : un nom d'en-tête HTTP ne dépend pas de la casse. */
function headersByName(rawHeaders: readonly string[]): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = (rawHeaders[index] ?? "").toLowerCase();
    if (HOP_BY_HOP.has(name)) continue;
    byName.set(name, [...(byName.get(name) ?? []), rawHeaders[index + 1] ?? ""]);
  }
  return byName;
}
