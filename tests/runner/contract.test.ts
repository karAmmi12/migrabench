// Contrat de candidat (spec de l'étape 3, « candidate.json et son schéma ») :
// fonction pure sur le contenu du dossier du candidat, sans Docker.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkContract, type CandidateFiles } from "../../runner/contract.ts";

const REGISTRY = "https://registry.npmjs.org";

function lockWith(packages: Record<string, object>): string {
  return JSON.stringify({
    name: "candidate",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: "candidate", version: "1.0.0" }, ...packages },
  });
}

function files(overrides: Partial<Record<keyof CandidateFiles, string | undefined>> = {}): CandidateFiles {
  return {
    candidateJson: JSON.stringify({ contract: 1, start: "node server/index.js" }),
    packageJson: JSON.stringify({ name: "candidate", version: "1.0.0" }),
    packageLock: lockWith({}),
    ...overrides,
  };
}

function candidate(fields: Record<string, unknown>): CandidateFiles {
  return files({ candidateJson: JSON.stringify(fields) });
}

function failuresOf(input: CandidateFiles): string[] {
  const result = checkContract(input);
  if (result.ok) throw new Error("expected the contract to be invalid");
  return result.failures;
}

describe("candidate contract: candidate.json", () => {
  it("accepts a contract with start only and returns the version read", () => {
    expect(checkContract(files())).toEqual({
      ok: true,
      contract: { contract: 1, start: "node server/index.js" },
    });
  });

  it("accepts $schema and build, and keeps build", () => {
    const result = checkContract(
      candidate({ $schema: "https://example.test/schema.json", contract: 1, build: "npm run build", start: "node dist/server.js" }),
    );

    expect(result).toEqual({
      ok: true,
      contract: { contract: 1, build: "npm run build", start: "node dist/server.js" },
    });
  });

  it("refuses a missing candidate.json", () => {
    expect(failuresOf(files({ candidateJson: undefined }))).toEqual(["candidate.json: file is missing"]);
  });

  it("refuses a malformed candidate.json", () => {
    const [failure] = failuresOf(files({ candidateJson: "{ contract: 1," }));

    expect(failure).toMatch(/^candidate\.json: invalid JSON/);
  });

  it("refuses a candidate.json that is not an object", () => {
    expect(failuresOf(files({ candidateJson: "[]" }))).toEqual(["candidate.json: must be an object"]);
  });

  it("refuses a missing contract", () => {
    expect(failuresOf(candidate({ start: "node index.js" }))).toEqual(['candidate.json: field "contract" is required']);
  });

  it("refuses a contract version the bench does not declare", () => {
    expect(failuresOf(candidate({ contract: 2, start: "node index.js" }))).toEqual([
      'candidate.json: field "contract" must be 1',
    ]);
  });

  it("refuses a contract that is not an integer", () => {
    expect(failuresOf(candidate({ contract: "1", start: "node index.js" }))).toContain(
      'candidate.json: field "contract" must be 1',
    );
  });

  it("refuses a missing start", () => {
    expect(failuresOf(candidate({ contract: 1 }))).toEqual(['candidate.json: field "start" is required']);
  });

  it("refuses an empty start", () => {
    expect(failuresOf(candidate({ contract: 1, start: "" }))).toEqual([
      'candidate.json: field "start" must be a non-empty string',
    ]);
  });

  it("refuses a start that is not a string", () => {
    expect(failuresOf(candidate({ contract: 1, start: ["node", "index.js"] }))).toEqual([
      'candidate.json: field "start" must be a non-empty string',
    ]);
  });

  it("refuses an empty build", () => {
    expect(failuresOf(candidate({ contract: 1, build: "", start: "node index.js" }))).toEqual([
      'candidate.json: field "build" must be a non-empty string',
    ]);
  });

  it("refuses a $schema that is not a string", () => {
    expect(failuresOf(candidate({ $schema: 1, contract: 1, start: "node index.js" }))).toEqual([
      'candidate.json: field "$schema" must be a string',
    ]);
  });

  it("refuses an unknown field instead of ignoring it", () => {
    expect(failuresOf(candidate({ contract: 1, start: "node index.js", healthcheck: "/health" }))).toEqual([
      'candidate.json: unknown field "healthcheck"',
    ]);
  });

  it.each(["url", "port"])("refuses a declared %s and says the bench imposes the port", (field) => {
    expect(failuresOf(candidate({ contract: 1, start: "node index.js", [field]: "http://localhost:3000" }))).toEqual([
      `candidate.json: field "${field}" is not allowed: the bench imposes the port, read it from the PORT variable`,
    ]);
  });

  it("lists every failure of candidate.json at once", () => {
    expect(failuresOf(candidate({ url: "http://localhost:3000", build: "" }))).toEqual([
      'candidate.json: field "contract" is required',
      'candidate.json: field "start" is required',
      'candidate.json: field "url" is not allowed: the bench imposes the port, read it from the PORT variable',
      'candidate.json: field "build" must be a non-empty string',
    ]);
  });
});

