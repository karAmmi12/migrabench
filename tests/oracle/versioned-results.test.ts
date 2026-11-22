// Chaque résultat de l'oracle versionné dans results/oracle/ passe le contrôle
// de oracle/result-check.ts (#53) : arbre propre, Node de .nvmrc, sel tiré,
// commit du banc connu, aucun chemin machine.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FETCH_PULL_HEADS, repositoryEnvironment } from "../../oracle/repository.ts";
import { checkResult, formatViolation, type CheckedResult, type ResultRule } from "../../oracle/result-check.ts";

const ROOT = new URL("../../", import.meta.url);
const RESULTS_DIR = "results/oracle";

// Règles dont un résultat est dispensé, avec la raison. Un résultat n'est
// jamais réécrit (ADR 0005) : il est dispensé, nommément, de la seule règle
// qu'il ne pouvait pas suivre.
const EXEMPTIONS: Readonly<Record<string, { rule: ResultRule; reason: string }>> = {
  "20261121T164222Z-6c34da6.json": {
    rule: "saltImposed",
    reason: "fil traceur (#32), écrit avant que la collecte enregistre saltImposed",
  },
};

const environment = repositoryEnvironment(ROOT);
const files = readdirSync(new URL(RESULTS_DIR, ROOT))
  .filter((name) => name.endsWith(".json"))
  .sort();

describe("versioned oracle results", () => {
  it("there are versioned results to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s passes the oracle result check", (name) => {
    const file = `${RESULTS_DIR}/${name}`;
    const result = JSON.parse(readFileSync(new URL(file, ROOT), "utf8")) as CheckedResult;
    const violations = checkResult(result, environment).filter(({ rule }) => rule !== EXEMPTIONS[name]?.rule);
    const hint = violations.some(({ rule }) => rule === "benchCommit")
      ? `\nThe bench commit may only be reachable from its pull request head: ${FETCH_PULL_HEADS}`
      : "";
    const messages = violations.map((violation) => formatViolation(file, violation));
    expect(messages, `${messages.join("\n")}${hint}`).toEqual([]);
  });

  it("every exemption names a versioned result", () => {
    expect(Object.keys(EXEMPTIONS).filter((name) => !files.includes(name))).toEqual([]);
  });
});
