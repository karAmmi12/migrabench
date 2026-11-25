// Résultat d'étalonnage (spec de l'étape 3, « Candidat d'étalonnage ») : les
// valeurs de chaque relevé du candidat d'étalonnage, leur dispersion
// (minimum et maximum) et les limites = maximum relevé × multiple déclaré.
//
// Relevés et enregistrement : ceux du vrai étalonnage de l'exécution
// 45509307133 (tests/fixtures/ci45509307133/PROVENANCE.md), tels que le banc
// les a écrits. Chaque variante part de la copie et ne change que ce que son
// test regarde.
import { describe, expect, it } from "vitest";
import { type CalibrationReading, calibrationSummary, chooseCalibration, type Multiples, type ReadingValues, readingValues } from "../../runner/calibration.ts";
import { CALIBRATION, readJsonFixture } from "../real-fixtures.ts";

const MIB = 1024 ** 2;

interface RecordedCalibration {
  calibratedAt: string;
  environment: { ciRun: { runId: string; attempt: number; rank: number }; machine: { cpus: number } } & Record<string, unknown>;
  multiples: Multiples;
  readings: (CalibrationReading & { values: ReadingValues })[];
  minimum: ReadingValues;
  maximum: ReadingValues;
  limits: object;
}

const RECORDED_CALIBRATION = readJsonFixture<RecordedCalibration>(CALIBRATION.result);
const MULTIPLES = RECORDED_CALIBRATION.multiples;
const CPUS = RECORDED_CALIBRATION.environment.machine.cpus;
const VALUES = RECORDED_CALIBRATION.readings.map(({ values }) => values);
const first = VALUES[0]!;

describe("readingValues", () => {
  it("takes the build duration of the whole phase, and the memory peak and CPU of its busiest step, since each step has its own container", () => {
    const [{ build, start, values }] = RECORDED_CALIBRATION.readings as [RecordedCalibration["readings"][number]];

    expect(readingValues({ build, start })).toEqual(values);
    // L'étape la plus gourmande en mémoire (install) n'est pas la plus longue (fetch).
    expect(values).toMatchObject({ buildDurationMs: 7103, buildPeakMemoryBytes: 330_964_992, readyDurationMs: 686, startPeakMemoryBytes: 20_152_320 });
  });
});

describe("calibrationSummary", () => {
  it("records the dispersion of the readings, their minimum and maximum", () => {
    const { minimum, maximum } = calibrationSummary(VALUES, MULTIPLES, CPUS);

    expect(minimum).toEqual(RECORDED_CALIBRATION.minimum);
    expect(maximum).toEqual(RECORDED_CALIBRATION.maximum);
  });

  it("sets timeouts to the maximum times the timeout multiple, and memory and CPU to the maximum times the resource multiple, rounded up", () => {
    expect(calibrationSummary(VALUES, MULTIPLES, CPUS).limits).toEqual(RECORDED_CALIBRATION.limits);
    expect(RECORDED_CALIBRATION.limits).toEqual({
      buildTimeoutMs: 7881 * 5,
      readyTimeoutMs: 686 * 5,
      buildMemoryBytes: Math.ceil((332_435_456 * 2) / MIB) * MIB,
      buildCpus: 1.89,
    });
  });

  // Sous le plafond des 2 CPU de la machine d'étalonnage : 0,934 × 2 = 1,868.
  it("rounds limits up: timeouts to the millisecond, memory to the MiB, CPUs to the hundredth", () => {
    const reading = { ...first, buildDurationMs: 1_000.2, readyDurationMs: 700.1, buildPeakMemoryBytes: 100 * MIB + 1, buildCpus: 0.934 };

    expect(calibrationSummary([reading], MULTIPLES, CPUS).limits).toEqual({
      buildTimeoutMs: 5_001,
      readyTimeoutMs: 3_501,
      buildMemoryBytes: 201 * MIB,
      buildCpus: 1.87,
    });
  });

  // Docker refuse un --cpus supérieur au nombre de CPU de la machine (code
  // 125) : observé avec 1,13 × 2 = 2,26 sur un runner à 2 CPU (exécution 45279347841).
  it("caps the CPU limit at the CPU count of the calibration machine, leaving the other limits as they are", () => {
    const reading = { ...first, buildCpus: 1.13 };
    const uncapped = calibrationSummary([reading], MULTIPLES, 3).limits;

    expect(uncapped.buildCpus).toBe(2.26);
    expect(calibrationSummary([reading], MULTIPLES, CPUS).limits).toEqual({ ...uncapped, buildCpus: CPUS });
  });

  it("refuses to summarise a calibration without readings", () => {
    expect(() => calibrationSummary([], MULTIPLES, CPUS)).toThrow("A calibration needs at least one reading");
  });
});

describe("chooseCalibration", () => {
  // Le vrai enregistrement, sa date et son exécution de CI changées ; sans
  // `run`, un étalonnage local, sans ciRun.
  const result = (file: string, calibratedAt: string, run?: string) => {
    const { ciRun, ...environment } = RECORDED_CALIBRATION.environment;
    const recorded: { ciRun?: unknown } & Record<string, unknown> = run === undefined ? environment : { ...environment, ciRun: { ...ciRun, runId: run } };
    return { file, record: { ...RECORDED_CALIBRATION, calibratedAt, environment: recorded } };
  };

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
