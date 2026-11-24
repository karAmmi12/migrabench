// Le script du job « Fiche de formation » (#54) : lit le corps de la PR dans
// PR_BODY, recopie chaque ligne refusée dans une annotation ::error::, avec
// la raison (#96), et sort en échec.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = new URL("../scripts/check-test-plan-evidence.ts", import.meta.url).pathname;

async function check(body: string): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await execFileAsync(process.execPath, [script], { env: { ...process.env, PR_BODY: body } });
    return { code: 0, stdout };
  } catch (error) {
    const failure = error as { code: number; stdout: string };
    return { code: failure.code, stdout: failure.stdout };
  }
}

describe("check-test-plan-evidence script", () => {
  it("fails with one ::error:: annotation per refused line, giving the reason and copying the line", async () => {
    const outcome = await check(
      [
        "- [x] `npm test` : 143 tests",
        "- [x] 100% des scénarios",
        "- [x] `npm test` : 143 tests, commit `62bd7cd`",
        "- [x] `npm test` : 143 tests, commit `deadbeef`",
      ].join("\n"),
    );
    expect(outcome).toEqual({
      code: 1,
      stdout: [
        "::error::Case cochée chiffrée refusée, aucun état cité (SHA d'un commit du dépôt ou lien de job de CI actions/runs/<id>) : - [x] `npm test` : 143 tests",
        "::error::Case cochée chiffrée refusée, aucun état cité (SHA d'un commit du dépôt ou lien de job de CI actions/runs/<id>) : - [x] 100%25 des scénarios",
        "::error::Case cochée chiffrée refusée, deadbeef : ce commit n'existe pas dans le dépôt : - [x] `npm test` : 143 tests, commit `deadbeef`",
        "",
      ].join("\n"),
    });
  });

  it("passes when every checked line with a number cites a state", async () => {
    expect(await check("- [x] `npm test` : 143 tests, commit `62bd7cd`\n- [ ] 12 tests")).toEqual({
      code: 0,
      stdout: "Chaque case cochée chiffrée cite un état.\n",
    });
  });

  it("passes on an empty body", async () => {
    expect((await check("")).code).toBe(0);
  });
});
