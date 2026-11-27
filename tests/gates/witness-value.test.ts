// Porte de la valeur témoin (spec de l'étape 4, « Valeur témoin ») : recherche
// de la valeur témoin dans les HAR de l'oracle, sur le contenu décodé. Les HAR
// sont de vraies sorties : celles du candidat de référence
// (tests/fixtures/ci45861318349/PROVENANCE.md) et celles de la sonde de #130
// (tests/fixtures/probe130-d110270/PROVENANCE.md). Un test qui place la
// valeur ailleurs part d'une de ces copies et ne change que le champ regardé.
import { describe, expect, it } from "vitest";
import type { GateContext } from "../../gates/context.ts";
import { type Har, searchHars, witnessValueGate } from "../../gates/witness-value.ts";
import { absoluteFixturePath, readJsonFixture } from "../real-fixtures.ts";

const VALUE = "mbtemoin-7c41e9a2b58d306f";
const REFERENCE = "ci45861318349/oracle-artifacts/20261126T164430Z-0d2eb7a-reference-candidate/oracle";
const receiptAgent = () => readJsonFixture<Har>(`${REFERENCE}/remise-receipt-agent-chromium/scenario.har`);
const emptyForm = () => readJsonFixture<Har>(`${REFERENCE}/search-search-empty-form-chromium/scenario.har`);

describe("searchHars, on the reference candidate", () => {
  it("finds the witness value in the HTML of the submission screen and in the URL of the receipt", () => {
    const { examined, findings } = searchHars([{ scenario: "remise-receipt-agent-chromium", har: receiptAgent() }], VALUE);
    expect(examined).toBe(5);
    expect(findings).toEqual([
      { scenario: "remise-receipt-agent-chromium", url: "http://127.0.0.1:8100/remise.do?number=D-0007", location: "response.content", forms: ["plain", "url-encoded"] },
      { scenario: "remise-receipt-agent-chromium", url: "http://localhost:8090/accuse-de-remise?jeton=mbtemoin-7c41e9a2b58d306f&numero=D-0007", location: "request.url", forms: ["plain", "url-encoded"] },
    ]);
  });

  it("finds nothing in a scenario that never reaches the receipt, and counts its entries", () => {
    expect(searchHars([{ scenario: "search-search-empty-form-chromium", har: emptyForm() }], VALUE)).toEqual({ examined: 3, findings: [], unread: [] });
  });
});

// Valeur de test dont les formes base64 et base64url diffèrent aux trois
// décalages (`?` et `>` donnent `/` et `+`), et dont l'encodage URL n'est pas
// elle-même.
const SYNTHETIC = "mbtemoin-??>>~~-7c41";

// Le HAR de `search-search-empty-form` (3 entrées), avec `text` à la place du
// corps de la réponse de sa deuxième entrée, la recherche.
function withResponseText(text: string, encoding?: string): Har {
  const har = emptyForm();
  const content = har.log.entries[1]!.response.content;
  content.text = text;
  if (encoding === undefined) delete content.encoding;
  else content.encoding = encoding;
  return har;
}
const formsIn = (har: Har, value = SYNTHETIC) => searchHars([{ scenario: "s", har }], value).findings.map(({ location, forms }) => ({ location, forms }));