describe("candidate contract: package.json", () => {
  it("refuses a missing package.json", () => {
    expect(failuresOf(files({ packageJson: undefined }))).toEqual(["package.json: file is missing"]);
  });

  it("refuses a malformed package.json", () => {
    const [failure] = failuresOf(files({ packageJson: "{" }));

    expect(failure).toMatch(/^package\.json: invalid JSON/);
  });
});

describe("candidate contract: package-lock.json sources", () => {
  it("refuses a missing package-lock.json", () => {
    expect(failuresOf(files({ packageLock: undefined }))).toEqual(["package-lock.json: file is missing"]);
  });

  it("refuses a malformed package-lock.json", () => {
    const [failure] = failuresOf(files({ packageLock: "not json" }));

    expect(failure).toMatch(/^package-lock\.json: invalid JSON/);
  });

  it("refuses a package-lock.json without the packages section", () => {
    const lock = JSON.stringify({ name: "candidate", lockfileVersion: 1, dependencies: {} });

    expect(failuresOf(files({ packageLock: lock }))).toEqual([
      'package-lock.json: no "packages" section, lockfileVersion 2 or 3 is required',
    ]);
  });

  it("accepts dependencies resolved on the imposed npm registry", () => {
    const lock = lockWith({
      "node_modules/express": { version: "4.21.2", resolved: `${REGISTRY}/express/-/express-4.21.2.tgz` },
      "node_modules/@types/node": { version: "22.0.0", resolved: `${REGISTRY}/@types/node/-/node-22.0.0.tgz` },
    });

    expect(checkContract(files({ packageLock: lock })).ok).toBe(true);
  });

  it("accepts a dependency without resolved, which npm ci takes from the imposed registry", () => {
    const lock = lockWith({ "node_modules/express": { version: "4.21.2" } });

    expect(checkContract(files({ packageLock: lock })).ok).toBe(true);
  });

  it("refuses a dependency resolved on another registry host", () => {
    const lock = lockWith({
      "node_modules/express": { version: "4.21.2", resolved: "https://npm.example.com/express/-/express-4.21.2.tgz" },
    });

    expect(failuresOf(files({ packageLock: lock }))).toEqual([
      'package-lock.json: "node_modules/express" is resolved on another host: https://npm.example.com/express/-/express-4.21.2.tgz',
    ]);
  });

  it("refuses the imposed registry reached over plain http", () => {
    const lock = lockWith({
      "node_modules/express": { version: "4.21.2", resolved: "http://registry.npmjs.org/express/-/express-4.21.2.tgz" },
    });

    expect(failuresOf(files({ packageLock: lock }))).toEqual([
      'package-lock.json: "node_modules/express" is resolved on another host: http://registry.npmjs.org/express/-/express-4.21.2.tgz',
    ]);
  });

  it("refuses a remote archive", () => {
    const lock = lockWith({
      "node_modules/tool": { version: "1.0.0", resolved: "https://codeload.example.com/acme/tool/tar.gz/v1.0.0" },
    });

    expect(failuresOf(files({ packageLock: lock }))).toEqual([
      'package-lock.json: "node_modules/tool" is a remote archive: https://codeload.example.com/acme/tool/tar.gz/v1.0.0',
    ]);
  });

  it.each([
    "git+ssh://git@github.com/acme/tool.git#0123456789abcdef0123456789abcdef01234567",
    "git+https://github.com/acme/tool.git#0123456789abcdef0123456789abcdef01234567",
    "git://github.com/acme/tool.git#0123456789abcdef0123456789abcdef01234567",
    "github:acme/tool#0123456789abcdef0123456789abcdef01234567",
  ])("refuses a Git repository: %s", (resolved) => {
    const lock = lockWith({ "node_modules/tool": { version: "1.0.0", resolved } });

    expect(failuresOf(files({ packageLock: lock }))).toEqual([
      `package-lock.json: "node_modules/tool" is a Git repository: ${resolved}`,
    ]);
  });

  it("refuses a source it does not recognise instead of taking it for a local path", () => {
    const lock = lockWith({ "node_modules/tool": { version: "1.0.0", resolved: "npm:other-tool@1.0.0" } });

    expect(failuresOf(files({ packageLock: lock }))).toEqual([
      'package-lock.json: "node_modules/tool" has an unknown source: npm:other-tool@1.0.0',
    ]);
  });

  it("refuses a local link outside the candidate", () => {
    const lock = lockWith({
      "node_modules/shared": { resolved: "../shared", link: true },
      "../shared": { name: "shared", version: "1.0.0" },
    });

    expect(failuresOf(files({ packageLock: lock }))).toEqual([
      'package-lock.json: "node_modules/shared" is a local path outside the candidate: ../shared',
      'package-lock.json: "../shared" is a local path outside the candidate: ../shared',
    ]);
  });

  it("refuses a local file: archive outside the candidate", () => {
    const lock = lockWith({
      "node_modules/shared": { version: "1.0.0", resolved: "file:../vendor/shared-1.0.0.tgz" },
    });

    expect(failuresOf(files({ packageLock: lock }))).toEqual([
      'package-lock.json: "node_modules/shared" is a local path outside the candidate: file:../vendor/shared-1.0.0.tgz',
    ]);
  });

  it("refuses an absolute local path", () => {
    const lock = lockWith({ "node_modules/shared": { resolved: "/opt/shared", link: true } });

    expect(failuresOf(files({ packageLock: lock }))).toEqual([
      'package-lock.json: "node_modules/shared" is a local path outside the candidate: /opt/shared',
    ]);
  });

  it("refuses a path that goes out of the candidate and back in under another name", () => {
    const lock = lockWith({ "node_modules/shared": { resolved: "packages/../../shared", link: true } });

    expect(failuresOf(files({ packageLock: lock }))).toEqual([
      'package-lock.json: "node_modules/shared" is a local path outside the candidate: packages/../../shared',
    ]);
  });

  it("accepts a local path inside the candidate", () => {
    const lock = lockWith({
      "node_modules/shared": { resolved: "packages/shared", link: true },
      "packages/shared": { name: "shared", version: "1.0.0" },
      "node_modules/vendored": { version: "1.0.0", resolved: "file:vendor/vendored-1.0.0.tgz" },
    });

    expect(checkContract(files({ packageLock: lock })).ok).toBe(true);
  });

  it("cites every faulty dependency with its source", () => {
    const lock = lockWith({
      "node_modules/a": { version: "1.0.0", resolved: "https://npm.example.com/a/-/a-1.0.0.tgz" },
      "node_modules/b": { version: "1.0.0", resolved: `${REGISTRY}/b/-/b-1.0.0.tgz` },
      "node_modules/c": { version: "1.0.0", resolved: "github:acme/c#0123456789abcdef0123456789abcdef01234567" },
    });

    expect(failuresOf(files({ packageLock: lock }))).toEqual([
      'package-lock.json: "node_modules/a" is resolved on another host: https://npm.example.com/a/-/a-1.0.0.tgz',
      'package-lock.json: "node_modules/c" is a Git repository: github:acme/c#0123456789abcdef0123456789abcdef01234567',
    ]);
  });
});

describe("candidate contract: all files", () => {
  it("lists the failures of candidate.json and of package-lock.json together", () => {
    const input = files({
      candidateJson: JSON.stringify({ contract: 1, start: "node index.js", url: "http://localhost:3000" }),
      packageLock: lockWith({
        "node_modules/a": { version: "1.0.0", resolved: "https://npm.example.com/a/-/a-1.0.0.tgz" },
      }),
    });

    expect(failuresOf(input)).toEqual([
      'candidate.json: field "url" is not allowed: the bench imposes the port, read it from the PORT variable',
      'package-lock.json: "node_modules/a" is resolved on another host: https://npm.example.com/a/-/a-1.0.0.tgz',
    ]);
  });
});

describe("published candidate.json schema", () => {
  it("is a JSON Schema 2020-12 that refuses unknown fields", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../../runner/schemas/candidate-1.schema.json", import.meta.url), "utf8"),
    ) as Record<string, unknown>;

    expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema["additionalProperties"]).toBe(false);
    expect(schema["required"]).toEqual(["contract", "start"]);
  });
});
