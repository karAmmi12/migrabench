// Hook SessionStart (#52) : il ajoute au PATH le dossier du Node de .nvmrc
// installé par nvm, sans charger nvm. Dossier absent : rien n'est écrit, et un
// avertissement s'affiche (systemMessage). L'ouverture de session n'échoue jamais.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const hook = new URL("../.claude/hooks/use-nvmrc-node.sh", import.meta.url).pathname;

// Un dépôt (avec son .nvmrc) et un NVM_DIR temporaires.
function setup(nvmrc: string, installed: string[]) {
  const root = mkdtempSync(join(tmpdir(), "mb-session-hook-"));
  const project = join(root, "project");
  const nvmDir = join(root, "nvm");
  mkdirSync(project);
  writeFileSync(join(project, ".nvmrc"), nvmrc);
  for (const version of installed) mkdirSync(join(nvmDir, "versions", "node", version, "bin"), { recursive: true });
  const envFile = join(root, "env");
  const stdout = execFileSync("sh", [hook], {
    env: { PATH: "/usr/bin:/bin", HOME: root, NVM_DIR: nvmDir, CLAUDE_PROJECT_DIR: project, CLAUDE_ENV_FILE: envFile },
    encoding: "utf8",
  });
  return { nvmDir, envFile, stdout };
}

describe("use-nvmrc-node hook", () => {
  it("prepends the bin folder of the .nvmrc Node to PATH, without loading nvm", () => {
    const { nvmDir, envFile, stdout } = setup("22.23.5\n", ["v22.23.5", "v24.12.0"]);

    expect(readFileSync(envFile, "utf8")).toBe(`export PATH="${nvmDir}/versions/node/v22.23.5/bin:$PATH"\n`);
    expect(stdout).toBe("");
  });

  it("writes nothing and warns when the .nvmrc Node is not installed", () => {
    const { envFile, stdout } = setup("22.23.5\n", ["v24.12.0"]);

    expect(existsSync(envFile)).toBe(false);
    const { systemMessage } = JSON.parse(stdout) as { systemMessage: string };
    expect(systemMessage).toContain("22.23.5");
    expect(systemMessage).toContain("nvm install 22.23.5");
  });
});
