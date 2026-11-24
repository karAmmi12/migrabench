import { configDefaults, defineConfig } from "vitest/config";

// Lance de vrais outils du banc : ils prennent le verrou du banc et écrivent
// sous results/diagnostic/ et .oracle-artifacts/, que d'autres tests
// surveillent (#90). Ce fichier tourne seul, après tous les autres.
const BENCH_TOOLS = "tests/runner/bench-lock-tools.test.ts";

export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: "default", include: ["tests/**/*.test.ts"], exclude: [...configDefaults.exclude, BENCH_TOOLS] } },
      { extends: true, test: { name: "bench-tools", include: [BENCH_TOOLS], sequence: { groupOrder: 1 } } },
    ],
  },
});
