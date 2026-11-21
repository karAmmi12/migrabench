// Les bruts de l'oracle (traces, HAR) restent hors de Git (ADR 0005).
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("oracle artifacts directory", () => {
  it("is ignored by Git", () => {
    const ignored = execFileSync("git", ["check-ignore", ".oracle-artifacts/20261121T160230Z-ab12cd34/search-a-chromium/trace.zip"], {
      encoding: "utf8",
    });

    expect(ignored.trim()).toBe(".oracle-artifacts/20261121T160230Z-ab12cd34/search-a-chromium/trace.zip");
  });
});
