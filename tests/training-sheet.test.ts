// Vérification de fiche du job « Fiche de formation », portée du perl vers
// TypeScript (#54) : une PR qui ferme un ticket apporte sa fiche
// docs/formation/journal/N-*.md.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { closedTickets } from "../scripts/training-sheet.ts";

const execFileAsync = promisify(execFile);
const script = new URL("../scripts/check-training-sheet.ts", import.meta.url).pathname;

describe("closedTickets", () => {
  it("reads every GitHub closing keyword, in any case, with an optional colon", () => {
    expect(
      closedTickets("close #1, Closes #2, closed #3, FIX #4, fixes: #5, Fixed #6, resolve #7, Resolves #8, resolved: #9"),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("returns each ticket once, sorted", () => {
    expect(closedTickets("Closes #12\nFixes #3\ncloses #12")).toEqual([3, 12]);
  });

  it("ignores keywords written in code, inline or fenced", () => {
    expect(closedTickets("`Closes #1`\n```\nCloses #2\n```\n~~~\nCloses #3")).toEqual([]);
  });

  it("ignores a keyword inside a word or without a space before #", () => {
    expect(closedTickets("disclosed #1, prefixes #2, Closes#3")).toEqual([]);
  });
});

async function check(body: string): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await execFileAsync(process.execPath, [script], { env: { ...process.env, PR_BODY: body } });
    return { code: 0, stdout };
  } catch (error) {
    const failure = error as { code: number; stdout: string };
    return { code: failure.code, stdout: failure.stdout };
  }
}

describe("check-training-sheet script", () => {
  it("has nothing to check when the PR closes no ticket", async () => {
    expect(await check("Suite de #53")).toEqual({ code: 0, stdout: "Aucun ticket fermé par la PR : rien à vérifier.\n" });
  });

  it("finds the sheet of a closed ticket", async () => {
    expect(await check("Closes #53")).toEqual({ code: 0, stdout: "Fiche trouvée pour #53.\n" });
  });

  it("fails with an ::error:: annotation for a closed ticket without its sheet", async () => {
    expect(await check("Closes #53\nFixes #99999")).toEqual({
      code: 1,
      stdout: [
        "Fiche trouvée pour #53.",
        "::error::Fiche manquante pour #99999 : ajouter docs/formation/journal/99999-<nom-court>.md (lancer /fiche-ticket).",
        "",
      ].join("\n"),
    });
  });
});
