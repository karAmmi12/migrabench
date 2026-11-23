// Adaptateur de l'historique de la PR sur l'API GitHub (#76), vérifié sur des
// réponses réelles enregistrées (tests/fixtures/github-api/README.md).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseJobs, parseRuns } from "../scripts/github-history.ts";

function recorded(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/github-api/${name}`, import.meta.url), "utf8"));
}

describe("parseRuns", () => {
  it("reads id, head commit and creation date of each completed run", () => {
    expect(parseRuns(recorded("oracle-runs-pr75.json"))).toEqual([
      { id: 45203285639, headSha: "2f0f0349a027c612f4807a185613e874cbaa1a1e", createdAt: "2026-11-23T15:15:59Z" },
      { id: 45201392534, headSha: expect.stringMatching(/^d14909c[0-9a-f]{33}$/), createdAt: "2026-11-23T15:06:05Z" },
    ]);
  });

  it("refuses a response that is not a list of workflow runs", () => {
    expect(() => parseRuns({ message: "Not Found" })).toThrow(/workflow_runs/);
  });
});

describe("parseJobs", () => {
  it("reads name and conclusion of each job of a run", () => {
    expect(parseJobs(recorded("oracle-jobs-run45203285639.json"))).toEqual([
      { name: "oracle", conclusion: "success" },
      { name: "proof", conclusion: "success" },
    ]);
  });

  it("refuses a response that is not a list of jobs", () => {
    expect(() => parseJobs({ message: "Not Found" })).toThrow(/jobs/);
  });
});
