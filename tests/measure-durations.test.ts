// Durées des jobs de mesures (#163) : lues sur une réponse réelle enregistrée
// de l'API (tests/fixtures/github-api/README.md), puis additionnées.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { durationsSummary, formatDuration, measureDurations, parseJobTimings, type JobTiming } from "../scripts/measure-durations.ts";

const recorded = JSON.parse(readFileSync(new URL("./fixtures/github-api/measures-jobs-run46015618324.json", import.meta.url), "utf8"));

function job(name: string, startedAt: string, completedAt: string, conclusion = "success"): JobTiming {
  return { name, conclusion, startedAt, completedAt };
}

describe("parseJobTimings", () => {
  it("reads the name, conclusion and times of each job of a real response", () => {
    expect(parseJobTimings(recorded)).toEqual([
      { name: "changes", conclusion: "success", startedAt: "2026-11-27T14:24:18Z", completedAt: "2026-11-27T14:24:25Z" },
      { name: "measures", conclusion: "success", startedAt: "2026-11-27T14:24:27Z", completedAt: "2026-11-27T15:04:14Z" },
    ]);
  });

  it("rejects a response without jobs", () => {
    expect(() => parseJobTimings({ message: "Not Found" })).toThrow(/jobs/);
  });
});

describe("formatDuration", () => {
  it.each([
    [2387, "39 min 47 s"],
    [60, "1 min 0 s"],
    [59, "59 s"],
  ])("formats %i s as %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

describe("measureDurations", () => {
  it("measures the single job of the real run: 39 min 47 s", () => {
    const durations = measureDurations(parseJobTimings(recorded), (name) => name === "measures");

    expect(durations.totalSeconds).toBe(2387);
    expect(durations.longest).toEqual({ name: "measures", seconds: 2387 });
  });

  it("adds the group jobs only, finds the longest, and the span from the first start to the last end", () => {
    const jobs = [
      job("changes", "2026-11-27T10:00:00Z", "2026-11-27T10:00:10Z"),
      job("measures / reference", "2026-11-27T10:00:20Z", "2026-11-27T10:05:20Z"),
      job("measures / role", "2026-11-27T10:00:30Z", "2026-11-27T10:14:30Z"),
      job("measures / xss", "2026-11-27T10:00:25Z", "2026-11-27T10:12:25Z", "failure"),
    ];

    const durations = measureDurations(jobs, (name) => name.startsWith("measures / "));

    expect(durations.jobs.map(({ name, seconds, conclusion }) => [name, seconds, conclusion])).toEqual([
      ["measures / reference", 300, "success"],
      ["measures / role", 840, "success"],
      ["measures / xss", 720, "failure"],
    ]);
    expect(durations.totalSeconds).toBe(1860);
    expect(durations.longest).toEqual({ name: "measures / role", seconds: 840 });
    expect(durations.spanSeconds).toBe(850);
    expect(durations.unsuccessful).toEqual(["measures / xss"]);
  });

  it("lists no unsuccessful job when every group succeeded", () => {
    expect(measureDurations(parseJobTimings(recorded), () => true).unsuccessful).toEqual([]);
  });

  it("refuses when no group job is found: a summary of nothing is no summary", () => {
    expect(() => measureDurations([job("changes", "2026-11-27T10:00:00Z", "2026-11-27T10:00:10Z")], (name) => name.startsWith("measures / "))).toThrow(/no measure job/);
  });

  it("refuses a group job that has not ended", () => {
    const running: JobTiming = { name: "measures / role", conclusion: null, startedAt: "2026-11-27T10:00:00Z", completedAt: null };

    expect(() => measureDurations([running], () => true)).toThrow(/measures \/ role/);
  });
});

describe("durationsSummary", () => {
  it("gives each job, the total and the longest job", () => {
    const summary = durationsSummary(
      measureDurations(
        [job("measures / reference", "2026-11-27T10:00:00Z", "2026-11-27T10:05:00Z"), job("measures / role", "2026-11-27T10:00:00Z", "2026-11-27T10:14:30Z")],
        () => true,
      ),
    );

    expect(summary).toContain("| measures / reference | 5 min 0 s | success |");
    expect(summary).toContain("Durée totale (somme des jobs) : 19 min 30 s");
    expect(summary).toContain("Plus long job : measures / role, 14 min 30 s");
    expect(summary).toContain("Du premier départ à la dernière fin : 14 min 30 s");
  });
});
