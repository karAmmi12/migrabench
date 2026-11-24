// Comparaison d'une réponse du legacy reçue directement et à travers le relais
// du candidat de référence (spec de l'étape 3, « Candidat de référence »).
// Fonction pure, sans pile : le Seam A (tests/seam-a/reference-relay.test.ts)
// l'applique aux vraies réponses.
import { describe, expect, it } from "vitest";
import { compareResponses, type CapturedResponse } from "./seam-a/relay-fidelity.ts";

const DIRECT: CapturedResponse = {
  status: 200,
  rawHeaders: [
    "Set-Cookie", "JSESSIONID=0A1B2C3D4E5F; Path=/; HttpOnly",
    "Content-Type", "text/html;charset=UTF-8",
    "Content-Length", "12",
    "Date", "Tue, 24 Nov 2026 09:05:07 GMT",
    "Keep-Alive", "timeout=20",
    "Connection", "keep-alive",
  ],
  body: Buffer.from("<p>Objet</p>"),
};

function relayed(change: Partial<CapturedResponse>): CapturedResponse {
  return { ...DIRECT, ...change };
}

describe("relay fidelity comparison", () => {
  it("finds no difference between identical responses", () => {
    expect(compareResponses(DIRECT, relayed({}))).toEqual([]);
  });

  it("ignores the hop-by-hop headers, which belong to one connection", () => {
    const hopByHop = ["Connection", "Keep-Alive", "Proxy-Connection", "TE", "Trailer", "Transfer-Encoding", "Upgrade"];
    const otherConnection = relayed({
      rawHeaders: [
        ...DIRECT.rawHeaders.slice(0, 8),
        ...hopByHop.flatMap((name) => [name, `${name} of the relay connection`]),
      ],
    });

    expect(compareResponses(DIRECT, otherConnection)).toEqual([]);
  });

  it("accepts another Date value, which changes from one response to the next", () => {
    const later = relayed({
      rawHeaders: DIRECT.rawHeaders.map((value, index) =>
        DIRECT.rawHeaders[index - 1] === "Date" ? "Tue, 24 Nov 2026 09:05:08 GMT" : value,
      ),
    });

    expect(compareResponses(DIRECT, later)).toEqual([]);
  });

  it("fails on a Date removed by the relay", () => {
    const withoutDate = relayed({ rawHeaders: [...DIRECT.rawHeaders.slice(0, 6), ...DIRECT.rawHeaders.slice(8)] });

    expect(compareResponses(DIRECT, withoutDate)).toEqual(["header date: 1 direct, 0 relayed"]);
  });

  it("accepts another session cookie value, drawn for each response", () => {
    const otherSession = relayed({
      rawHeaders: ["Set-Cookie", "JSESSIONID=9F8E7D6C5B4A; Path=/; HttpOnly", ...DIRECT.rawHeaders.slice(2)],
    });

    expect(compareResponses(DIRECT, otherSession)).toEqual([]);
  });

  it.each([
    { change: "an attribute", cookie: "JSESSIONID=9F8E7D6C5B4A; Path=/; HttpOnly; Secure" },
    { change: "the cookie name", cookie: "SESSION=9F8E7D6C5B4A; Path=/; HttpOnly" },
  ])("fails on a Set-Cookie whose $change was changed by the relay", ({ cookie }) => {
    const changed = relayed({ rawHeaders: ["Set-Cookie", cookie, ...DIRECT.rawHeaders.slice(2)] });

    expect(compareResponses(DIRECT, changed)).toHaveLength(1);
    expect(compareResponses(DIRECT, changed)[0]).toMatch(/^header set-cookie: /);
  });

  it("fails on a header added by the relay", () => {
    const added = relayed({ rawHeaders: [...DIRECT.rawHeaders, "X-Powered-By", "relay"] });

    expect(compareResponses(DIRECT, added)).toEqual(["header x-powered-by: [] direct, [relay] relayed"]);
  });

  it("fails on a header removed by the relay", () => {
    const removed = relayed({ rawHeaders: DIRECT.rawHeaders.slice(2) });

    expect(compareResponses(DIRECT, removed)).toEqual([
      "header set-cookie: [JSESSIONID=…; Path=/; HttpOnly] direct, [] relayed",
    ]);
  });

  it("fails on a Content-Length changed by the relay", () => {
    const changed = relayed({
      rawHeaders: DIRECT.rawHeaders.map((value, index) => (DIRECT.rawHeaders[index - 1] === "Content-Length" ? "13" : value)),
    });

    expect(compareResponses(DIRECT, changed)).toEqual(["header content-length: [12] direct, [13] relayed"]);
  });

  it("fails on one byte of the body changed by the relay", () => {
    const changed = relayed({ body: Buffer.from("<p>Sujet</p>") });

    expect(compareResponses(DIRECT, changed)).toEqual(["body: first difference at byte 3 (12 bytes direct, 12 relayed)"]);
  });

  it("fails on a body truncated by the relay", () => {
    const truncated = relayed({ body: Buffer.from("<p>Objet</p") });

    expect(compareResponses(DIRECT, truncated)).toEqual([
      "body: first difference at byte 11 (12 bytes direct, 11 relayed)",
    ]);
  });
});
