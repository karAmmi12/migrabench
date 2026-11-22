// Chaque résultat de l'oracle versionné dans results/oracle/ passe le contrôle
// de oracle/result-check.ts (#53) : arbre propre, Node de .nvmrc, sel tiré,
// commit du banc connu, aucun chemin machine.
//
// Les PR sont fusionnées en squash : le commit du banc d'un résultat n'est pas
// un ancêtre de main, il n'est joignable que par la tête de sa PR
// (refs/pull/N/head). La CI récupère ces têtes (tests.yml) ; en local, la même
// commande est rappelée dans le message d'échec.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkResult, type CheckedResult } from "../../oracle/result-check.ts";

const ROOT = new URL("../../", import.meta.url);
const RESULTS_DIR = "results/oracle";

const FETCH_PULL_HEADS = "git fetch origin '+refs/pull/*/head:refs/remotes/origin/pull/*'";

// Règles dont un résultat est dispensé, avec la raison. Un résultat n'est
// jamais réécrit (ADR 0005) : il est dispensé, nommément, de la seule règle
// qu'il ne pouvait pas suivre.
const EXEMPTIONS: Readonly<Record<string, { rule: string; reason: string }>> = {
  "20261121T164222Z-6c34da6.json": {
    rule: "saltImposed",
    reason: "fil traceur (#32), écrit avant que la collecte enregistre saltImposed",
  },
};

function commitExists(sha: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const node = readFileSync(new URL(".nvmrc", ROOT), "utf8").trim();
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
    const exemption = EXEMPTIONS[name];
    const problems = checkResult(file, result, { node, commitExists }).filter(
      (problem) => exemption === undefined || !problem.startsWith(`${file}: rule ${exemption.rule}:`),
    );
    const hint = problems.some((problem) => problem.includes("is not a commit of this repository"))
      ? `\nThe bench commit may only be reachable from its pull request head: ${FETCH_PULL_HEADS}`
      : "";
    expect(problems, `${problems.join("\n")}${hint}`).toEqual([]);
  });

  it("every exemption names a versioned result", () => {
    expect(Object.keys(EXEMPTIONS).filter((name) => !files.includes(name))).toEqual([]);
  });
});
