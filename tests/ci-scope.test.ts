// Décision de lancer ou non un job lourd de CI (#76).
import { describe, expect, it } from "vitest";
import { shouldRun, type History } from "../scripts/ci-scope.ts";

// Exécution terminée de la PR : commit, date, conclusion de chaque job.
type FakeWorkflowRun = { sha: string; at: string; jobs: Record<string, string | null> };

// Faux historique : les commits des exécutions sont des ancêtres de la tête sauf
// ceux de notAncestors ; changed donne les fichiers changés depuis un commit.
function history(
  runs: FakeWorkflowRun[] = [],
  git: { changed?: Record<string, string[]>; notAncestors?: string[] } = {},
): History {
  return {
    completedWorkflowRuns: async () => runs.map((run, id) => ({ id, headSha: run.sha, createdAt: run.at })),
    jobs: async (id) =>
      Object.entries(runs[id]!.jobs).map(([name, conclusion]) => ({ name, conclusion })),
    isAncestorOfHead: async (sha) => !(git.notAncestors ?? []).includes(sha),
    changedSince: async (sha) => {
      const files = git.changed?.[sha];
      if (!files) throw new Error(`no diff recorded since ${sha}`);
      return files;
    },
  };
}

describe("shouldRun", () => {
  it.each(["push", "workflow_dispatch"])("runs every heavy job outside a pull request (%s)", async (event) => {
    for (const job of ["tests", "oracle", "proof", "calibration", "measures"] as const) {
      expect((await shouldRun(job, { event, prFiles: [] }, history())).run).toBe(true);
    }
  });

  it("skips proof on a pull request touching none of its paths", async () => {
    const decision = await shouldRun("proof", pr("runner/cli.ts", "oracle.md", "docs/oracle/x.md"), history());

    expect(decision.run).toBe(false);
  });

  // fixtures/browser/ : le navigateur du banc et ses passerelles (#160).
  it.each(["oracle/cli.ts", "fixtures/legacy-app/pom.xml", "docker-compose.yml", "fixtures/browser/server.mjs", "results/oracle/x.json"])(
    "runs proof on a pull request touching %s",
    async (file) => {
      expect((await shouldRun("proof", pr("runner/cli.ts", file), history())).run).toBe(true);
    },
  );

  // #72 : l'étalonnage refait 5 constructions complètes ; il ne tourne que si
  // la PR touche ce qui fait ses relevés.
  it("skips calibration on a pull request touching none of its paths, such as a runner file that takes no reading", async () => {
    const decision = await shouldRun("calibration", pr("runner/verdict.ts", "oracle/cli.ts", "results/calibration/x.json"), history());

    expect(decision).toEqual({
      run: false,
      reason:
        "la PR ne touche aucun de fixtures/calibration-candidate/, fixtures/runtime-image/, runner/build.ts, runner/calibrate.ts, runner/calibration.ts, runner/candidate-runtime.ts, runner/contract.ts, runner/contract-phase.ts, runner/resource-usage.ts, .github/workflows/calibration.yml",
    });
  });

  it.each([
    "fixtures/calibration-candidate/package.json",
    "fixtures/runtime-image/Dockerfile",
    "runner/build.ts",
    "runner/calibrate.ts",
    "runner/calibration.ts",
    "runner/candidate-runtime.ts",
    "runner/contract.ts",
    "runner/contract-phase.ts",
    "runner/resource-usage.ts",
    ".github/workflows/calibration.yml",
  ])("runs calibration on a pull request touching %s", async (file) => {
    expect((await shouldRun("calibration", pr("runner/verdict.ts", file), history())).run).toBe(true);
  });

  // Le job des mesures (#74) dure une vingtaine de minutes : il ne tourne sur
  // une PR que si elle touche ce qu'il exécute, pas à chaque PR du runner.
  it("skips measures on a pull request touching none of its paths, such as a runner file", async () => {
    const decision = await shouldRun("measures", pr("runner/verdict.ts", "results/counted/x/measure.json"), history());

    expect(decision.run).toBe(false);
    expect(decision.reason).toMatch(/^la PR ne touche aucun de \.github\/workflows\/measures\.yml, /);
  });

  it.each([
    ".github/workflows/measures.yml",
    "fixtures/browser/playwright-gateway.mjs",
    "scripts/measure-cases.ts",
    "scripts/measure-process.ts",
    "scripts/run-measure-case.ts",
    "scripts/interrupt-measure.ts",
    "scripts/start-report.ts",
    "fixtures/defective-candidates/never-ready/server.js",
    "tests/fixtures/broken-stack/legacy-never-healthy.compose.yml",
  ])("runs measures on a pull request touching %s", async (file) => {
    expect((await shouldRun("measures", pr("runner/verdict.ts", file), history())).run).toBe(true);
  });

  it("skips measures when none of its paths changed since it succeeded on the pull request", async () => {
    const runs = [{ sha: "a1", at: "2026-11-23T10:00:00Z", jobs: { changes: "success", measures: "success" } }];

    expect((await shouldRun("measures", pr("scripts/measure-cases.ts"), history(runs, { changed: { a1: ["results/counted/x/measure.json", "runner/verdict.ts"] } }))).run).toBe(false);
  });

  it("skips calibration when only docs/** changed since it succeeded on the pull request", async () => {
    const runs = [{ sha: "a1", at: "2026-11-23T10:00:00Z", jobs: { changes: "success", calibration: "success" } }];

    expect(await shouldRun("calibration", pr("runner/calibrate.ts"), history(runs, { changed: { a1: ["docs/x.md"] } }))).toEqual({
      run: false,
      reason: "seul docs/** a changé depuis a1, où calibration a réussi",
    });
  });

  // Versionner un résultat d'étalonnage ne doit pas en produire un autre.
  it("skips calibration when none of its paths changed since it succeeded on the pull request", async () => {
    const runs = [{ sha: "a1", at: "2026-11-23T10:00:00Z", jobs: { changes: "success", calibration: "success" } }];
    const changed = { a1: ["results/calibration/x.json", "docs/formation/journal/72-x.md"] };

    expect(await shouldRun("calibration", pr("runner/calibrate.ts"), history(runs, { changed }))).toEqual({
      run: false,
      reason: "aucun de ses chemins n'a changé depuis a1, où calibration a réussi",
    });
  });

  it("runs calibration when one of its paths changed since it succeeded on the pull request", async () => {
    const runs = [{ sha: "a1", at: "2026-11-23T10:00:00Z", jobs: { changes: "success", calibration: "success" } }];

    expect((await shouldRun("calibration", pr("runner/calibrate.ts"), history(runs, { changed: { a1: ["runner/calibration.ts"] } }))).run).toBe(true);
  });

  // #83 : une PR neuve n'a aucune référence, mais son code est celui de la base.
  it.each(["tests", "oracle"] as const)(
    "skips %s on a pull request touching only docs/**, even without reference",
    async (job) => {
      expect(await shouldRun(job, pr("docs/x.md", "docs/y/z.md"), history())).toEqual({
        run: false,
        reason: "la PR ne touche que docs/**",
      });
    },
  );

  it("runs a job on a pull request with an empty diff: nothing changed is not a docs-only change", async () => {
    expect((await shouldRun("tests", pr(), history())).run).toBe(true);
  });

  it("skips a job when only docs/** changed since its last success on the pull request", async () => {
    const runs = [{ sha: "a1", at: "2026-11-23T10:00:00Z", jobs: { tests: "success" } }];

    const decision = await shouldRun("tests", pr("runner/cli.ts"), history(runs, { changed: { a1: ["docs/x.md", "docs/y/z.md"] } }));

    expect(decision).toEqual({ run: false, reason: "seul docs/** a changé depuis a1, où tests a réussi" });
  });

  it("takes the most recent success as reference, whatever the order of the runs", async () => {
    const runs = [
      { sha: "a1", at: "2026-11-23T10:00:00Z", jobs: { oracle: "success" } },
      { sha: "b2", at: "2026-11-23T11:00:00Z", jobs: { oracle: "success" } },
    ];
    const changed = { a1: ["oracle/cli.ts", "docs/x.md"], b2: ["docs/x.md"] };

    expect((await shouldRun("oracle", pr("oracle/cli.ts"), history(runs, { changed }))).run).toBe(false);
  });

  it("ignores a success on a commit that is not an ancestor of the head (force push)", async () => {
    const runs = [
      { sha: "a1", at: "2026-11-23T10:00:00Z", jobs: { tests: "success" } },
      { sha: "rewritten", at: "2026-11-23T11:00:00Z", jobs: { tests: "success" } },
    ];
    const git = { changed: { a1: ["runner/cli.ts"], rewritten: ["docs/x.md"] }, notAncestors: ["rewritten"] };

    expect(await shouldRun("tests", pr("runner/cli.ts"), history(runs, git))).toEqual({
      run: true,
      reason: "des fichiers hors docs/** ont changé depuis a1, où tests a réussi",
    });
  });

  it("runs a job re-run on the commit where it succeeded: nothing changed is not a docs-only change", async () => {
    const runs = [{ sha: "a1", at: "2026-11-23T10:00:00Z", jobs: { tests: "success" } }];

    expect((await shouldRun("tests", pr("runner/cli.ts"), history(runs, { changed: { a1: [] } }))).run).toBe(true);
  });

  it("runs a job that never succeeded on the pull request", async () => {
    const runs = [{ sha: "a1", at: "2026-11-23T10:00:00Z", jobs: { oracle: "success", proof: "failure" } }];

    expect(await shouldRun("proof", pr("oracle/cli.ts"), history(runs, { changed: { a1: ["docs/x.md"] } }))).toEqual({
      run: true,
      reason: "proof n'a réussi sur aucun commit de la PR ancêtre de la tête",
    });
  });

  it.each(["failure", "cancelled", "skipped", null])("never takes a %s job as reference", async (conclusion) => {
    const runs = [
      { sha: "a1", at: "2026-11-23T10:00:00Z", jobs: { tests: "success" } },
      { sha: "b2", at: "2026-11-23T11:00:00Z", jobs: { tests: conclusion } },
    ];
    const changed = { a1: ["runner/cli.ts", "docs/x.md"], b2: ["docs/x.md"] };

    expect((await shouldRun("tests", pr("runner/cli.ts"), history(runs, { changed }))).run).toBe(true);
  });

  // Le trou que la règle ferme : un commit de code annulé par un commit docs poussé aussitôt.
  it("runs on a docs-only commit that cancelled a code commit", async () => {
    const runs = [
      { sha: "a1", at: "2026-11-23T10:00:00Z", jobs: { tests: "success" } },
      { sha: "code", at: "2026-11-23T11:00:00Z", jobs: { tests: "cancelled" } },
    ];
    const changed = { a1: ["runner/cli.ts", "docs/x.md"], code: ["docs/x.md"] };

    expect(await shouldRun("tests", pr("runner/cli.ts"), history(runs, { changed }))).toEqual({
      run: true,
      reason: "des fichiers hors docs/** ont changé depuis a1, où tests a réussi",
    });
  });

  it("does not take another job's success as reference", async () => {
    const runs = [{ sha: "a1", at: "2026-11-23T10:00:00Z", jobs: { oracle: "success", proof: "skipped" } }];

    expect((await shouldRun("proof", pr("oracle/cli.ts"), history(runs, { changed: { a1: ["docs/x.md"] } }))).run).toBe(
      true,
    );
  });

  it.each([["docs.md"], ["docsite/x.md"], ["fixtures/docs/x.md"]])("does not read %s as docs/**", async (file) => {
    const runs = [{ sha: "a1", at: "2026-11-23T10:00:00Z", jobs: { tests: "success" } }];

    expect((await shouldRun("tests", pr(file), history(runs, { changed: { a1: [file] } }))).run).toBe(true);
  });
});

function pr(...prFiles: string[]) {
  return { event: "pull_request", prFiles };
}
