// Seam A : images de la pile construites depuis la copie du dépôt (#102).
// Prérequis : la pile construite par `npm run stack:up` (ou, en CI, avec les
// variables de `scripts/stack-context-env.ts`), qui pose les labels.
// Test négatif : une copie dont un fichier du legacy diffère ne reconnaît pas
// l'image du legacy en cours, et le refus nomme le seul legacy.
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contextDigest, STACK_SERVICES, stackContextDigests, StackNotFromCopy, verifyStackImages } from "../../oracle/stack-images.ts";
import { ROOT } from "../../shared/root.ts";

let otherCopy: string;

beforeAll(async () => {
  // Une autre copie du dépôt, réduite aux contextes de construction de la pile,
  // dont un piège du legacy diffère.
  otherCopy = await mkdtemp(join(tmpdir(), "mb-other-copy-"));
  for (const path of [".dockerignore", "fixtures", "scripts"]) {
    await cp(join(ROOT, path), join(otherCopy, path), { recursive: true, filter: (source) => !/\/(node_modules|target)(\/|$)/.test(source) });
  }
  await writeFile(join(otherCopy, "fixtures/legacy-app/TRAPS-changed-elsewhere.txt"), "unused");
  await writeFile(join(otherCopy, "fixtures/legacy-app/pom.xml"), "<!-- changed on another branch -->\n", { flag: "a" });
});

afterAll(async () => {
  await rm(otherCopy, { recursive: true, force: true });
});

describe("verifyStackImages", () => {
  it("accepts the running stack when its images were built from this copy", async () => {
    await expect(verifyStackImages(await stackContextDigests())).resolves.toBeUndefined();
  });

  it("detects a legacy image built from content that differs from this copy, and names it", async () => {
    const expected = { ...(await stackContextDigests()), legacy: await contextDigest(otherCopy, STACK_SERVICES.legacy.dockerfile) };
    const refusal = await verifyStackImages(expected).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(StackNotFromCopy);
    expect((refusal as Error).message).toMatch(/legacy image sha256:[0-9a-f]{64} carries sha256:[0-9a-f]{64}, this copy gives sha256:/);
    expect((refusal as Error).message).toContain(expected.legacy);
    expect((refusal as Error).message).not.toMatch(/archive image/);
  });
});
