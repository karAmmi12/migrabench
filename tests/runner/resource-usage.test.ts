// Relevé des ressources d'un conteneur (spec de l'étape 3, « Candidat
// d'étalonnage ») : pic de mémoire et temps CPU lus dans le cgroup v2 du
// conteneur. Un compteur absent est une erreur, jamais une valeur par défaut.
//
// Fichiers du cgroup : les vrais `cpu.stat` et `memory.peak` de l'étape
// install du relevé 1 de l'étalonnage de l'exécution 45509307133
// (tests/fixtures/ci45509307133/PROVENANCE.md). Le banc en a tiré l'étape
// install de `readings[0].build.steps` de ce même étalonnage.
import { describe, expect, it } from "vitest";
import { cgroupUsage } from "../../runner/resource-usage.ts";
import { CALIBRATION, readFixture, readJsonFixture } from "../real-fixtures.ts";

const MEMORY_PEAK = readFixture(`${CALIBRATION.usage}/install/memory.peak`);
const CPU_STAT = readFixture(`${CALIBRATION.usage}/install/cpu.stat`);
const RECORDED = readJsonFixture<{ readings: { build: { steps: { step: string; peakMemoryBytes: number; cpuSeconds: number }[] } }[] }>(CALIBRATION.result).readings[0]!.build.steps.find(
  ({ step }) => step === "install",
)!;

describe("cgroupUsage", () => {
  it("reads the memory peak in bytes and the CPU time in seconds", () => {
    expect(cgroupUsage({ memoryPeak: MEMORY_PEAK, cpuStat: CPU_STAT })).toEqual({ peakMemoryBytes: RECORDED.peakMemoryBytes, cpuSeconds: RECORDED.cpuSeconds });
    expect(RECORDED).toMatchObject({ peakMemoryBytes: 330_964_992, cpuSeconds: 1.539808 });
  });

  it("fails with a clear message when memory.peak is missing, as on cgroup v1 or a kernel older than 5.19", () => {
    expect(() => cgroupUsage({ cpuStat: CPU_STAT })).toThrow(
      "memory.peak is missing from the container cgroup: calibration needs cgroup v2 and Linux 5.19 or later",
    );
    expect(() => cgroupUsage({ memoryPeak: "", cpuStat: CPU_STAT })).toThrow("memory.peak is missing from the container cgroup");
  });

  it("fails with a clear message when cpu.stat is missing or has no usage_usec", () => {
    expect(() => cgroupUsage({ memoryPeak: MEMORY_PEAK })).toThrow("cpu.stat is missing from the container cgroup: calibration needs cgroup v2");
    const withoutUsage = CPU_STAT.split("\n")
      .filter((line) => !line.startsWith("usage_usec "))
      .join("\n");
    expect(() => cgroupUsage({ memoryPeak: MEMORY_PEAK, cpuStat: withoutUsage })).toThrow("cpu.stat is missing from the container cgroup");
  });
});
