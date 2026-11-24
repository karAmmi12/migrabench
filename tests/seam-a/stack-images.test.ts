// Seam A : images de la pile construites depuis la copie du dépôt (#102).
// Prérequis : la pile construite par `npm run stack:up` (ou, en CI, avec les
// variables de `scripts/stack-context-env.ts`), qui pose les labels.
// Test négatif : une copie dont un fichier du legacy diffère ne reconnaît pas
// l'image du legacy en cours, et le refus nomme le seul legacy.
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contextDigest, STACK_SERVICES, stackContextDigests, StackNotFromCopy, verifyBuiltImages, verifyStackImages } from "../../oracle/stack-images.ts";
import { ROOT } from "../../shared/root.ts";

let otherCopy: string;
// Empreinte du contexte du legacy sur une copie identique, puis sur la même
// copie une fois un fichier du legacy modifié.
let identical: string;
let changed: string;

beforeAll(async () => {
  // Une autre copie du dépôt, sans ce que .dockerignore exclut de toute façon
  // (dont les gros dossiers).
  otherCopy = await mkdtemp(join(tmpdir(), "mb-other-copy-"));
  await cp(ROOT, otherCopy, { recursive: true, filter: (source) => !/^\/(node_modules|\.git|\.oracle-artifacts|results|test-results)(\/|$)|\/(node_modules|target)(\/|$)/.test(`/${relative(ROOT, source)}`) });
  identical = await contextDigest(join(otherCopy, STACK_SERVICES.legacy.context));
  await writeFile(join(otherCopy, "fixtures/legacy-app/pom.xml"), "<!-- changed on another branch -->\n", { flag: "a" });
  changed = await contextDigest(join(otherCopy, STACK_SERVICES.legacy.context));
});

afterAll(async () => {
  await rm(otherCopy, { recursive: true, force: true });
});

describe("contextDigest of another copy of the repository", () => {
  it("is the same for an identical copy, and differs once a single file of the legacy changes", async () => {
    expect(identical).toBe((await stackContextDigests()).legacy);
    expect(changed).not.toBe(identical);
  });
});

// Images construites (préparation d'une mesure) et images des conteneurs en
// cours (recréation de la pile) : même refus.
describe.each([
  ["verifyBuiltImages", verifyBuiltImages],
  ["verifyStackImages", verifyStackImages],
] as const)("%s", (_name, verify) => {
  it("accepts the stack images when they were built from this copy", async () => {
    await expect(verify(await stackContextDigests())).resolves.toBeUndefined();
  });

  it("detects a legacy image built from content that differs from this copy, and names it", async () => {
    const expected = { ...(await stackContextDigests()), legacy: changed };
    const refusal = await verify(expected).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(StackNotFromCopy);
    expect((refusal as Error).message).toMatch(/legacy image sha256:[0-9a-f]{64} carries sha256:[0-9a-f]{64}, this copy gives sha256:/);
    expect((refusal as Error).message).toContain(expected.legacy);
    expect((refusal as Error).message).not.toMatch(/archive image/);
    expect((refusal as Error).message).toContain("Remedy: run `npm run stack:up` from this copy of the repository.");
  });
});
