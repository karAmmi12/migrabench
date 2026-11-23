// Délais et limites d'une mesure (spec de l'étape 3, « Candidat
// d'étalonnage ») : ceux du résultat d'étalonnage, cité par son empreinte, ou
// à défaut le plafond de sécurité, marqué provisoire ; et plafond de
// diagnostic des délais : une valeur imposée, qui ne peut que réduire les
// délais, enregistrée comme telle.
import { describe, expect, it } from "vitest";
import { measureLimits } from "../../runner/limits.ts";

const CAP = { buildTimeoutMs: 600_000, readyTimeoutMs: 60_000, buildMemoryBytes: 4_294_967_296, buildCpus: 2 };
const CALIBRATION = {
  file: "results/calibration/20261124T100000Z-bbbbbbb-ci2.1-1.json",
  digest: "sha256:3f1c",
  multiples: { timeouts: 5, resources: 2 },
  limits: { buildTimeoutMs: 150_000, readyTimeoutMs: 4_000, buildMemoryBytes: 1_048_576_000, buildCpus: 3.6 },
};

describe("measureLimits", () => {
  it("applies the safety cap, marked provisional, without a calibration result", () => {
    const { limits, record } = measureLimits({ safetyCap: CAP });

    expect(limits).toEqual(CAP);
    expect(record).toEqual({ provisional: true, source: "safety-cap", ...CAP });
  });

  it("applies the limits of a calibration result, citing its file, its digest and its multiples", () => {
    const { limits, record } = measureLimits({ safetyCap: CAP, calibration: CALIBRATION });

    expect(limits).toEqual(CALIBRATION.limits);
    expect(record).toEqual({
      provisional: false,
      source: "calibration",
      calibration: { file: "results/calibration/20261124T100000Z-bbbbbbb-ci2.1-1.json", digest: "sha256:3f1c" },
      multiples: { timeouts: 5, resources: 2 },
      buildTimeoutMs: 150_000,
      readyTimeoutMs: 4_000,
      buildMemoryBytes: 1_048_576_000,
      buildCpus: 3.6,
    });
  });

  it("lowers both timeouts to an imposed timeout cap and records it as imposed, without touching memory and CPU", () => {
    const { limits, record } = measureLimits({ safetyCap: CAP, timeoutCapMs: 5_000 });

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

  it("lowers calibrated timeouts too, and keeps citing the calibration result", () => {
    const { limits, record } = measureLimits({ safetyCap: CAP, calibration: CALIBRATION, timeoutCapMs: 3_000 });

    expect(limits).toEqual({ ...CALIBRATION.limits, buildTimeoutMs: 3_000, readyTimeoutMs: 3_000 });
    expect(record).toMatchObject({ provisional: false, source: "calibration", imposedTimeoutCapMs: 3_000, calibration: { digest: "sha256:3f1c" } });
  });

  it("keeps a timeout already below the imposed cap", () => {
    expect(measureLimits({ safetyCap: CAP, timeoutCapMs: 120_000 }).limits).toMatchObject({ buildTimeoutMs: 120_000, readyTimeoutMs: 60_000 });
  });

  it("refuses an imposed cap that would raise a timeout, or that is not a positive whole number of milliseconds", () => {
    expect(() => measureLimits({ safetyCap: CAP, timeoutCapMs: 600_001 })).toThrow("--timeout-cap-ms only lowers the timeouts: at most 600000");
    expect(() => measureLimits({ safetyCap: CAP, calibration: CALIBRATION, timeoutCapMs: 150_001 })).toThrow(
      "--timeout-cap-ms only lowers the timeouts: at most 150000",
    );
    expect(() => measureLimits({ safetyCap: CAP, timeoutCapMs: 0 })).toThrow("--timeout-cap-ms must be a positive whole number of milliseconds");
    expect(() => measureLimits({ safetyCap: CAP, timeoutCapMs: 1.5 })).toThrow("--timeout-cap-ms must be a positive whole number of milliseconds");
    expect(() => measureLimits({ safetyCap: CAP, timeoutCapMs: Number.NaN })).toThrow("--timeout-cap-ms must be a positive whole number of milliseconds");
  });
});
