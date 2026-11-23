// Délais et limites d'une mesure (spec de l'étape 3, « Candidat
// d'étalonnage ») et plafond de diagnostic des délais : une valeur imposée,
// qui ne peut que réduire les délais, enregistrée comme telle.
import { describe, expect, it } from "vitest";
import { measureLimits } from "../../runner/limits.ts";

const CAP = { buildTimeoutMs: 600_000, readyTimeoutMs: 60_000, buildMemoryBytes: 4_294_967_296, buildCpus: 2 };

describe("measureLimits", () => {
  it("applies the safety cap, marked provisional, when no timeout cap is imposed", () => {
    const { limits, record } = measureLimits(CAP);

    expect(limits).toEqual(CAP);
    expect(record).toEqual({ provisional: true, source: "safety-cap", ...CAP });
  });

  it("lowers both timeouts to an imposed timeout cap and records it as imposed, without touching memory and CPU", () => {
    const { limits, record } = measureLimits(CAP, 5_000);

    expect(limits).toEqual({ buildTimeoutMs: 5_000, readyTimeoutMs: 5_000, buildMemoryBytes: 4_294_967_296, buildCpus: 2 });
    expect(record).toEqual({
      provisional: true,
      source: "safety-cap",
      buildTimeoutMs: 5_000,
      readyTimeoutMs: 5_000,
      buildMemoryBytes: 4_294_967_296,
      buildCpus: 2,
      imposedTimeoutCapMs: 5_000,
    });
  });

  it("keeps a timeout already below the imposed cap", () => {
    expect(measureLimits(CAP, 120_000).limits).toMatchObject({ buildTimeoutMs: 120_000, readyTimeoutMs: 60_000 });
  });

  it("refuses an imposed cap that would raise a timeout, or that is not a positive whole number of milliseconds", () => {
    expect(() => measureLimits(CAP, 600_001)).toThrow("--timeout-cap-ms only lowers the timeouts: at most 600000");
    expect(() => measureLimits(CAP, 0)).toThrow("--timeout-cap-ms must be a positive whole number of milliseconds");
    expect(() => measureLimits(CAP, 1.5)).toThrow("--timeout-cap-ms must be a positive whole number of milliseconds");
    expect(() => measureLimits(CAP, Number.NaN)).toThrow("--timeout-cap-ms must be a positive whole number of milliseconds");
  });
});
