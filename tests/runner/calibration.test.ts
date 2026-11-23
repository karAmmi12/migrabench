// Résultat d'étalonnage (spec de l'étape 3, « Candidat d'étalonnage ») : les
// valeurs de chaque relevé du candidat d'étalonnage, leur dispersion
// (minimum et maximum) et les limites = maximum relevé × multiple déclaré.
import { describe, expect, it } from "vitest";
import { calibrationSummary, chooseCalibration, readingValues } from "../../runner/calibration.ts";

const MIB = 1024 ** 2;
const MULTIPLES = { timeouts: 5, resources: 2 };

describe("readingValues", () => {
  it("takes the build duration of the whole phase, and the memory peak and CPU of its busiest step, since each step has its own container", () => {
    const readings = readingValues({
      build: {
        durationMs: 21_000,
        steps: [
          { step: "fetch", durationMs: 10_000, peakMemoryBytes: 200 * MIB, cpuSeconds: 5 },
          { step: "install", durationMs: 4_000, peakMemoryBytes: 300 * MIB, cpuSeconds: 2 },
          { step: "build", durationMs: 6_000, peakMemoryBytes: 500 * MIB, cpuSeconds: 9 },
        ],
      },
      start: { readyMs: 800, peakMemoryBytes: 60 * MIB, cpuSeconds: 0.4 },
    });

    expect(readings).toEqual({
      buildDurationMs: 21_000,
      buildPeakMemoryBytes: 500 * MIB,
      buildCpus: 1.5,
      readyDurationMs: 800,
      startPeakMemoryBytes: 60 * MIB,
      startCpus: 0.5,
    });
  });
});

describe("calibrationSummary", () => {
  const first = { buildDurationMs: 21_000, buildPeakMemoryBytes: 500 * MIB, buildCpus: 1.5, readyDurationMs: 800, startPeakMemoryBytes: 60 * MIB, startCpus: 0.5 };
  const second = { buildDurationMs: 30_000, buildPeakMemoryBytes: 450 * MIB, buildCpus: 1.8, readyDurationMs: 650, startPeakMemoryBytes: 70 * MIB, startCpus: 0.25 };

  it("records the dispersion of the readings, their minimum and maximum", () => {
    const { minimum, maximum } = calibrationSummary([first, second], MULTIPLES);

    expect(minimum).toEqual({ buildDurationMs: 21_000, buildPeakMemoryBytes: 450 * MIB, buildCpus: 1.5, readyDurationMs: 650, startPeakMemoryBytes: 60 * MIB, startCpus: 0.25 });
    expect(maximum).toEqual({ buildDurationMs: 30_000, buildPeakMemoryBytes: 500 * MIB, buildCpus: 1.8, readyDurationMs: 800, startPeakMemoryBytes: 70 * MIB, startCpus: 0.5 });
  });

  it("sets timeouts to the maximum times the timeout multiple, and memory and CPU to the maximum times the resource multiple", () => {
    expect(calibrationSummary([first, second], MULTIPLES).limits).toEqual({
      buildTimeoutMs: 150_000,
      readyTimeoutMs: 4_000,
      buildMemoryBytes: 1_000 * MIB,
      buildCpus: 3.6,
    });
  });

  it("rounds limits up: timeouts to the millisecond, memory to the MiB, CPUs to the hundredth", () => {
    const reading = { ...first, buildDurationMs: 1_000.2, readyDurationMs: 700.1, buildPeakMemoryBytes: 100 * MIB + 1, buildCpus: 1.234 };

    expect(calibrationSummary([reading], MULTIPLES).limits).toEqual({
      buildTimeoutMs: 5_001,
      readyTimeoutMs: 3_501,
      buildMemoryBytes: 201 * MIB,
      buildCpus: 2.47,
    });
  });

  it("refuses to summarise a calibration without readings", () => {
    expect(() => calibrationSummary([], MULTIPLES)).toThrow("A calibration needs at least one reading");
  });
});

describe("chooseCalibration", () => {
  const ciRun = (runId: string) => ({ runId, attempt: 1, rank: 1 });
  const result = (file: string, calibratedAt: string, run?: string) => ({
    file,
    record: { calibratedAt, environment: run === undefined ? {} : { ciRun: ciRun(run) } },
  });

  it("chooses the most recent calibration made in CI", () => {
    const older = result("results/calibration/20261123T100000Z-aaaaaaa-ci1.1-1.json", "2026-11-23T10:00:00.000Z", "1");
    const newer = result("results/calibration/20261124T100000Z-bbbbbbb-ci2.1-1.json", "2026-11-24T10:00:00.000Z", "2");

    expect(chooseCalibration([newer, older])).toBe(newer);
  });

  it("never chooses a local calibration, even more recent than the CI one", () => {
    const ci = result("results/calibration/20261123T100000Z-aaaaaaa-ci1.1-1.json", "2026-11-23T10:00:00.000Z", "1");
    const local = result("results/calibration/20261125T100000Z-ccccccc.json", "2026-11-25T10:00:00.000Z");

    expect(chooseCalibration([ci, local])).toBe(ci);
    expect(chooseCalibration([local])).toBeUndefined();
  });

  it("has nothing to choose without any calibration", () => {
    expect(chooseCalibration([])).toBeUndefined();
  });
});
