// Expurgation du journal d'un candidat d'essai (procédure, étape 4, #125).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTAINER_HOME, filesContaining, redactLog, replacementsFor, sessionIdsOf } from "../../scripts/redact-log.ts";
import { ROOT } from "../../shared/root.ts";

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

describe("replacementsFor", () => {
  // Ligne tirée de l'événement system/init d'un vrai journal (#126).
  const log =
    '{"type":"system","subtype":"init","session_id":"11111111-2222-3333-4444-555555555555","memory_paths":{"auto":"/home/node/.config/claude/projects/-work/memory/"}}';
  const host = { token: "sk-secret-1", home: "/Users/karim", user: "karim", host: "mac", workDirs: ["/tmp/w", "/private/tmp/w"] };

  it("replaces the home of the agent image user with <CONTAINER_HOME>", () => {
    const result = redactLog(log, replacementsFor({ ...host, log }));

    expect(result.text).toBe(
      '{"type":"system","subtype":"init","session_id":"<SESSION_ID>","memory_paths":{"auto":"<CONTAINER_HOME>/.config/claude/projects/-work/memory/"}}',
    );
    expect(result.counts).toEqual({ "<OAUTH_TOKEN>": 0, "<HOME>": 0, "<USER>": 0, "<HOST>": 0, "<WORKDIR>": 0, "<SESSION_ID>": 1, "<CONTAINER_HOME>": 1 });
  });

  it("names the home where the agent image keeps the Claude Code configuration", () => {
    const dockerfile = readFileSync(join(ROOT, "fixtures/trial-agent/Dockerfile"), "utf8");
    const configDir = /CLAUDE_CONFIG_DIR=(\S+)/.exec(dockerfile)?.[1];

    expect(configDir).toBe(`${CONTAINER_HOME}/.config/claude`);
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
