// Phase 2 d'une mesure, le contrat (spec de l'étape 3, « Phases d'une mesure
// et leurs issues ») : lecture du dossier copié du candidat, puis issue de la
// phase. Les candidats de fixtures/ sont lus tels quels, sans Docker.
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contractPhase } from "../../runner/contract-phase.ts";
import { measureRecord } from "../../runner/measure-record.ts";
import type { PhaseRecord } from "../../runner/verdict.ts";
import { ROOT } from "../../shared/root.ts";

const DEFECTIVE = join(ROOT, "fixtures", "defective-candidates");
const REFERENCE = join(ROOT, "fixtures", "reference-candidate");

function phase(name: PhaseRecord["name"], outcome = "ok", detail?: string): PhaseRecord {
  return { name, outcome, startedAt: "2026-11-23T09:05:07.123Z", durationMs: 10, raw: {}, ...(detail === undefined ? {} : { detail }) } as PhaseRecord;
}

const NOT_RUN = {
  executed: false,
  summary: { scenarios: 38, passed: 0, failed: 0, unreached: 38, passRate: 0, reachedPassRate: null, keyboard: { passed: 0, total: 4 } },
} as const;

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function candidateDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "migrabench-contract-"));
  temporary.push(dir);
  for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
  return dir;
}

const PACKAGE_JSON = '{ "name": "c", "version": "0.0.0" }';
const PACKAGE_LOCK = '{ "lockfileVersion": 3, "packages": { "": { "name": "c" } } }';

describe("defective candidate 1, contract invalid", () => {
  it("is contract-invalid and cites both the declared url and the dependency on another host", async () => {
    const result = await contractPhase(join(DEFECTIVE, "contract-invalid"));

    expect(result.outcome).toBe("contract-invalid");
    if (result.outcome !== "contract-invalid") return;
    const failures = result.detail.split("\n");
    expect(failures).toHaveLength(2);
    expect(failures).toContain('candidate.json: field "url" is not allowed: the bench imposes the port, read it from the PORT variable');
    expect(failures).toContain(
      'package-lock.json: "node_modules/left-pad" is resolved on another host: https://registry.example.org/left-pad/-/left-pad-1.3.0.tgz',
    );
  });

  it("gives a contract-failure measure with exit code 0 and no candidate.contract", async () => {
    const result = await contractPhase(join(DEFECTIVE, "contract-invalid"));
    if (result.outcome === "ok") throw new Error("expected the contract to be invalid");

    const { record, exitCode } = measureRecord({
      measureId: "20261123T090507Z-454fb76-contract-invalid",
      candidate: { path: "fixtures/defective-candidates/contract-invalid", contentDigest: "sha256:aa", ...result.candidate },
      environment: {},
      salt: "5a17",
      saltImposed: false,
      marker: "a1".repeat(32),
      phases: [phase("preparation"), phase("contract", result.outcome, result.detail), phase("closing")],
      oracle: NOT_RUN,
    });

    expect(record.verdict).toEqual({ category: "contract-failure", reason: "contract-invalid" });
    expect(exitCode).toBe(0);
    expect(record.candidate).not.toHaveProperty("contract");
    expect(record.phases.find(({ name }) => name === "build")?.outcome).toBe("not-run");
  });
});

describe("candidates that keep their contract", () => {
  it("passes the reference candidate and records the version read in its candidate.json", async () => {
    const declared = JSON.parse(await readFile(join(REFERENCE, "candidate.json"), "utf8")) as { contract: number; start: string };

    const result = await contractPhase(REFERENCE);

    expect(result).toEqual({ outcome: "ok", candidate: { contract: declared.contract, start: declared.start } });
  });

  it("passes every other defective candidate: each has a single defect, outside the contract", async () => {
    const others = (await readdir(DEFECTIVE)).filter((name) => name !== "contract-invalid");
    expect(others.length).toBeGreaterThan(0);

    for (const name of others) {
      const result = await contractPhase(join(DEFECTIVE, name));
      expect(result.outcome, name).toBe("ok");
    }
  });

  it("records the declared build command with the version", async () => {
    const result = await contractPhase(join(DEFECTIVE, "build-fails"));

    expect(result).toEqual({ outcome: "ok", candidate: { contract: 1, build: "node build.js", start: "node server.js" } });
  });
});

describe("reading the candidate directory", () => {
  it("takes a missing candidate.json for a contract failure, not a runner error", async () => {
    const dir = await candidateDir({ "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });

    const result = await contractPhase(dir);

    expect(result).toEqual({ outcome: "contract-invalid", candidate: {}, detail: "candidate.json: file is missing" });
  });

  // #68 : un défaut des fichiers fournis par le candidat est une
  // contract-failure ; seul ce que le candidat ne peut ni fournir ni fabriquer
  // rend la mesure invalide (règle 7).
  it("takes a candidate.json that is a directory for a contract failure, not a runner error", async () => {
    const dir = await candidateDir({ "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });
    await mkdir(join(dir, "candidate.json"));

    const result = await contractPhase(dir);

    expect(result.outcome).toBe("contract-invalid");
    if (result.outcome !== "contract-invalid") return;
    expect(result.candidate).toEqual({});
    expect(result.detail).toMatch(/^candidate\.json: cannot be read: .*EISDIR/);
  });

  it.skipIf(process.getuid?.() === 0)("takes an unreadable candidate.json for a contract failure", async () => {
    const dir = await candidateDir({ "candidate.json": '{ "contract": 1, "start": "node server.js" }', "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });
    await chmod(join(dir, "candidate.json"), 0o000);

    const result = await contractPhase(dir);

    expect(result.outcome).toBe("contract-invalid");
    if (result.outcome !== "contract-invalid") return;
    expect(result.detail).toMatch(/^candidate\.json: cannot be read: .*EACCES/);
  });

  it("cites each defect of the candidate's files, found when they were listed, as a contract failure", async () => {
    const dir = await candidateDir({ "candidate.json": '{ "contract": 1, "start": "node server.js" }', "package.json": PACKAGE_JSON, "package-lock.json": PACKAGE_LOCK });

    const result = await contractPhase(dir, ["The candidate contains a symbolic link: link.js"]);

    expect(result).toEqual({ outcome: "contract-invalid", candidate: {}, detail: "The candidate contains a symbolic link: link.js" });
  });
});
