// Relevé des ressources d'un conteneur (spec de l'étape 3, « Candidat
// d'étalonnage ») : pic de mémoire et temps CPU lus dans le cgroup v2 du
// conteneur. Un compteur absent est une erreur, jamais une valeur par défaut.
import { describe, expect, it } from "vitest";
import { cgroupUsage } from "../../runner/resource-usage.ts";

const CPU_STAT = ["usage_usec 2500000", "user_usec 2000000", "system_usec 500000", "nr_periods 10", "nr_throttled 0", "throttled_usec 0", ""].join("\n");

describe("cgroupUsage", () => {
  it("reads the memory peak in bytes and the CPU time in seconds", () => {
    expect(cgroupUsage({ memoryPeak: "79495168\n", cpuStat: CPU_STAT })).toEqual({ peakMemoryBytes: 79_495_168, cpuSeconds: 2.5 });
  });

  it("fails with a clear message when memory.peak is missing, as on cgroup v1 or a kernel older than 5.19", () => {
    expect(() => cgroupUsage({ cpuStat: CPU_STAT })).toThrow(
      "memory.peak is missing from the container cgroup: calibration needs cgroup v2 and Linux 5.19 or later",
    );
    expect(() => cgroupUsage({ memoryPeak: "", cpuStat: CPU_STAT })).toThrow("memory.peak is missing from the container cgroup");
  });

  it("fails with a clear message when cpu.stat is missing or has no usage_usec", () => {
    expect(() => cgroupUsage({ memoryPeak: "79495168\n" })).toThrow(
      "cpu.stat is missing from the container cgroup: calibration needs cgroup v2",
    );
    expect(() => cgroupUsage({ memoryPeak: "79495168\n", cpuStat: "user_usec 1\n" })).toThrow("cpu.stat is missing from the container cgroup");
  });
});
