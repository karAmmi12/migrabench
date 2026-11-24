// Préconditions de `--counted` (spec de l'étape 3, « Modules » et récits 11 à
// 14) : une mesure prévue pour compter part d'un état publié. Chaque condition
// manquante est nommée, toutes dans un seul message.
import { describe, expect, it } from "vitest";
import { type CountedFacts, countedPreconditions } from "../../runner/counted.ts";

const ORIGIN_MAIN = "802178c0e1b2c3d4e5f60718293a4b5c6d7e8f90";

// Faits d'un état publié : toutes les conditions sont remplies.
const PUBLISHED: CountedFacts = {
  worktreeClean: true,
  originMain: ORIGIN_MAIN,
  headReachable: true,
  saltImposed: false,
  timeoutCapImposed: false,
  calibrationVersioned: true,
};

describe("preconditions of a measure planned to count", () => {
  it("are met from a published state, and give the origin/main commit used", () => {
    expect(countedPreconditions(PUBLISHED)).toEqual({ ok: true, originMain: ORIGIN_MAIN });
  });

  it.each([
    ["a modified worktree", { worktreeClean: false }, "worktree-modified", "the worktree is modified"],
    ["origin/main that could not be fetched", { originMain: undefined, headReachable: false }, "origin-main-unfetched", "origin/main could not be fetched"],
    ["HEAD not reachable from origin/main", { headReachable: false }, "head-unpublished", "HEAD is not reachable from origin/main"],
    ["an imposed salt", { saltImposed: true }, "salt-imposed", "the salt is imposed (ORACLE_SALT)"],
    ["an imposed timeout cap", { timeoutCapImposed: true }, "timeout-cap-imposed", "a timeout cap is imposed (--timeout-cap-ms)"],
    ["no versioned calibration", { calibrationVersioned: false }, "no-calibration", "no calibration result is versioned in results/calibration/"],
  ] as const)("refuses %s, naming it", (_, change, condition, text) => {
    const outcome = countedPreconditions({ ...PUBLISHED, ...change });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.missing).toEqual([condition]);
      expect(outcome.message).toContain(text);
    }
  });

  it("names every missing condition in a single message", () => {
    const outcome = countedPreconditions({
      worktreeClean: false,
      originMain: ORIGIN_MAIN,
      headReachable: false,
      saltImposed: true,
      timeoutCapImposed: true,
      calibrationVersioned: false,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.missing).toEqual(["worktree-modified", "head-unpublished", "salt-imposed", "timeout-cap-imposed", "no-calibration"]);
      expect(outcome.message).toBe(
        [
          "a measure planned to count must start from a published state; missing conditions:",
          "  - the worktree is modified",
          "  - HEAD is not reachable from origin/main",
          "  - the salt is imposed (ORACLE_SALT)",
          "  - a timeout cap is imposed (--timeout-cap-ms)",
          "  - no calibration result is versioned in results/calibration/",
        ].join("\n"),
      );
    }
  });
});
