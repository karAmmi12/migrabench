// Délais et limites d'une mesure (spec de l'étape 3, « Candidat
// d'étalonnage ») : ceux du résultat d'étalonnage, cité par son empreinte, ou
// à défaut le plafond de sécurité, marqué provisoire ; et plafond de
// diagnostic des délais : une valeur imposée, qui ne peut que réduire les
// délais, enregistrée comme telle.
import { describe, expect, it } from "vitest";
import { cpuShortfall, measureLimits, startLimits } from "../../runner/limits.ts";

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
    expect(record).toEqual({ provisional: true, source: "safety-cap", ...CAP, start: { provisional: true, source: "build-limits", memoryBytes: 4_294_967_296, cpus: 2, pids: 256 } });
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
      start: { provisional: true, source: "build-limits", memoryBytes: 1_048_576_000, cpus: 3.6, pids: 256 },
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
      start: { provisional: true, source: "build-limits", memoryBytes: 4_294_967_296, cpus: 2, pids: 256 },
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

// Garde-fou d'une mesure : une limite de CPU que Docker refuserait sur la
// machine qui mesure (code 125) n'est jamais comptée contre le candidat. La
// mesure s'arrête avant `npm ci`, en runner-error-before-candidate, avec la
// limite et le nombre de CPU pour preuve.
describe("cpuShortfall", () => {
  it("gives the evidence when the machine has fewer CPUs than the applied CPU limit", () => {
    expect(cpuShortfall({ ...CAP, buildCpus: 2.26 }, 2)).toBe(
      "The applied CPU limit (2.26) exceeds the 2 CPUs of the machine that measures: docker would refuse --cpus 2.26",
    );
  });

  it("has nothing to report when the machine has as many CPUs as the limit, or more", () => {
    expect(cpuShortfall({ ...CAP, buildCpus: 2 }, 2)).toBeUndefined();
    expect(cpuShortfall({ ...CAP, buildCpus: 2.26 }, 14)).toBeUndefined();
  });
});

// Limites du service `candidate` au démarrage (précisé par #66) : une limite
// provisoire de conception, pas un relevé. L'étalonnage ne relève le
// démarrage que jusqu'à la disponibilité, pas sous la charge de l'oracle
// (#100) : mémoire et CPU reprennent ceux de la construction, et le nombre de
// processus est un paramètre déclaré.
describe("startLimits", () => {
  it("takes the memory and CPU of the build, and 256 processes", () => {
    expect(startLimits({ ...CAP, buildMemoryBytes: 665_845_760, buildCpus: 1.5 })).toEqual({ memoryBytes: 665_845_760, cpus: 1.5, pids: 256 });
  });

  it("is recorded with the limits of the measure, marked as a provisional design limit taken from the build", () => {
    expect(measureLimits({ safetyCap: CAP, calibration: CALIBRATION }).record.start).toEqual({
      provisional: true,
      source: "build-limits",
      memoryBytes: 1_048_576_000,
      cpus: 3.6,
      pids: 256,
    });
  });
});
