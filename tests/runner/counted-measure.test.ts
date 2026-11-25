// `migrabench measure --counted` de bout en bout (#73), lancé dans une copie
// du banc : un dépôt temporaire dont `origin` est un dépôt nu local. Le
// `git fetch` reste sur la machine, sans réseau et sans toucher aux
// références du dépôt du banc. Un faux `docker` note chaque appel, et le
// verrou du banc est pris dans un XDG_STATE_HOME temporaire.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../shared/root.ts";

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}

// Copie du banc tel qu'il est dans l'arbre de travail (fichiers suivis et
// nouveaux fichiers non ignorés), publiée sur un `origin` local.
function publishedCopy(): string {
  const base = mkdtempSync(join(tmpdir(), "mb-counted-measure-"));
  const copy = join(base, "bench");
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((file) => file !== "" && existsSync(join(ROOT, file)));
  for (const file of files) {
    mkdirSync(dirname(join(copy, file)), { recursive: true });
    copyFileSync(join(ROOT, file), join(copy, file));
  }
  // Ignorés par Git : ils ne rendent pas l'arbre modifié.
  symlinkSync(join(ROOT, "node_modules"), join(copy, "node_modules"));
  copyFileSync(join(ROOT, ".env"), join(copy, ".env"));
  const origin = join(base, "origin.git");
  git(base, "init", "-q", "--bare", "--initial-branch=main", origin);
  git(copy, "init", "-q", "--initial-branch=main");
  git(copy, "add", "-A");
  git(copy, "commit", "-q", "-m", "bench");
  git(copy, "remote", "add", "origin", origin);
  git(copy, "push", "-q", "origin", "main");
  return copy;
}

function fakeDocker(): { dir: string; log: string } {
  const dir = mkdtempSync(join(tmpdir(), "mb-docker-stub-"));
  const log = join(dir, "calls.log");
  writeFileSync(join(dir, "docker"), `#!/bin/sh\necho "$*" >> "${log}"\necho "docker stub" >&2\nexit 97\n`);
  chmodSync(join(dir, "docker"), 0o755);
  return { dir, log };
}

function measure(copy: string, args: readonly string[], env: Record<string, string> = {}) {
  const docker = fakeDocker();
  const state = mkdtempSync(join(tmpdir(), "mb-state-"));
  const { ORACLE_SALT: _salt, ...inherited } = process.env;
  const { status, stderr } = spawnSync(process.execPath, ["runner/cli.ts", "measure", "--counted", "--candidate", "fixtures/reference-candidate", ...args], {
    cwd: copy,
    env: { ...inherited, PATH: `${docker.dir}:${process.env.PATH}`, XDG_STATE_HOME: state, ...env },
    encoding: "utf8",
  });
  const dockerCalls = existsSync(docker.log) ? readFileSync(docker.log, "utf8").trim().split("\n") : [];
  return { status, stderr, dockerCalls, lockDir: join(state, "migrabench") };
}

function entries(copy: string, dir: string): string[] {
  return existsSync(join(copy, dir)) ? readdirSync(join(copy, dir)) : [];
}

// Entrées apparues dans `dir` depuis `before` : la copie du banc contient déjà
// les mesures comptées versionnées dans results/counted/ (#74).
function added(copy: string, dir: string, before: readonly string[]): string[] {
  return entries(copy, dir).filter((entry) => !before.includes(entry));
}

describe("migrabench measure --counted", { timeout: 60_000 }, () => {
  it("is refused with exit code 4, naming every missing condition, writing nothing and leaving the stack and the bench lock alone", () => {
    const copy = publishedCopy();
    // Sans étalonnage versionné, dans un commit que origin/main n'a pas.
    git(copy, "rm", "-q", "-r", "results/calibration");
    git(copy, "commit", "-q", "-m", "no calibration");
    writeFileSync(join(copy, "untracked.txt"), "modified worktree");
    const versioned = entries(copy, "results/counted");

    const result = measure(copy, ["--timeout-cap-ms", "5000"], { ORACLE_SALT: "imposed" });

    expect(result.status).toBe(4);
    expect(result.stderr).toContain("refused-counted: a measure planned to count must start from a published state; missing conditions:");
    for (const condition of [
      "the worktree is modified",
      "HEAD is not reachable from origin/main",
      "the salt is imposed (ORACLE_SALT)",
      "a timeout cap is imposed (--timeout-cap-ms)",
      "no calibration result is versioned in results/calibration/",
    ]) {
      expect(result.stderr).toContain(`  - ${condition}`);
    }
    expect(result.dockerCalls).toEqual([]);
    expect(existsSync(result.lockDir)).toBe(false);
    expect([...entries(copy, "results/diagnostic"), ...added(copy, "results/counted", versioned), ...entries(copy, ".oracle-artifacts")]).toEqual([]);
  });

  it("starts from a published state and writes its directory under results/counted/, not results/diagnostic/", () => {
    const copy = publishedCopy();
    const versioned = entries(copy, "results/counted");

    const result = measure(copy, []);

    // Le faux `docker` arrête la mesure à la construction de l'image d'exécution.
    expect(result.stderr).not.toContain("refused-counted");
    expect(result.dockerCalls[0]).toMatch(/^build /);
    expect(added(copy, "results/counted", versioned)).toEqual([expect.stringMatching(/-reference-candidate$/)]);
    expect(entries(copy, "results/diagnostic")).toEqual([]);
  });
});