describe("searchHars, forms of the value", () => {
  for (const offset of [0, 1, 2]) {
    // La valeur précédée de `offset` octets, dans un message plus long, puis encodée.
    const message = Buffer.concat([Buffer.from("xyz".slice(0, offset)), Buffer.from(SYNTHETIC), Buffer.from(" tail")]);
    it(`finds the value encoded in base64 at offset ${offset}`, () => {
      expect(formsIn(withResponseText(`{"data":"${message.toString("base64")}"}`))).toEqual([{ location: "response.content", forms: [`base64/offset-${offset}`] }]);
    });
    it(`finds the value encoded in base64url at offset ${offset}`, () => {
      expect(formsIn(withResponseText(`{"data":"${message.toString("base64url")}"}`))).toEqual([{ location: "response.content", forms: [`base64url/offset-${offset}`] }]);
    });
  }

  it("finds the value in hexadecimal, lowercase and uppercase", () => {
    const hex = Buffer.from(SYNTHETIC).toString("hex");
    expect(formsIn(withResponseText(`<p>${hex}</p>`))).toEqual([{ location: "response.content", forms: ["hex-lowercase"] }]);
    expect(formsIn(withResponseText(`<p>${hex.toUpperCase()}</p>`))).toEqual([{ location: "response.content", forms: ["hex-uppercase"] }]);
  });

  it("finds the value in clear and encoded for a URL", () => {
    expect(formsIn(withResponseText(`<p>${SYNTHETIC}</p>`))).toEqual([{ location: "response.content", forms: ["plain"] }]);
    expect(formsIn(withResponseText(`<a href="?t=${encodeURIComponent(SYNTHETIC)}">`))).toEqual([{ location: "response.content", forms: ["url-encoded"] }]);
  });

  it("searches a body stored in base64 once decoded", () => {
    expect(formsIn(withResponseText(Buffer.concat([Buffer.from([0xff, 0x00]), Buffer.from(SYNTHETIC)]).toString("base64"), "base64"))).toEqual([{ location: "response.content", forms: ["plain"] }]);
  });

  // Témoin de l'examen : le HAR non modifié ne contient pas la valeur de test.
  it("finds nothing in the unmodified HAR", () => {
    expect(formsIn(emptyForm())).toEqual([]);
  });
});

describe("searchHars, places of the value", () => {
  const entry = (har: Har) => har.log.entries[1]!;
  const cases: [string, (har: Har) => void][] = [
    ["request.url", (har) => void (entry(har).request.url += `&t=${SYNTHETIC}`)],
    ["request.headers.Referer", (har) => void (entry(har).request.headers.find(({ name }) => name === "Referer")!.value += SYNTHETIC)],
    ["request.postData", (har) => void (entry(har).request.postData = { mimeType: "text/plain", text: SYNTHETIC, params: [] })],
    ["response.headers.Set-Cookie", (har) => void (entry(har).response.headers.find(({ name }) => name === "Set-Cookie")!.value += SYNTHETIC)],
  ];
  for (const [location, place] of cases) {
    it(`finds the value in ${location}`, () => {
      const har = emptyForm();
      place(har);
      expect(formsIn(har)).toEqual([{ location, forms: ["plain"] }]);
    });
  }
});

// HAR enregistré par la sonde de #130 : corps gzip et br stockés décompressés
// en texte, corps binaires décompressés puis en base64 (`encoding`).
describe("searchHars, on the probe of #130", () => {
  const found = () =>
    searchHars([{ scenario: "probe", har: readJsonFixture<Har>("probe130-d110270/probe.har") }], VALUE).findings.map(({ url, location, forms }) => ({ path: new URL(url).pathname, location, forms }));
  // Valeur réelle : ses formes base64 et base64url sont égales, de même que
  // son encodage URL et elle-même (TRAPS.md).
  const plain = ["plain", "url-encoded"];

  it("finds the value in every body and header the HAR keeps, decoded", () => {
    expect(found()).toEqual([
      // La page de la sonde écrit la valeur et deux de ses formes dans son script.
      { path: "/", location: "response.content", forms: [...plain, "base64/offset-2", "base64url/offset-2", "hex-uppercase"] },
      { path: "/gzip-text", location: "response.content", forms: plain },
      { path: "/br-json", location: "response.content", forms: ["base64/offset-1", "base64url/offset-1"] },
      { path: "/binary", location: "response.content", forms: plain },
      { path: "/gzip-binary", location: "response.content", forms: plain },
      { path: "/png", location: "response.content", forms: plain },
      { path: "/post-latin", location: "request.postData", forms: plain },
      { path: "/post-json", location: "request.postData", forms: ["hex-uppercase"] },
      { path: "/post-form", location: "request.postData", forms: plain },
      { path: "/header", location: "request.headers.x-probe", forms: ["base64/offset-2", "base64url/offset-2"] },
      { path: "/header", location: "response.headers.x-echo", forms: ["hex-uppercase"] },
    ]);
  });
});

