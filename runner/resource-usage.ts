// Relevé des ressources d'un conteneur (spec de l'étape 3, « Candidat
// d'étalonnage ») : le pic de mémoire (`memory.peak`) et le temps CPU
// (`usage_usec` de `cpu.stat`) du cgroup v2 du conteneur, qui couvrent tous
// ses processus. Un compteur absent arrête l'étalonnage : une valeur par
// défaut fausserait les limites qui en sortent.

export interface CgroupFiles {
  // Contenu des fichiers du cgroup, absent si la lecture a échoué.
  memoryPeak?: string | undefined;
  cpuStat?: string | undefined;
}

export interface ResourceUsage {
  peakMemoryBytes: number;
  cpuSeconds: number;
}

export function cgroupUsage({ memoryPeak, cpuStat }: CgroupFiles): ResourceUsage {
  const peak = memoryPeak?.trim() ?? "";
  if (!/^\d+$/.test(peak)) {
    throw new Error("memory.peak is missing from the container cgroup: calibration needs cgroup v2 and Linux 5.19 or later");
  }
  const usage = /^usage_usec (\d+)$/m.exec(cpuStat ?? "")?.[1];
  if (usage === undefined) throw new Error("cpu.stat is missing from the container cgroup: calibration needs cgroup v2");
  return { peakMemoryBytes: Number(peak), cpuSeconds: Number(usage) / 1_000_000 };
}
