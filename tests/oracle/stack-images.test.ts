// Images de la pile construites depuis la copie du dépôt (#102) : l'empreinte
// du contexte de construction d'un service, portée par le label de son image.
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contextDigest } from "../../oracle/stack-images.ts";

let root: string;

async function put(path: string, content: string): Promise<void> {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), content);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "mb-stack-images-"));
  await put(".dockerignore", "**/node_modules\n**/target\n*.har\n");
  await put(
    "app/Dockerfile",
    [
      "# Contexte : racine.",
      "FROM node:22 AS users",
      "COPY shared/users.json \\",
      "     users.json",
      "FROM tomcat:9",
      "COPY --from=users /work/out.xml /etc/out.xml",
      "COPY --chown=1000 app/src src",
      "RUN echo done",
      "",
    ].join("\n"),
  );
  await put("shared/users.json", "[]");
  await put("app/src/Main.java", "class Main {}");
  await put("app/src/web/index.jsp", "<p>");
  await put("unrelated.txt", "x");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("contextDigest", () => {
  it("is a cited SHA-256, stable for the same content", async () => {
    const digest = await contextDigest(root, "app/Dockerfile");
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await contextDigest(root, "app/Dockerfile")).toBe(digest);
  });

  it("changes when a file copied by the Dockerfile changes, at any depth", async () => {
    const before = await contextDigest(root, "app/Dockerfile");
    await put("app/src/web/index.jsp", "<p>changed");
    expect(await contextDigest(root, "app/Dockerfile")).not.toBe(before);
  });

  it("changes when a single copied file changes, or when the Dockerfile changes", async () => {
    const before = await contextDigest(root, "app/Dockerfile");
    await put("shared/users.json", "[{}]");
    const afterUsers = await contextDigest(root, "app/Dockerfile");
    expect(afterUsers).not.toBe(before);
    await put("app/Dockerfile", "FROM tomcat:9\nCOPY shared/users.json users.json\nCOPY app/src src\n");
    expect(await contextDigest(root, "app/Dockerfile")).not.toBe(afterUsers);
  });

  it("changes when a file is added under a copied directory", async () => {
    const before = await contextDigest(root, "app/Dockerfile");
    await put("app/src/Other.java", "class Other {}");
    expect(await contextDigest(root, "app/Dockerfile")).not.toBe(before);
  });

  it("ignores files the Dockerfile does not copy, and those .dockerignore leaves out", async () => {
    const before = await contextDigest(root, "app/Dockerfile");
    await put("unrelated.txt", "y");
    await put("app/src/target/classes/Main.class", "bytes");
    await put("app/src/node_modules/x/index.js", "module");
    expect(await contextDigest(root, "app/Dockerfile")).toBe(before);
  });

  it("refuses a COPY form it cannot read, rather than miss a source", async () => {
    await put("app/Dockerfile", 'FROM tomcat:9\nCOPY ["app/src", "src"]\n');
    await expect(contextDigest(root, "app/Dockerfile")).rejects.toThrow(/COPY/);
    await put("app/Dockerfile", "FROM tomcat:9\nCOPY app/src/*.java src/\n");
    await expect(contextDigest(root, "app/Dockerfile")).rejects.toThrow(/COPY/);
    await put("app/Dockerfile", "FROM tomcat:9\nADD app/src src\n");
    await expect(contextDigest(root, "app/Dockerfile")).rejects.toThrow(/ADD/);
  });
});
