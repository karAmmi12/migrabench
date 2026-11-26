// Porte du relais (spec de l'étape 4, « Porte du relais ») sur le vrai journal
// d'accès de la mesure comptée 20261125T133422Z-52303ae-reference-candidate
// (exécution 45624689673, tests/fixtures/ci45624689673/PROVENANCE.md). Les
// positions des requêtes témoins sont celles de `accessLog.witnesses` de son
// measure.json (tests/fixtures/measure-cases/…/measure.json).
//
// Comptes relevés indépendamment sur ce journal (`sed -n 2,212p | awk
// '{print $3}' | sort | uniq -c`) : 21 lignes du healthcheck, 2 requêtes
// témoins, 188 lignes du candidat de référence (172.19.0.4).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GateContext } from "../../gates/context.ts";
import { runGates } from "../../gates/registry.ts";
import { examineRelay, relayGate } from "../../gates/relay.ts";
import { FINDINGS_LIMIT } from "../../gates/result.ts";
import { ROOT } from "../../shared/root.ts";

const LOG_FILE = join(ROOT, "tests/fixtures/ci45624689673/oracle-artifacts/20261125T133422Z-52303ae-reference-candidate/access.log");
const LOG = readFileSync(LOG_FILE, "utf8");
const LINES = LOG.split("\n").filter((line) => line !== "");
const WITNESSES = [
  { name: "start-1", line: 2 },
  { name: "end", line: 212 },
];
const DIGEST = "sha256:adbb6e0f3eeb56572c1a1368c77538376872e8cb5d0e968977abac90b0d630fa";

// Lignes du vrai journal, numérotées à partir de 1.
const line = (number: number) => LINES[number - 1] ?? "";
// Ligne 1 : le healthcheck (`0:0:0:0:0:0:0:1`, `curl/8.18.0`). Ligne 3 : la
// première requête du candidat de référence (172.19.0.4).
const HEALTHCHECK = line(1);
const CANDIDATE = line(3);

describe("examineRelay", () => {
  it("fails the reference candidate: every line it relayed is a finding", () => {
    const examined = examineRelay({ log: LOG, witnesses: WITNESSES });
    expect(examined.examined).toBe(211);
    expect(examined.findings).toHaveLength(188);
    expect(examined.findings[0]).toEqual({ line: 3, entry: CANDIDATE });
    expect(examined.findings.every(({ entry }) => entry.includes(" 172.19.0.4 "))).toBe(true);
  });

  it("reads only the lines from start-1 to end, witnesses and healthcheck included", () => {
    // Le journal reste ouvert après `end` : le healthcheck et une requête du
    // candidat écrites ensuite ne sont pas lues.
    const examined = examineRelay({ log: `${LOG}${HEALTHCHECK}\n${CANDIDATE}\n`, witnesses: WITNESSES });
    expect(examined.examined).toBe(211);
    expect(examined.findings).toHaveLength(188);
  });

  it("finds nothing in a window of witnesses and healthcheck only", () => {
    // Le vrai journal, sans les lignes du candidat.
    const kept = LINES.filter((entry) => !entry.includes(" 172.19.0.4 "));
    const witnesses = WITNESSES.map(({ name }) => ({ name, line: kept.findIndex((entry) => entry.includes(`/${name} HTTP`)) + 1 }));
    expect(examineRelay({ log: `${kept.join("\n")}\n`, witnesses })).toEqual({ examined: 23, findings: [] });
  });

  // Le User-Agent se fabrique : seule l'adresse source écarte le healthcheck.
  it("keeps a line with the User-Agent of the healthcheck from another address", () => {
    const forged = HEALTHCHECK.replace(" 0:0:0:0:0:0:0:1 ", " 172.19.0.4 ");
    const log = [line(2), forged, line(212)].join("\n");
    expect(examineRelay({ log, witnesses: [{ name: "start-1", line: 1 }, { name: "end", line: 3 }] })).toEqual({ examined: 3, findings: [{ line: 2, entry: forged }] });
  });

  it("keeps a line of any path, not only the screens", () => {
    const asset = CANDIDATE.replace(/"GET \S+ /, '"GET /static/app.css ');
    const log = [line(2), asset, line(212)].join("\n");
    expect(examineRelay({ log, witnesses: [{ name: "start-1", line: 1 }, { name: "end", line: 3 }] }).findings).toEqual([{ line: 2, entry: asset }]);
  });

  it("reads the window across a restart of the legacy, from start-1 to end", () => {
    // Après un redémarrage, `start-2` : son chemin est celui de `start-1`.
    const start2 = line(2).replace("/start-1 ", "/start-2 ");
    const log = [line(2), CANDIDATE, start2, HEALTHCHECK, CANDIDATE, line(212)].join("\n");
    const witnesses = [{ name: "start-1", line: 1 }, { name: "start-2", line: 3 }, { name: "end", line: 6 }];
    expect(examineRelay({ log, witnesses })).toEqual({ examined: 6, findings: [{ line: 2, entry: CANDIDATE }, { line: 5, entry: CANDIDATE }] });
  });
});

describe("relay gate", () => {
  const context = (accessLog?: GateContext["accessLog"]) => ({ ...({} as Omit<GateContext, "signal" | "accessLog">), ...(accessLog === undefined ? {} : { accessLog }) });

  it("is judged failed for the reference candidate, with the access log cited by its digest", async () => {
    const [result] = await runGates([relayGate], context({ file: LOG_FILE, digest: DIGEST, witnesses: WITNESSES }));
    expect(result).toMatchObject({
      gate: "relay",
      name: "legacy-port-untouched",
      kind: "judged",
      outcome: "failed",
      examined: 211,
      findingsTotal: 188,
      findingsKept: FINDINGS_LIMIT,
      values: {},
      raw: { "access.log": DIGEST },
    });
    expect(result?.findings[0]).toEqual({ line: 3, entry: CANDIDATE });
  });

  // Sans journal contrôlé, la porte n'a rien lu du candidat : la mesure est invalide.
  it("is errored before-candidate without an access log checked ok", async () => {
    expect(await runGates([relayGate], context())).toMatchObject([{ outcome: "errored", error: { stage: "before-candidate", cause: "exception" } }]);
  });
});
