// Fidélité du relais du candidat de référence (spec de l'étape 3, « Candidat
// de référence ») : une réponse du legacy reçue à travers le relais doit être
// celle reçue directement, pour que le 100 % du relais soit celui du legacy
// (règle 6 de PROTOCOL.md).

/** Une réponse telle qu'elle arrive : en-têtes bruts (noms et valeurs en
 * alternance, doublons compris) et corps non décodé. */
export interface CapturedResponse {
  status: number;
  rawHeaders: readonly string[];
  body: Buffer;
}

/** Propres à une connexion (hop-by-hop, au sens de HTTP) : exclus de la
 * comparaison. Liste fermée de la spec. */
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"]);

/** Les différences entre la réponse directe et la réponse relayée, une phrase
 * par différence ; vide si le relais n'a rien modifié. */
export function compareResponses(direct: CapturedResponse, relayed: CapturedResponse): string[] {
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
  if (!direct.body.equals(relayed.body)) {
    differences.push(
      `body: first difference at byte ${firstDifference(direct.body, relayed.body)} ` +
        `(${direct.body.length} bytes direct, ${relayed.body.length} relayed)`,
    );
  }
  return differences;
}

/** Un `Set-Cookie` sans la valeur du cookie, tirée à chaque session : son nom
 * et ses attributs restent comparés. */
function cookieForm(setCookie: string): string {
  return setCookie.replace(/^([^=;]*)=[^;]*/, "$1=…");
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
