// Garde de `npm test` (#23) et de `npm run oracle` (#37) : la version exacte
// de Node fixée dans .nvmrc.
import { execFile } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = new URL("../scripts/check-node-version.mjs", import.meta.url).pathname;
const running = process.versions.node;

type Outcome = { code: number; stderr: string };

// Le script lit ../.nvmrc à partir de son propre dossier : on le copie dans un
// dépôt temporaire qui porte le .nvmrc du cas.
function repoWith(nvmrc: string): string {
  const root = mkdtempSync(join(tmpdir(), "mb-node-version-"));
  mkdirSync(join(root, "scripts"));
  copyFileSync(script, join(root, "scripts", "check-node-version.mjs"));
  writeFileSync(join(root, ".nvmrc"), nvmrc);
  return root;
}

async function outcomeOf(run: Promise<{ stderr: string }>): Promise<Outcome> {
  try {
    const { stderr } = await run;
    return { code: 0, stderr };
  } catch (error) {
    const failure = error as { code: number; stderr: string };
    return { code: failure.code, stderr: failure.stderr };
  }
}

// `event` : le script npm qui lance la garde (npm_lifecycle_event).
async function check(nvmrc: string, event = "pretest"): Promise<Outcome> {
  const root = repoWith(nvmrc);
  return outcomeOf(
    execFileAsync(process.execPath, [join(root, "scripts", "check-node-version.mjs")], {
      env: { ...process.env, npm_lifecycle_event: event },
    }),
  );
}

// `npm run oracle` dans un dépôt temporaire qui reprend les scripts de
// package.json : la garde doit refuser avant que l'oracle ne démarre.
async function npmRunOracle(nvmrc: string): Promise<Outcome> {
  const root = repoWith(nvmrc);
  copyFileSync(new URL("../package.json", import.meta.url), join(root, "package.json"));
  return outcomeOf(execFileAsync("npm", ["run", "oracle"], { cwd: root }));
}

function otherPatch(version: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${(patch ?? 0) + 1}`;
}

describe("check-node-version", () => {
  it("accepte la version exacte de .nvmrc", async () => {
    expect(await check(`${running}\n`)).toEqual({ code: 0, stderr: "" });
  });

  it("accepte une version écrite avec le préfixe v", async () => {
    expect((await check(`v${running}\n`)).code).toBe(0);
  });

  it("refuse une autre version de la même majeure", async () => {
    const expected = otherPatch(running);
    const outcome = await check(`${expected}\n`);
    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain(`requires Node ${expected} (.nvmrc), found v${running}`);
  });

  it("refuse une autre version majeure", async () => {
    const outcome = await check("1.0.0\n");
    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain("nvm use");
  });

  it("nomme npm test quand il garde npm test", async () => {
    const outcome = await check("1.0.0\n", "pretest");
    expect(outcome.stderr).toContain("npm test requires Node 1.0.0");
    expect(outcome.stderr).toContain("then `npm test` again");
  });

  it("nomme npm run oracle quand il garde npm run oracle", async () => {
    const outcome = await check("1.0.0\n", "preoracle");
    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain("npm run oracle requires Node 1.0.0 (.nvmrc)");
    expect(outcome.stderr).toContain("then `npm run oracle` again");
  });

  it("npm run oracle refuse de démarrer sous une autre version que .nvmrc", async () => {
    const outcome = await npmRunOracle("1.0.0\n");
    expect(outcome.code).not.toBe(0);
    expect(outcome.stderr).toContain(`npm run oracle requires Node 1.0.0 (.nvmrc), found v${running}`);
  });
});
