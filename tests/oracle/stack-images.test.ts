// Images de la pile construites depuis la copie du dépôt (#102) : l'empreinte
// du contexte de construction, portée par le label de chaque image. Elle prend
// tout le contexte, moins ce que .dockerignore exclut, avec la sémantique de
// Docker : un fichier qu'aucun COPY ne cite la change aussi.
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contextDigest } from "../../oracle/stack-images.ts";

let root: string;

async function put(path: string, content: string): Promise<void> {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), content);
}

// Empreinte avant et après `change` : rend les deux.
async function around(change: () => Promise<void>): Promise<[string, string]> {
  const before = await contextDigest(root);
  await change();
  return [before, await contextDigest(root)];
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "mb-stack-context-"));
  await put(".dockerignore", ["**/node_modules", "**/target", "*.har", "results", "/.oracle-artifacts", "docs/*.md", "!docs/KEEP.md", ""].join("\n"));
  await put("app/Dockerfile", "FROM tomcat:9\nCOPY app/src src\n");
  await put("app/src/Main.java", "class Main {}");
  await put("scripts/users.ts", "export {};");
  await put("docs/KEEP.md", "kept");
  await put("docs/notes.md", "notes");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("contextDigest", () => {
  it("is a cited SHA-256, stable for the same content", async () => {
    const digest = await contextDigest(root);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await contextDigest(root)).toBe(digest);
  });

  it("changes when a file of the context that no COPY cites changes", async () => {
    const [before, after] = await around(() => put("scripts/users.ts", "export const changed = 1;"));
    expect(after).not.toBe(before);
  });

  it("changes when a file is added anywhere in the context, or when a file moves", async () => {
    const [before, added] = await around(() => put("unrelated.txt", "x"));
    expect(added).not.toBe(before);
    await rm(join(root, "unrelated.txt"));
    await put("other/unrelated.txt", "x");
    expect(await contextDigest(root)).not.toBe(added);
  });

  it("changes when the Dockerfile or .dockerignore changes", async () => {
    const [before, dockerfile] = await around(() => put("app/Dockerfile", "FROM tomcat:9\n"));
    expect(dockerfile).not.toBe(before);
    const [, dockerignore] = await around(() => put(".dockerignore", "**/node_modules\n"));
    expect(dockerignore).not.toBe(dockerfile);
  });

  it("changes when a symbolic link changes its target", async () => {
    await symlink("Main.java", join(root, "app/src/link"));
    const [before, after] = await around(async () => {
      await rm(join(root, "app/src/link"));
      await symlink("Other.java", join(root, "app/src/link"));
    });
    expect(after).not.toBe(before);
  });

  it("ignores what .dockerignore excludes: a directory with all it holds, at any depth with **", async () => {
    const [before, after] = await around(async () => {
      await put("app/src/target/classes/Main.class", "bytes");
      await put("fixtures/x/node_modules/y/index.js", "module");
      await put("results/diagnostic/m/measure.json", "{}");
      await put(".oracle-artifacts/m/trace.zip", "zip");
      await put("trace.har", "har");
    });
    expect(after).toBe(before);
  });

  it("anchors a pattern without ** at the root of the context, as Docker does", async () => {
    const [before, after] = await around(() => put("sub/trace.har", "har"));
    expect(after).not.toBe(before);
  });

  it("keeps a file that an exception pattern brings back", async () => {
    const [before, excluded] = await around(() => put("docs/notes.md", "changed"));
    expect(excluded).toBe(before);
    const [, kept] = await around(() => put("docs/KEEP.md", "changed"));
    expect(kept).not.toBe(excluded);
  });
});
