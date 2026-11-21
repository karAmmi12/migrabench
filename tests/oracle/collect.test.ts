// Collecte de l'oracle : JSON Playwright fabriqués, sans lancer Playwright.
import type { JSONReport, JSONReportSpec } from "@playwright/test/reporter";
import { describe, expect, it } from "vitest";
import { artifactPaths, collect } from "../../oracle/collect.ts";

const SALT = "a".repeat(64);

type Outcome = "passed" | "failed-reached" | "failed-unreached";

interface ScenarioInput {
  title: string;
  outcome: Outcome;
  tags?: string[];
  har?: boolean;
  trace?: boolean;
}

function spec({ title, outcome, tags = ["recherche"], har = true, trace = true }: ScenarioInput): JSONReportSpec {
  const annotations = outcome === "failed-unreached" ? [] : [{ type: "mb:reach", description: "reached" }];
  const attachments = [
    ...(har ? [{ name: "har", path: `/out/${title}/scenario.har`, contentType: "application/json" }] : []),
    ...(trace ? [{ name: "trace", path: `/out/${title}/trace.zip`, contentType: "application/zip" }] : []),
  ];
  return {
    title,
    tags,
    ok: outcome === "passed",
    id: title,
    file: "search.spec.ts",
    line: 1,
    column: 1,
    tests: [
      {
        timeout: 30_000,
        annotations,
        expectedStatus: "passed",
        projectName: "chromium",
        projectId: "chromium",
        status: outcome === "passed" ? "expected" : "unexpected",
        results: [
          {
            workerIndex: 0,
            parallelIndex: 0,
            status: outcome === "passed" ? "passed" : "failed",
            duration: 10,
            error: undefined,
            errors: [],
            stdout: [],
            stderr: [],
            retry: 0,
            startTime: "2026-11-21T00:00:00.000Z",
            attachments,
            annotations,
          },
        ],
      },
    ],
  };
}

function report(scenarios: ScenarioInput[]): JSONReport {
  return {
    config: { metadata: { benchCommit: "abc123", baseUrl: "http://localhost:8080" } },
    suites: [{ title: "search.spec.ts", file: "search.spec.ts", line: 0, column: 0, specs: scenarios.map(spec) }],
    errors: [],
    stats: { startTime: "2026-11-21T00:00:00.000Z", duration: 10, expected: 0, unexpected: 0, flaky: 0, skipped: 0 },
  } as unknown as JSONReport;
}

function hashesFor(input: JSONReport): Record<string, string> {
  return Object.fromEntries(artifactPaths(input).map((path) => [path, fakeDigest(path)]));
}

// Empreinte factice, distincte par fichier : la collecte reçoit les empreintes, elle ne les calcule pas.
function fakeDigest(path: string): string {
  return Buffer.from(path).toString("hex");
}

function run(scenarios: ScenarioInput[]) {
  const input = report(scenarios);
  return collect(input, { hashes: hashesFor(input), salt: SALT });
}

describe("oracle collection", () => {
  it("classifies passed, failed (reached) and unreached scenarios", () => {
    const { summary } = run([
      { title: "a", outcome: "passed" },
      { title: "b", outcome: "failed-reached" },
      { title: "c", outcome: "failed-unreached" },
    ]);

    expect(summary).toMatchObject({ scenarios: 3, passed: 1, failed: 1, unreached: 1 });
  });

  it("computes both rates and the @clavier count", () => {
    const { summary } = run([
      { title: "a", outcome: "passed", tags: ["recherche", "clavier"] },
      { title: "b", outcome: "passed" },
      { title: "c", outcome: "failed-reached", tags: ["fiche", "clavier"] },
      { title: "d", outcome: "failed-unreached" },
    ]);

    expect(summary).toEqual({
      scenarios: 4,
      passed: 2,
      failed: 1,
      unreached: 1,
      passRate: 2 / 4,
      reachedPassRate: 2 / 3,
      keyboard: { passed: 1, total: 2 },
    });
  });

  it("leaves the reached rate undefined when no scenario is reached", () => {
    const { summary } = run([
      { title: "a", outcome: "failed-unreached", tags: ["clavier"] },
      { title: "b", outcome: "failed-unreached" },
    ]);

    expect(summary).toEqual({
      scenarios: 2,
      passed: 0,
      failed: 0,
      unreached: 2,
      passRate: 0,
      reachedPassRate: null,
      keyboard: { passed: 0, total: 1 },
    });
  });

  it("adds the HAR and trace digests to each scenario", () => {
    const { report: result } = run([{ title: "a", outcome: "passed" }, { title: "bb", outcome: "failed-reached" }]);

    const annotations = result.suites[0]?.specs.map((entry) => entry.tests[0]?.annotations);
    expect(annotations).toEqual([
      [
        { type: "mb:reach", description: "reached" },
        { type: "mb:har", description: `sha256:${fakeDigest("/out/a/scenario.har")}` },
        { type: "mb:trace", description: `sha256:${fakeDigest("/out/a/trace.zip")}` },
      ],
      [
        { type: "mb:reach", description: "reached" },
        { type: "mb:har", description: `sha256:${fakeDigest("/out/bb/scenario.har")}` },
        { type: "mb:trace", description: `sha256:${fakeDigest("/out/bb/trace.zip")}` },
      ],
    ]);
  });

  it("adds the salt and the summary to the run metadata, after the environment", () => {
    const { report: result, summary } = run([{ title: "a", outcome: "passed" }]);

    expect(result.config.metadata).toEqual({
      benchCommit: "abc123",
      baseUrl: "http://localhost:8080",
      salt: SALT,
      summary,
    });
    expect(Object.keys(result.config.metadata).slice(-2)).toEqual(["salt", "summary"]);
  });

  it("does not modify the Playwright report it reads", () => {
    const input = report([{ title: "a", outcome: "passed" }]);
    const before = structuredClone(input);

    collect(input, { hashes: hashesFor(input), salt: SALT });

    expect(input).toEqual(before);
  });

  it("fails instead of writing an incomplete result when a scenario has no HAR", () => {
    const input = report([{ title: "a", outcome: "passed" }, { title: "b", outcome: "passed", har: false }]);

    expect(() => collect(input, { hashes: hashesFor(input), salt: SALT })).toThrow("b: no har attachment");
  });

  it("fails when a scenario has no trace", () => {
    const input = report([{ title: "a", outcome: "passed", trace: false }]);

    expect(() => collect(input, { hashes: hashesFor(input), salt: SALT })).toThrow("a: no trace attachment");
  });

  it("fails when an artifact has no digest", () => {
    const input = report([{ title: "a", outcome: "passed" }]);

    expect(() => collect(input, { hashes: {}, salt: SALT })).toThrow("a: no digest for /out/a/scenario.har");
  });
});
