// Sel de développement (`npm run stack:up`) : où `npm test` lit le sel de la
// pile, sans démarrer la pile.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { checkStackSalt, DEV_SALT_FILE_FROM_ROOT, resolveArchiveSalt } from "../scripts/dev-archive-salt.ts";

const SALT = "00112233445566778899aabbccddeeff";
const OTHER_SALT = "ffeeddccbbaa99887766554433221100";

describe("archive salt for npm test", () => {
  it("takes ARCHIVE_SALT from the environment first", () => {
    expect(resolveArchiveSalt({ ARCHIVE_SALT: SALT }, OTHER_SALT)).toBe(SALT);
  });

  it("falls back to the development salt written by npm run stack:up", () => {
    expect(resolveArchiveSalt({}, `${SALT}\n`)).toBe(SALT);
  });

  it.each([
    { name: "no salt at all", env: {}, devSalt: undefined },
    { name: "an empty ARCHIVE_SALT and no development salt", env: { ARCHIVE_SALT: "" }, devSalt: undefined },
    { name: "an empty development salt", env: {}, devSalt: "\n" },
  ])("fails explicitly with $name", ({ env, devSalt }) => {
    expect(() => resolveArchiveSalt(env, devSalt)).toThrow("npm run stack:up");
  });

  it("refuses a salt that is not hexadecimal", () => {
    expect(() => resolveArchiveSalt({ ARCHIVE_SALT: "phrase de passe" }, undefined)).toThrow("hexadecimal");
  });

  it("keeps the development salt file out of Git", () => {
    const ignored = execFileSync("git", ["check-ignore", DEV_SALT_FILE_FROM_ROOT], { encoding: "utf8" });

    expect(ignored.trim()).toBe(DEV_SALT_FILE_FROM_ROOT);
  });
});

describe("stack salt check", () => {
  it("accepts a stack that runs with the salt of npm test", () => {
    expect(() => checkStackSalt(SALT, SALT)).not.toThrow();
  });

  it.each([
    { name: "another salt, as after npm run oracle", stackSalt: OTHER_SALT },
    { name: "no salt", stackSalt: undefined },
  ])("asks to rerun npm run stack:up when the stack runs with $name", ({ stackSalt }) => {
    expect(() => checkStackSalt(stackSalt, SALT)).toThrow(
      "The stack does not run with the archive salt of npm test: rerun `npm run stack:up`",
    );
  });

  it("never shows either salt in the message", () => {
    let message = "";
    try {
      checkStackSalt(OTHER_SALT, SALT);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("npm run stack:up");
    expect(message).not.toContain(SALT);
    expect(message).not.toContain(OTHER_SALT);
  });
});
