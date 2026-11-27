// Porte Lighthouse (#134) : lecture d'un rapport de Lighthouse (LHR) et
// résultat relevé sur trois passes. Le LHR est la copie d'une vraie passe sur
// le legacy (tests/fixtures/probe134-6151131/PROVENANCE.md) ; chaque variante
// le réécrit.
import { describe, expect, it } from "vitest";
import { errorMessage, type Lhr, lighthouseGate, lighthouseResult, median, passOutcome, type PassOutcome } from "../../gates/lighthouse.ts";
import { readFixture } from "../real-fixtures.ts";

const LHR = JSON.parse(readFixture("probe134-6151131/lhr-pass.json")) as Lhr;
const RAW = { "gates/lighthouse/pass-1.json": "sha256:1" };

const completed = (score: number, lcp: number): PassOutcome => ({ completed: true, metrics: { score, lcp, tbt: 0, cls: 0, speedIndex: lcp } });

describe("passOutcome", () => {
  it("reads the score and the four metrics of a real pass", () => {
    expect(passOutcome(LHR)).toEqual({ completed: true, metrics: { score: 1, lcp: 386.43475, tbt: 0, cls: 0, speedIndex: 468.20647691648776 } });
  });

  it("does not complete a pass with a runtime error", () => {
    const lhr = { ...LHR, runtimeError: { code: "FAILED_DOCUMENT_REQUEST", message: "Lighthouse was unable to reliably load the page you requested." } };
    expect(passOutcome(lhr)).toEqual({ completed: false, reason: "FAILED_DOCUMENT_REQUEST: Lighthouse was unable to reliably load the page you requested." });
  });

  it("does not complete a pass without a performance score", () => {
    expect(passOutcome({ ...LHR, categories: { performance: { score: null } } })).toEqual({ completed: false, reason: "no performance score" });
  });

  it("does not complete a pass without a numeric value for a metric", () => {
    const audits = { ...LHR.audits, "total-blocking-time": {} };
    expect(passOutcome({ ...LHR, audits })).toEqual({ completed: false, reason: "no numeric value for total-blocking-time" });
  });
});

describe("median", () => {
  it("takes the middle of an odd count, the mean of the two middles of an even count", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([400, 100])).toBe(250);
  });
});

describe("lighthouseResult", () => {
  it("measures three completed passes, each kept with the median", () => {
    const result = lighthouseResult([completed(0.9, 300), completed(1, 100), completed(0.8, 200)], RAW);
    expect(result).toMatchObject({ gate: "lighthouse", name: "performance", kind: "measured", outcome: "measured", examined: 3, findings: [], raw: RAW });
    expect(result.values).toEqual({
      "pass1.completed": 1, "pass1.score": 0.9, "pass1.lcp": 300, "pass1.tbt": 0, "pass1.cls": 0, "pass1.speedIndex": 300,
      "pass2.completed": 1, "pass2.score": 1, "pass2.lcp": 100, "pass2.tbt": 0, "pass2.cls": 0, "pass2.speedIndex": 100,
      "pass3.completed": 1, "pass3.score": 0.8, "pass3.lcp": 200, "pass3.tbt": 0, "pass3.cls": 0, "pass3.speedIndex": 200,
      score: 0.9, lcp: 200, tbt: 0, cls: 0, speedIndex: 200,
    });
  });

  it("counts the completed passes only, and names the others", () => {
    const result = lighthouseResult([completed(0.9, 300), { completed: false, reason: "NO_FCP: no paint" }, completed(0.7, 100)], RAW);
    expect(result).toMatchObject({ outcome: "measured", examined: 2, findings: [{ pass: 2, reason: "NO_FCP: no paint" }] });
    expect(result.values).toMatchObject({ "pass2.completed": 0, score: 0.8, lcp: 200 });
    expect(result.values).not.toHaveProperty("pass2.score");
  });

  // Aucune passe aboutie : rien n'a été examiné, et aucune médiane.
  it("is not evaluable without any completed pass", () => {
    const failed: PassOutcome = { completed: false, reason: "FAILED_DOCUMENT_REQUEST: 401" };
    const result = lighthouseResult([failed, failed, failed], {});
    expect(result).toMatchObject({ outcome: "not-evaluable", examined: 0, findingsTotal: 3 });
    expect(result.values).toEqual({ "pass1.completed": 0, "pass2.completed": 0, "pass3.completed": 0 });
  });
});

// Le message d'une erreur finit dans measure.json : jamais le jeton du navigateur.
describe("errorMessage", () => {
  it("keeps the first line, without the token of the browser", () => {
    const token = "c".repeat(64);
    const error = new Error(`connect ECONNREFUSED ws://127.0.0.1:8096/${token}/cdp/1/devtools/browser/x\n    at connect`);
    expect(errorMessage(error, token)).toBe("connect ECONNREFUSED ws://127.0.0.1:8096/<token>/cdp/1/devtools/browser/x");
  });
});

describe("lighthouseGate", () => {
  it("declares one measured result", () => {
    expect(lighthouseGate.results).toEqual({ performance: "measured" });
    expect(lighthouseGate.group).toBe("browser-read");
  });

  it("pins Lighthouse at its installed version", () => {
    expect(lighthouseGate.tools?.()).toEqual({ lighthouse: "13.6.0" });
  });
});
