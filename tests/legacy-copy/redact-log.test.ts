// Expurgation du journal d'un candidat d'essai (procédure, étape 4, #125).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { filesContaining, redactLog, sessionIdsOf } from "../../scripts/redact-log.ts";

describe("redactLog", () => {
  it("replaces every occurrence and counts them by label", () => {
    const result = redactLog("cd /Users/karim/x && echo karim /Users/karim", [
      { label: "<USER>", value: "karim" },
      { label: "<HOME>", value: "/Users/karim" },
    ]);

    expect(result.text).toBe("cd <HOME>/x && echo <USER> <HOME>");
    expect(result.counts).toEqual({ "<HOME>": 2, "<USER>": 1 });
  });

  it("ignores an empty value", () => {
    expect(redactLog("abc", [{ label: "<USER>", value: "" }])).toEqual({ text: "abc", counts: { "<USER>": 0 } });
  });
});

describe("sessionIdsOf", () => {
  it("finds the session ids of a stream-json log, once each", () => {
    const log = [
      '{"type":"system","subtype":"init","session_id":"11111111-2222-3333-4444-555555555555"}',
      '{"type":"assistant","session_id":"11111111-2222-3333-4444-555555555555"}',
      "not json",
    ].join("\n");

    expect(sessionIdsOf(log)).toEqual(["11111111-2222-3333-4444-555555555555"]);
  });
});

describe("filesContaining", () => {
  it("lists the files of a directory, at any depth, that contain the secret", () => {
    const dir = mkdtempSync(join(tmpdir(), "redact-"));
    mkdirSync(join(dir, "app/node_modules/x"), { recursive: true });
    writeFileSync(join(dir, "app/.env"), "TOKEN=sk-secret-1");
    writeFileSync(join(dir, "app/node_modules/x/index.js"), "// sk-secret-1");
    writeFileSync(join(dir, "app/clean.ts"), "export {}");

    expect(filesContaining(dir, "sk-secret-1").sort()).toEqual(["app/.env", "app/node_modules/x/index.js"]);
  });

  it("refuses an empty secret, which every file contains", () => {
    expect(() => filesContaining(tmpdir(), "")).toThrow();
  });
});
