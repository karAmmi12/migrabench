import { configDefaults, defineConfig } from "vitest/config";

// Lance de vrais outils du banc : ils prennent le verrou du banc et écrivent
// sous results/diagnostic/ et .oracle-artifacts/, que d'autres tests
// surveillent (#90). Ce fichier tourne seul, après le groupe par défaut.
const BENCH_TOOLS = "tests/runner/bench-lock-tools.test.ts";
// Redémarre le legacy : aucun autre test ne doit écrire sur la pile pendant ce
// temps (#67). Son propre groupe, après celui de BENCH_TOOLS : deux projets du
// même groupOrder tournent en parallèle.
const LEGACY_RESTART = "tests/seam-a/access-log.test.ts";

export default defineConfig({
  test: {
    // Marqueur du Seam A, tiré une fois par exécution (#67).
    globalSetup: ["tests/seam-a-marker.setup.ts"],
    projects: [
      { extends: true, test: { name: "default", include: ["tests/**/*.test.ts"], exclude: [...configDefaults.exclude, BENCH_TOOLS, LEGACY_RESTART] } },
      { extends: true, test: { name: "bench-tools", include: [BENCH_TOOLS], sequence: { groupOrder: 1 } } },
      { extends: true, test: { name: "legacy-restart", include: [LEGACY_RESTART], sequence: { groupOrder: 2 } } },
    ],
  },
});