// La porte, sur les fichiers : le contexte ne donne que ce qu'elle lit.
describe("witnessValueGate", () => {
  const MEASURE = "ci45861318349/oracle-artifacts/20261126T164430Z-0d2eb7a-reference-candidate";
  const context = (harFiles: string[], rawDir = absoluteFixturePath(MEASURE)) => ({ rawDir, oracle: { resultFile: "", harFiles } }) as unknown as GateContext;
  const referenceHars = ["remise-receipt-agent-chromium", "search-search-empty-form-chromium"].map((scenario) => absoluteFixturePath(`${MEASURE}/oracle/${scenario}/scenario.har`));

  it("reads the witness value from the bench values (.env) in its preparation", async () => {
    expect(await witnessValueGate.prepare!(context([]))).toBe(VALUE);
  });

  it("fails the reference candidate, with every HAR cited by its digest", async () => {
    const [result] = await witnessValueGate.examine(context(referenceHars), VALUE);
    expect(result).toMatchObject({
      gate: "witness-value",
      name: "absent-from-har",
      kind: "judged",
      outcome: "failed",
      examined: 8,
      findingsTotal: 2,
      values: { hars: 2, responseBodiesAbsent: 0, responseBodiesUnread: 0 },
      raw: {
        "oracle/remise-receipt-agent-chromium/scenario.har": "sha256:5202ee555106a8515a74938b048f2ec93840cdc0e0941700807d044e5f0a2339",
        "oracle/search-search-empty-form-chromium/scenario.har": "sha256:95c55c512254206255ca73937df624481fc0c287b2827f6867e17ca20ea83282",
      },
    });
    expect(result!.findings).toMatchObject([
      { scenario: "remise-receipt-agent-chromium", location: "response.content" },
      { scenario: "remise-receipt-agent-chromium", location: "request.url" },
    ]);
  });

  it("passes when no HAR holds the value", async () => {
    const [result] = await witnessValueGate.examine(context(referenceHars.slice(1)), VALUE);
    expect(result).toMatchObject({ outcome: "passed", examined: 3, findings: [] });
  });

  // Un corps de réponse que la page n'a jamais lu n'est pas dans le HAR
  // (sonde de #130) : la porte en donne le nombre, sans juger.
  it("counts the response bodies absent from the HAR", async () => {
    const probe = absoluteFixturePath("probe130-d110270/probe-unread.har");
    const [result] = await witnessValueGate.examine(context([probe], absoluteFixturePath("probe130-d110270")), VALUE);
    expect(result!.values).toEqual({ hars: 1, responseBodiesAbsent: 6, responseBodiesUnread: 5 });
  });

  it("is not evaluable without any HAR", async () => {
    const [result] = await witnessValueGate.examine(context([]), VALUE);
    expect(result).toMatchObject({ outcome: "not-evaluable", examined: 0, values: { hars: 0, responseBodiesAbsent: 0, responseBodiesUnread: 0 } });
  });
});

