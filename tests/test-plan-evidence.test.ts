// Contrôle des preuves du plan de test d'une PR (#54) : chaque case cochée
// qui contient un nombre cite un état, un SHA ou une exécution de CI.
// Les corps réels des PR #41, #44, #48 et #50 sont copiés sous
// tests/fixtures/test-plans/ (gh pr view <N> --json body).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { uncitedLines } from "../scripts/test-plan-evidence.ts";

function prBody(number: number): string {
  return readFileSync(new URL(`fixtures/test-plans/pr${number}.md`, import.meta.url), "utf8");
}

describe("test plan evidence", () => {
  it("names the checked lines of #44 that cite no state", () => {
    expect(uncitedLines(prBody(44))).toEqual([
      "- [x] `npm run oracle` contre le legacy : 14/14, 0 non atteint",
      "- [x] `npm test` : 143 tests",
      "- [x] `npm run oracle` refusé sous Node 24",
    ]);
  });

  it("names the checked lines of #48 that cite no state", () => {
    expect(uncitedLines(prBody(48))).toEqual([
      "- [x] `npm run oracle` contre le legacy : 38/38, 0 non atteint",
      "- [x] `npm test` : 170 tests",
    ]);
  });

  // Décision de l'humain : ces deux lignes ne citent aucun état, le contrôle
  // les refuse ; les autres lignes de #41 et #50 passent.
  it("names only the two uncited lines of #41 and #50", () => {
    expect(uncitedLines(prBody(41))).toEqual([
      "- [x] `npm run oracle` contre le legacy → R2 et R17 réussis, code de sortie `0`, résultat versionné `results/oracle/20261121T164222Z-6c34da6.json`, 0 ligne avec `/Users/`, `/home/` ou `../`.",
    ]);
    expect(uncitedLines(prBody(50))).toEqual([
      "- [x] Les 5 JSON du job de preuve récupérés depuis l'artefact `oracle-proof` et versionnés dans `results/oracle/`, puis `npm run oracle:proof` relancé sur eux en local : `Proof holds on 5 results.`",
    ]);
  });

  it("counts a commit cited alone in inline code, or in prose, or a CI run link", () => {
    expect(
      uncitedLines(
        [
          "- [x] `npm test` : 143 tests, commit `62bd7cd`",
          "- [x] `npm test` : 143 tests, commit 62bd7cd",
          "- [x] CI verte : [exécution](https://github.com/karAmmi12/migrabench/actions/runs/44953461587), 143 tests",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("does not count a SHA inside longer inline code as a state", () => {
    expect(uncitedLines("- [x] `git show 62bd7cd` : 143 tests")).toEqual(["- [x] `git show 62bd7cd` : 143 tests"]);
  });

  it("does not count a number written in inline code", () => {
    expect(uncitedLines("- [x] Sortie : `Tests  143 passed (143)`")).toEqual([]);
  });

  it("ignores checked lines inside a fenced block, closed or not", () => {
    expect(uncitedLines(["```text", "- [x] `npm test` : 143 tests", "```", "~~~", "- [x] 12 tests"].join("\n"))).toEqual([]);
  });

  it("ignores unchecked lines", () => {
    expect(uncitedLines("- [ ] `npm test` : 143 tests")).toEqual([]);
  });

  it("does not take a scenario or record identifier for a number", () => {
    expect(uncitedLines("- [x] R2 à R16 échouent, R11 utilise `D-0999`, sous Node v22")).toEqual([]);
  });

  it("does not take a ticket or PR reference for a number", () => {
    expect(uncitedLines("- [x] Fermé par #41, suite de #39")).toEqual([]);
  });

  it("does not take a long number or an all-letter hex word for a commit SHA", () => {
    const lines = [
      "- [x] 143 tests le 20261121",
      "- [x] 143 tests, commit `20261121`",
      "- [x] 143 tests defaced",
      "- [x] 143 tests, commit `deadbeef`",
    ];
    expect(uncitedLines(lines.join("\n"))).toEqual(lines);
  });

  it("reads checked boxes of numbered lists and boxes followed by a tab", () => {
    const lines = ["1. [x] 143 tests", "2) [X] 143 tests", "- [x]\t143 tests", "-\t[x] 143 tests"];
    expect(uncitedLines(lines.join("\n"))).toEqual(lines);
  });

  it("counts a CI job link written in inline code", () => {
    expect(
      uncitedLines(
        [
          "- [x] CI verte : `https://github.com/karAmmi12/migrabench/actions/runs/44953461587`, 143 tests",
          "- [x] CI verte : `actions/runs/44953461587/job/137267606175`, 143 tests",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("copies a line without its carriage return (Windows line endings)", () => {
    expect(uncitedLines("- [x] 143 tests\r\n- [x] 12 tests\r\n")).toEqual(["- [x] 143 tests", "- [x] 12 tests"]);
  });
});
