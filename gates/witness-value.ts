// Porte de la valeur témoin (spec de l'étape 4, « Valeur témoin », TRAPS.md
// « Secret lu par `System.getenv()` dans un scriptlet ») : la valeur témoin
// n'apparaît dans aucune requête ni réponse des HAR de l'oracle. Les fichiers
// construits ne sont pas lus (limite dans PROTOCOL.md).
//
// Un résultat jugé, `absent-from-har` :
// - `examined` : les entrées lues, tous HAR confondus ;
// - `findings` : un constat par emplacement où la valeur est trouvée, avec le
//   scénario (dossier du HAR), l'URL de l'entrée, l'emplacement
//   (`request.url`, `request.headers.<nom>`, `request.postData`,
//   `response.headers.<nom>`, `response.content`) et les formes trouvées ;
// - `values` : `hars`, le nombre de HAR lus, et `responseBodiesAbsent`, le
//   nombre d'entrées dont le HAR n'a pas gardé le corps de la réponse ;
// - `raw` : chaque HAR, par son chemin sous le dossier des bruts.
//
// Forme réelle des HAR relevée par la sonde de #130
// (tests/fixtures/probe130-d110270/PROVENANCE.md), Playwright 1.65.1 : un corps
// gzip ou br est gardé décompressé, en texte ; un corps binaire est gardé
// décompressé, en base64 (`encoding: "base64"`) ; un corps de réponse que la
// page n'a jamais lu est absent (`size: -1`, sans `text`) ; un corps de
// requête binaire (`Uint8Array` avec des octets nuls) est vide, et un `Blob`
// n'a pas de `postData`. Ces deux derniers cas échappent à la porte.
import { readFile } from "node:fs/promises";
import { basename, dirname, relative } from "node:path";
import { citedFileSha256 } from "../shared/digest.ts";
import { readBenchEnv } from "../shared/root.ts";
import type { Gate } from "./registry.ts";
import { judged } from "./result.ts";

const GATE = "witness-value";
// Délai de conception : la lecture des HAR d'une exécution de l'oracle.
const WITNESS_VALUE_TIMEOUT_MS = 60_000;

// Ce que la porte lit d'un HAR écrit par Playwright (oracle/support.ts).
interface HarHeader {
  name: string;
  value: string;
}
interface HarEntry {
  request: { url: string; headers: HarHeader[]; postData?: { mimeType?: string; text?: string; params?: unknown[] } };
  response: { headers: HarHeader[]; content: { text?: string; encoding?: string } };
}
export interface Har {
  log: { entries: HarEntry[] };
}

export interface WitnessFinding {
  scenario: string;
  url: string;
  location: string;
  // Formes de la valeur trouvées à cet emplacement.
  forms: string[];
}

interface Form {
  name: string;
  pattern: Buffer;
}

// Formes cherchées : en clair, encodée pour une URL, en base64 et base64url
// aux trois décalages, en hexadécimal minuscules et majuscules. Deux formes
// peuvent avoir le même motif (la valeur témoin est sa propre forme encodée
// pour une URL) : un constat les nomme alors toutes les deux.
export function witnessForms(value: string): Form[] {
  const bytes = Buffer.from(value, "utf8");
  const hex = bytes.toString("hex");
  const forms: [string, string][] = [
    ["plain", value],
    ["url-encoded", encodeURIComponent(value)],
    ...OFFSETS.map((offset): [string, string] => [`base64/offset-${offset}`, base64Core(bytes, offset, "base64")]),
    ...OFFSETS.map((offset): [string, string] => [`base64url/offset-${offset}`, base64Core(bytes, offset, "base64url")]),
    ["hex-lowercase", hex],
    ["hex-uppercase", hex.toUpperCase()],
  ];
  return forms.map(([name, pattern]) => ({ name, pattern: Buffer.from(pattern, "utf8") }));
}

const OFFSETS = [0, 1, 2] as const;

// Caractères base64 que seuls les octets de la valeur déterminent, quand elle
// suit `offset` octets (modulo 3) dans le message encodé : ceux qui mêlent ses
// bits à ceux de ses voisins sont retirés aux deux bouts.
function base64Core(bytes: Buffer, offset: number, encoding: "base64" | "base64url"): string {
  const encoded = Buffer.concat([Buffer.alloc(offset), bytes]).toString(encoding);
  return encoded.slice(Math.ceil((offset * 8) / 6), Math.floor(((offset + bytes.length) * 8) / 6));
}

export function searchHars(hars: readonly { scenario: string; har: Har }[], value: string): { examined: number; findings: WitnessFinding[] } {
  const forms = witnessForms(value);
  const findings: WitnessFinding[] = [];
  let examined = 0;
  for (const { scenario, har } of hars) {
    for (const entry of har.log.entries) {
      examined++;
      for (const [location, content] of places(entry)) {
        const found = forms.filter(({ pattern }) => content.includes(pattern)).map(({ name }) => name);
        if (found.length > 0) findings.push({ scenario, url: entry.request.url, location, forms: found });
      }
    }
  }
  return { examined, findings };
}

// Emplacements lus d'une entrée : URL, en-têtes et corps de la requête et de
// la réponse. Les cookies et `queryString` du HAR répètent les en-têtes et
// l'URL. La recherche porte sur les octets : un texte en UTF-8, un corps en
// base64 (`encoding`, corps binaire) une fois décodé.
function places({ request, response }: HarEntry): [location: string, content: Buffer][] {
  const { text = "", encoding } = response.content;
  const utf8 = (value: string) => Buffer.from(value, "utf8");
  return [
    ["request.url", utf8(request.url)],
    ...request.headers.map(({ name, value }): [string, Buffer] => [`request.headers.${name}`, utf8(value)]),
    ["request.postData", utf8(request.postData?.text ?? "")],
    ...response.headers.map(({ name, value }): [string, Buffer] => [`response.headers.${name}`, utf8(value)]),
    ["response.content", encoding === "base64" ? Buffer.from(text, "base64") : utf8(text)],
  ];
}

// Entrées dont le HAR n'a pas gardé le corps de la réponse : la page ne l'a
// jamais lu (sonde de #130).
function responseBodiesAbsent(har: Har): number {
  return har.log.entries.filter(({ response }) => response.content.text === undefined).length;
}

export const witnessValueGate: Gate<string> = {
  name: GATE,
  group: "files",
  results: { "absent-from-har": "judged" },
  timeoutMs: WITNESS_VALUE_TIMEOUT_MS,
  // La valeur témoin est une valeur du banc (.env) : sans elle, rien n'est
  // cherché.
  prepare: async () => {
    const value = (await readBenchEnv()).ARCHIVE_TOKEN;
    if (value === undefined || value === "") throw new Error("ARCHIVE_TOKEN is missing from .env");
    return value;
  },
  examine: async ({ rawDir, oracle }, value) => {
    const hars = await Promise.all(oracle.harFiles.map(async (file) => ({ file, scenario: basename(dirname(file)), har: JSON.parse(await readFile(file, "utf8")) as Har })));
    const { examined, findings } = searchHars(hars, value);
    const raw = Object.fromEntries(await Promise.all(hars.map(async ({ file }) => [relative(rawDir, file), await citedFileSha256(file)])));
    const values = { hars: hars.length, responseBodiesAbsent: hars.reduce((sum, { har }) => sum + responseBodiesAbsent(har), 0) };
    return [judged({ gate: GATE, name: "absent-from-har", examined, passed: findings.length === 0, findings, values, raw })];
  },
};
