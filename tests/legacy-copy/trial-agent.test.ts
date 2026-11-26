// Conteneur de l'agent qui produit un candidat d'essai (ADR 0010) : arguments
// de `docker run`, ligne de commande de Claude Code et contrôle de
// l'événement `system/init`, sans Docker.
import { describe, expect, it } from "vitest";
import { agentRunArgs, benchContainers, claudeArgs, initFindings, TOKEN_VARIABLE } from "../../scripts/trial-agent.ts";

// Événement `system/init` relevé le 26/11 dans le conteneur de l'agent
// (Claude Code 2.1.332, sans jeton), réduit aux champs contrôlés.
const INIT = {
  type: "system",
  subtype: "init",
  cwd: "/work",
  mcp_servers: [],
  permissionMode: "bypassPermissions",
  plugins: [{ name: "cc-plugin-privacy", path: "builtin", source: "cc-plugin-privacy@builtin" }],
};
const log = (init: object) => `${JSON.stringify(init)}\n{"type":"result","result":"Four."}\n`;

describe("agentRunArgs", () => {
  const args = agentRunArgs("/tmp/trial-x", ["claude", "--version"]);

  it("mounts the work directory under /work, and nothing else", () => {
    expect(args.filter((arg) => arg === "--mount" || arg === "-v" || arg === "--volume" || arg.startsWith("--volume"))).toEqual(["--mount"]);
    expect(args[args.indexOf("--mount") + 1]).toBe("type=bind,source=/tmp/trial-x,target=/work");
  });

  it("passes the token by its name only, never its value, and no other variable", () => {
    const variables = args.flatMap((arg, index) => (args[index - 1] === "-e" ? [arg] : []));

    expect(variables).toEqual([TOKEN_VARIABLE]);
  });

  it("runs the command last, in a container removed at the end, without extra privileges", () => {
    expect(args.slice(0, 2)).toEqual(["run", "--rm"]);
    expect(args.slice(-2)).toEqual(["claude", "--version"]);
    expect(args).not.toContain("--privileged");
    expect(args.join(" ")).toContain("--cap-drop ALL");
  });
});

describe("claudeArgs", () => {
  it("asks no permission and writes the stream-json log", () => {
    expect(claudeArgs("Do it")).toEqual([
      "claude", "-p", "Do it", "--permission-mode", "bypassPermissions", "--output-format", "stream-json", "--verbose",
    ]);
  });
});

describe("initFindings", () => {
  it("finds nothing in an isolated session", () => {
    expect(initFindings(log(INIT))).toEqual([]);
  });

  it.each([
    ["cwd", { cwd: "/Users/someone/project" }, "cwd"],
    ["an MCP server", { mcp_servers: [{ name: "claude.ai Google Drive", status: "connected" }] }, "mcp_servers"],
    ["a user plugin", { plugins: [{ name: "mattpocock-skills", path: "/home/node/.config/claude/plugins/x" }] }, "plugins"],
    ["a permission mode that asks", { permissionMode: "default" }, "permissionMode"],
  ])("finds %s", (_case, change, field) => {
    expect(initFindings(log({ ...INIT, ...change })).join("\n")).toContain(field);
  });

  it("refuses a log without system/init", () => {
    expect(initFindings('{"type":"result"}\n')).toEqual(["no system/init event in the log"]);
  });
});

describe("benchContainers", () => {
  it("finds the running bench containers in the names listed by docker ps", () => {
    const names = "migrabench-legacy-1\nmigrabench-archive-1\nmigrabench-legacy-copy-4242\npostgres-dev\n";

    expect(benchContainers(names)).toEqual(["migrabench-legacy-1", "migrabench-archive-1", "migrabench-legacy-copy-4242"]);
  });

  it("finds none when no bench container runs", () => {
    expect(benchContainers("postgres-dev\n")).toEqual([]);
    expect(benchContainers("")).toEqual([]);
  });
});