// Corps de réponse absents du HAR (#153, #158) : la porte ne conclut pas
// « absent » sur une réponse qu'elle n'a pas lue. HAR réels : la sonde
// de #130 avant lecture des corps, un `302` vide du legacy, et un candidat qui
// coupe toute connexion.
describe("unread response bodies", () => {
  const probeUnread = () => readJsonFixture<Har>("probe130-d110270/probe-unread.har");
  const saveDraft = () => readJsonFixture<Har>(`${REFERENCE}/sheet-sheet-save-brouillon-chromium/scenario.har`);
  const RELAY_UNTOUCHED = "ci45861318349/oracle-artifacts/20261126T165025Z-0d2eb7a-conforming-candidates-relay-untouched/oracle";
  const noResponse = () => readJsonFixture<Har>(`${RELAY_UNTOUCHED}/search-search-empty-form-chromium/scenario.har`);

  // Décision de Karim (#158) : tout corps absent est à vérifier, sauf d'un
  // type sans intérêt connu.
  it("lists every unread body but an image, with its media type", () => {
    // Sans lecture, six corps manquent : `text/plain` (2), `application/json`,
    // `application/octet-stream` (2) et `image/png`.
    expect(searchHars([{ scenario: "probe", har: probeUnread() }], SYNTHETIC).unread.map(({ url, type }) => [new URL(url).pathname, type])).toEqual([
      ["/gzip-text", "text/plain"],
      ["/br-json", "application/json"],
      ["/binary", "application/octet-stream"],
      ["/gzip-binary", "application/octet-stream"],
      ["/header", "text/plain"],
    ]);
  });

  // Le HAR de la sonde, l'en-tête `Content-Type` de ses entrées non lues
  // retiré ou changé.
  const withContentTypes = (types: Record<string, string | undefined>) => {
    const har = probeUnread();
    for (const [path, type] of Object.entries(types)) {
      const response = har.log.entries.find(({ request }) => request.url.endsWith(path))!.response;
      const header = response.headers.find(({ name }) => name.toLowerCase() === "content-type")!;
      if (type === undefined) response.headers = response.headers.filter((entry) => entry !== header);
      else header.value = type;
    }
    return har;
  };

  it("lists an unread body without Content-Type", () => {
    const har = withContentTypes({ "/br-json": undefined });
    expect(searchHars([{ scenario: "probe", har }], SYNTHETIC).unread).toContainEqual({ scenario: "probe", url: "http://127.0.0.1:8100/br-json", type: null });
  });

  it("lists an unread body whose Content-Type is empty or malformed", () => {
    const har = withContentTypes({ "/gzip-text": "", "/br-json": "image", "/binary": "image/", "/gzip-binary": "/png" });
    expect(searchHars([{ scenario: "probe", har }], SYNTHETIC).unread.map(({ url, type }) => [new URL(url).pathname, type])).toEqual([
      ["/gzip-text", null],
      ["/br-json", "image"],
      ["/binary", "image/"],
      ["/gzip-binary", "/png"],
      ["/header", "text/plain"],
    ]);
  });

  it("does not list an unread image, font, audio or video body", () => {
    const har = withContentTypes({ "/gzip-text": "Image/SVG+XML", "/br-json": "font/woff2", "/binary": "audio/mpeg", "/gzip-binary": "video/mp4; codecs=avc1", "/header": "image/webp" });
    expect(searchHars([{ scenario: "probe", har }], SYNTHETIC).unread).toEqual([]);
  });

  it("does not count an empty response, such as the 302 of the legacy", () => {
    expect(searchHars([{ scenario: "save", har: saveDraft() }], VALUE).unread).toEqual([]);
  });

  it("does not count an entry without any response", () => {
    expect(searchHars([{ scenario: "cut", har: noResponse() }], VALUE)).toEqual({ examined: 1, findings: [], unread: [] });
  });

  describe("witnessValueGate", () => {
    // Le contexte ne donne que ce que la porte lit : un HAR et son dossier.
    const onHar = (dir: string, har: string) => ({ rawDir: absoluteFixturePath(dir), oracle: { resultFile: "", harFiles: [absoluteFixturePath(`${dir}/${har}`)] } }) as unknown as GateContext;
    const context = onHar("probe130-d110270", "probe-unread.har");

    it("is not-evaluable when a body is absent, with the entries in its findings", async () => {
      const [result] = await witnessValueGate.examine(context, SYNTHETIC);
      expect(result).toMatchObject({
        outcome: "not-evaluable",
        examined: 10,
        findingsTotal: 5,
        values: { hars: 1, responseBodiesAbsent: 6, responseBodiesUnread: 5 },
      });
    });

    it("stays failed when a leak is found elsewhere, its findings first", async () => {
      const [result] = await witnessValueGate.examine(context, VALUE);
      expect(result).toMatchObject({ outcome: "failed" });
      expect(result!.findings.at(0)).toMatchObject({ location: "response.content", forms: expect.arrayContaining(["plain"]) });
      expect(result!.findings.at(-1)).toEqual({ scenario: "probe130-d110270", url: "http://127.0.0.1:8100/header", type: "text/plain" });
    });

    it("passes a candidate whose absent bodies have no response at all", async () => {
      const [result] = await witnessValueGate.examine(onHar(RELAY_UNTOUCHED, "search-search-empty-form-chromium/scenario.har"), VALUE);
      expect(result).toMatchObject({ outcome: "passed", examined: 1, values: { hars: 1, responseBodiesAbsent: 1, responseBodiesUnread: 0 } });
    });
  });
});
