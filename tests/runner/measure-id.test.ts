// Identifiant de la mesure (spec de l'étape 3, « Contenu de measure.json ») :
// <horodatage>-<commit court>-<nom du candidat>.
import { describe, expect, it } from "vitest";
import { measureId } from "../../runner/measure-id.ts";

const STARTED_AT = new Date("2026-11-23T09:05:07.123Z");
const COMMIT = "454fb76a1b2c3d4e5f60718293a4b5c6d7e8f901";

describe("measureId", () => {
  it("names a fixture candidate by its path under fixtures/", () => {
    expect(measureId(STARTED_AT, COMMIT, "fixtures/reference-candidate")).toBe(
      "20261123T090507Z-454fb76-reference-candidate",
    );
  });

  it("replaces the slashes of a nested candidate path with dashes", () => {
    expect(measureId(STARTED_AT, COMMIT, "candidates/run-3/agent-a")).toBe("20261123T090507Z-454fb76-run-3-agent-a");
  });

  it("ignores a trailing slash", () => {
    expect(measureId(STARTED_AT, COMMIT, "fixtures/reference-candidate/")).toBe(
      "20261123T090507Z-454fb76-reference-candidate",
    );
  });

  it("refuses a candidate outside candidates/ and fixtures/", () => {
    expect(() => measureId(STARTED_AT, COMMIT, "oracle")).toThrow(/candidates\/ or fixtures\//);
    expect(() => measureId(STARTED_AT, COMMIT, "fixtures/../oracle")).toThrow(/candidates\/ or fixtures\//);
  });
});
