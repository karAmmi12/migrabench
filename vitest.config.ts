import { configDefaults, defineConfig } from "vitest/config";

// Lance de vrais outils du banc : ils prennent le verrou du banc et écrivent
// sous results/diagnostic/ et .oracle-artifacts/, que d'autres tests
// surveillent (#90). Ce fichier tourne seul, après le groupe default.
const BENCH_TOOLS = "tests/runner/bench-lock-tools.test.ts";
// Écrit une mesure sous results/diagnostic/ et .oracle-artifacts/, comme
// BENCH_TOOLS, dont le nettoyage efface ce qu'il n'a pas vu avant lui (#102) :
// son propre groupe, après celui de BENCH_TOOLS.
const FOREIGN_STACK = "tests/runner/stack-not-from-this-copy.test.ts";
// Redémarre le legacy : aucun autre test ne doit écrire sur la pile pendant ce
// temps (#67). Son propre groupe, en dernier : deux projets du même
// groupOrder tournent en parallèle.
const LEGACY_RESTART = "tests/seam-a/access-log.test.ts";

// Ordre des groupes : default, puis BENCH_TOOLS, FOREIGN_STACK et
// LEGACY_RESTART. Aucun en 0 : avec un seul worker (runner de la CI), Vitest range les fichiers d'un
// projet en groupOrder 0 dans un groupe séquentiel placé après tous les autres
// (groupSpecs de Vitest 5), et default passerait en dernier (#67).

export default defineConfig({
  test: {
    // Marqueur du Seam A, tiré une fois par exécution (#67).
    globalSetup: ["tests/seam-a-marker.setup.ts"],
    projects: [
      { extends: true, test: { name: "default", include: ["tests/**/*.test.ts"], exclude: [...configDefaults.exclude, BENCH_TOOLS, FOREIGN_STACK, LEGACY_RESTART], sequence: { groupOrder: 1 } } },
      { extends: true, test: { name: "bench-tools", include: [BENCH_TOOLS], sequence: { groupOrder: 2 } } },
      { extends: true, test: { name: "foreign-stack", include: [FOREIGN_STACK], sequence: { groupOrder: 3 } } },
      { extends: true, test: { name: "legacy-restart", include: [LEGACY_RESTART], sequence: { groupOrder: 4 } } },
    ],
  },
});
