// Contrôle des preuves du plan de test d'une PR (#54) : chaque case cochée
// qui contient un nombre cite un état, un commit réel du dépôt (#96) ou une
// exécution de CI.
// Les corps réels des PR #41, #44, #48 et #50 sont copiés sous
// tests/fixtures/test-plans/ (gh pr view <N> --json body).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { refusedLines, resolveShaWithGit, type ShaResolution, uncitedLines } from "../scripts/test-plan-evidence.ts";

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

  // Cas réels (#96), résolus par le vrai Git du dépôt : 6253696 n'a que des
  // chiffres (#93), bcccdea que des lettres (#88). bcccdea n'est joignable que
  // par la tête de la PR #88.
  describe("a real commit cited by a SHA of digits only or letters only", () => {
    function expectReachable(sha: string): void {
      expect(
        resolveShaWithGit()(sha),
        `commit ${sha} introuvable localement : il faut l'historique complet et les têtes de PR (npm run fetch:pull-heads)`,
      ).toBe("commit");
    }

    it("accepts the line of #93 citing `6253696`", () => {
      expectReachable("6253696");
      expect(
        uncitedLines(
          "- [x] Tests sans pile, rouges d'abord, verts sur `6253696` : `tests/relay-fidelity.test.ts` et `tests/seam-b/dataset.test.ts`, 27 tests.",
        ),
      ).toEqual([]);
    });

    it("accepts the line of #88 citing commit bcccdea", () => {
      expectReachable("bcccdea");
      expect(
        uncitedLines(
          "- [x] `environment.lock` dans un vrai `measure.json` : mesure du candidat de référence au commit bcccdea, arbre propre, `completed`, 38 réussis sur 38, `environment.lock` = `{ \"takenAt\": \"2026-11-23T22:43:24.598Z\" }` (prise, sans reprise). Une seconde mesure lancée pendant celle-ci : code 4, `refused-lock`, rien d'écrit.",
        ),
      ).toEqual([]);
    });
  });

  it("does not take a long number or an all-letter hex word for a commit SHA", () => {
    const lines = [
      "- [x] 143 tests le 20261121",
      "- [x] 143 tests, commit `20261121`",
      "- [x] 143 tests defaced",
      "- [x] 143 tests, commit `deadbeef`",
    ];
    expect(refusedLines(lines.join("\n"))).toEqual([
      { line: lines[0], reason: expect.stringMatching(/^aucun état cité/) },
      { line: lines[1], reason: "20261121 : ce commit n'existe pas dans le dépôt" },
      { line: lines[2], reason: expect.stringMatching(/^aucun état cité/) },
      { line: lines[3], reason: "deadbeef : ce commit n'existe pas dans le dépôt" },
    ]);
  });

  // Test négatif de la porte : le seul « SHA » de la case n'existe pas.
  it("refuses a checked line whose only SHA names no commit of the repository", () => {
    const line = "- [x] `npm test` : 143 tests, commit `0123456789abcdef0123456789abcdef01234567`";
    expect(refusedLines(line)).toEqual([
      { line, reason: "0123456789abcdef0123456789abcdef01234567 : ce commit n'existe pas dans le dépôt" },
    ]);
  });

  it("counts a commit link, in prose or alone in inline code", () => {
    expect(
      uncitedLines(
        [
          "- [x] 143 tests sur [ce commit](https://github.com/karAmmi12/migrabench/commit/6253696)",
          "- [x] 143 tests sur `https://github.com/karAmmi12/migrabench/pull/93/commits/6253696`",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  // Ni l'ambiguïté (deux objets réels qui partagent 7 caractères : ~2^28
  // essais) ni une panne de Git ne se fabriquent sur le vrai dépôt : la
  // résolution est passée au contrôle.
  describe("with a given SHA resolution", () => {
    const line = "- [x] `npm test` : 143 tests, commit `6253696`";

    it("refuses an ambiguous abbreviated SHA and says so", () => {
      expect(refusedLines(line, () => "ambiguous")).toEqual([
        { line, reason: "6253696 : SHA abrégé ambigu, il désigne plusieurs commits du dépôt" },
      ]);
    });

    it("refuses the line when the commit cannot be checked, and says so", () => {
      expect(refusedLines(line, () => "unavailable")).toEqual([
        { line, reason: expect.stringMatching(/^6253696 : vérification impossible/) },
      ]);
    });

    it("needs no resolution for a CI run link", () => {
      expect(
        refusedLines("- [x] 143 tests, commit `6253696`, [CI](https://github.com/o/r/actions/runs/1)", () => "unavailable"),
      ).toEqual([]);
    });

    it("accepts the line when one of its SHAs names a commit", () => {
      const resolutions: Record<string, ShaResolution> = { "1111111": "missing", "6253696": "commit" };
      expect(refusedLines("- [x] 143 tests, commit 1111111 puis `6253696`", (sha) => resolutions[sha]!)).toEqual([]);
    });
  });

  describe("resolveShaWithGit", () => {
    // Dépôt fabriqué : 2000 fichiers et 2000 commits au contenu fixe, donc aux
    // SHA fixes. Parmi eux, des préfixes de 4 caractères partagés (Git en
    // accepte dès 4), trouvés à l'exécution.
    function collidingRepository(): { cwd: string; shared: (types: string[]) => string } {
      const cwd = mkdtempSync(join(tmpdir(), "migrabench-evidence-"));
      execFileSync("git", ["init", "--quiet", cwd]);
      const stream: string[] = [];
      for (let i = 0; i < 2000; i++) {
        const data = `blob ${i}\n`;
        stream.push("blob", `data ${Buffer.byteLength(data)}`, data);
        const message = `commit ${i}\n`;
        stream.push(
          "commit refs/heads/main",
          "committer Bench <bench@example.invalid> 0 +0000",
          `data ${Buffer.byteLength(message)}`,
          message,
        );
      }
      execFileSync("git", ["fast-import", "--quiet"], { cwd, input: `${stream.join("\n")}\n` });
      const objects = execFileSync("git", ["cat-file", "--batch-all-objects", "--batch-check=%(objectname) %(objecttype)"], {
        cwd,
        encoding: "utf8",
      });
      const byPrefix = new Map<string, string[]>();
      for (const [name, type] of objects.trim().split("\n").map((line) => line.split(" ") as [string, string])) {
        byPrefix.set(name.slice(0, 4), [...(byPrefix.get(name.slice(0, 4)) ?? []), type]);
      }
      return {
        cwd,
        shared: (types) => {
          const prefix = [...byPrefix].find(([, found]) => [...found].sort().join() === [...types].sort().join())?.[0];
          if (prefix === undefined) throw new Error(`aucun préfixe partagé par ${types.join(", ")}`);
          return prefix;
        },
      };
    }

    it("tells a commit, a prefix shared by two commits and a prefix shared by no commit apart", () => {
      const repository = collidingRepository();
      const resolve = resolveShaWithGit(repository.cwd);
      // ^{commit} désigne le seul commit d'un préfixe partagé avec un fichier.
      expect(resolve(repository.shared(["commit", "blob"]))).toBe("commit");
      expect(resolve(repository.shared(["commit", "commit"]))).toBe("ambiguous");
      expect(resolve(repository.shared(["blob", "blob"]))).toBe("missing");
    });

    it("cannot check a commit outside a repository", () => {
      expect(resolveShaWithGit(mkdtempSync(join(tmpdir(), "migrabench-evidence-")))("6253696")).toBe("unavailable");
    });

    // Un clone superficiel ne voit pas les commits anciens : il ne peut pas
    // dire qu'un commit n'existe pas.
    it("cannot check a commit in a shallow clone", () => {
      const clone = join(mkdtempSync(join(tmpdir(), "migrabench-evidence-")), "shallow");
      execFileSync("git", ["clone", "--quiet", "--depth", "1", `file://${process.cwd()}`, clone]);
      expect(resolveShaWithGit(clone)("6253696")).toBe("unavailable");
    });
  });

  it("does not count a SHA written in prose without context", () => {
    expect(uncitedLines("- [x] 143 tests (head 6253696)", () => "commit")).toEqual(["- [x] 143 tests (head 6253696)"]);
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

  it("removes inline code that spans two lines, as the training sheet check does", () => {
    expect(uncitedLines("- [x] `foo\n- [x] 12` bar")).toEqual([]);
  });

  it("does not take the number of a numbered list item for a number", () => {
    expect(uncitedLines("1. [x] Sélecteurs sémantiques seulement\n12) [x] Messages au texte exact")).toEqual([]);
  });
});
