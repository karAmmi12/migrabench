// Gardes du script qui verse le dépôt Maven dans le cache de construction du
// legacy, ou l'en extrait (#149). Les appels à Docker se prouvent en CI.
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = new URL("../scripts/maven-cache.sh", import.meta.url).pathname;
const legacyDockerfile = readFileSync(new URL("../fixtures/legacy-app/Dockerfile", import.meta.url), "utf8");

type Outcome = { code: number; stderr: string };

async function run(args: string[], dockerfile?: string): Promise<Outcome> {
  const env = { ...process.env };
  if (dockerfile !== undefined) {
    const dir = mkdtempSync(join(tmpdir(), "mb-maven-cache-"));
    env.MB_LEGACY_DOCKERFILE = join(dir, "Dockerfile");
    writeFileSync(env.MB_LEGACY_DOCKERFILE, dockerfile);
  }
  try {
    const { stderr } = await execFileAsync("bash", [script, ...args], { env });
    return { code: 0, stderr };
  } catch (error) {
    const failure = error as { code: number; stderr: string };
    return { code: failure.code, stderr: failure.stderr };
  }
}

// Un dossier absent : l'import s'arrête après les gardes, avant Docker.
const missing = join(tmpdir(), "mb-maven-cache-missing-directory");

describe("maven cache script", () => {
  it("refuses a call without a mode and a directory", async () => {
    expect(await run([])).toMatchObject({ code: 2, stderr: expect.stringContaining("usage:") });
  });

  it("refuses an unknown mode", async () => {
    expect(await run(["restore", missing])).toMatchObject({ code: 2, stderr: expect.stringContaining("usage:") });
  });

  it("passes its guards on the legacy Dockerfile", async () => {
    expect(await run(["import", missing])).toEqual({ code: 1, stderr: `No directory ${missing}\n` });
  });

  it("refuses a Dockerfile without a Maven build stage", async () => {
    const dockerfile = legacyDockerfile.replace(/^FROM maven:\S+ AS build$/m, "FROM eclipse-temurin:8 AS build");

    const { code, stderr } = await run(["import", missing], dockerfile);

    expect(code).toBe(1);
    expect(stderr).toContain("No 'FROM maven:… AS build' stage");
  });

  it("refuses a Dockerfile that does not mount the cache", async () => {
    const dockerfile = legacyDockerfile.replaceAll("id=migrabench-maven-repository,", "id=other,");

    const { code, stderr } = await run(["import", missing], dockerfile);

    expect(code).toBe(1);
    expect(stderr).toContain("does not mount the cache migrabench-maven-repository");
  });

  it("passes its guards on a copy of the legacy Dockerfile", async () => {
    expect(await run(["import", missing], legacyDockerfile)).toEqual({ code: 1, stderr: `No directory ${missing}\n` });
  });
});
