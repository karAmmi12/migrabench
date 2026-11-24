// État de l'arbre de travail enregistré dans le résultat, à partir de la
// sortie de `git status --porcelain=v1 -z --untracked-files=all`.
import { describe, expect, it } from "vitest";
import { worktreeState } from "../../oracle/worktree.ts";

// Une entrée par fichier, terminée par NUL, comme avec -z.
function status(...entries: string[]): string {
  return entries.map((entry) => `${entry}\0`).join("");
}

describe("worktree state", () => {
  it("is clean without any change", () => {
    expect(worktreeState("")).toBe("clean");
  });

  it("stays clean with new files in results/oracle", () => {
    expect(worktreeState(status("?? results/oracle/20261121T154403Z-482a395.json", "?? results/oracle/b.json"))).toBe(
      "clean",
    );
  });

  it("is dirty when an earlier result is modified", () => {
    expect(worktreeState(status(" M results/oracle/20261121T154403Z-482a395.json"))).toBe("dirty");
  });

  it("is dirty when an earlier result is deleted or staged", () => {
    expect(worktreeState(status(" D results/oracle/a.json"))).toBe("dirty");
    expect(worktreeState(status("A  results/oracle/a.json"))).toBe("dirty");
  });

  it("is dirty when a versioned file is modified", () => {
    expect(worktreeState(status(" M oracle/collect.ts"))).toBe("dirty");
  });

  it("is dirty with an untracked file outside results/oracle", () => {
    expect(worktreeState(status("?? notes.txt"))).toBe("dirty");
    expect(worktreeState(status("?? results/other.json"))).toBe("dirty");
    expect(worktreeState(status("?? results/oracle-copy/a.json"))).toBe("dirty");
  });

  // #73 : la même exception, étroite, pour les mesures prévues pour compter.
  it("stays clean with a new, untracked counted measure in results/counted", () => {
    expect(worktreeState(status("?? results/counted/20261124T150000Z-29e779b-reference-candidate/measure.json"))).toBe("clean");
  });

  it("is dirty when an earlier counted measure is modified, deleted or staged", () => {
    expect(worktreeState(status(" M results/counted/20261124T150000Z-29e779b-reference-candidate/measure.json"))).toBe("dirty");
    expect(worktreeState(status(" D results/counted/20261124T150000Z-29e779b-reference-candidate/oracle.json"))).toBe("dirty");
    expect(worktreeState(status("A  results/counted/20261124T150000Z-29e779b-reference-candidate/measure.json"))).toBe("dirty");
  });

  it("is dirty with an untracked file outside results/counted", () => {
    expect(worktreeState(status("?? results/counted-copy/a/measure.json"))).toBe("dirty");
    expect(worktreeState(status("?? results/measure.json"))).toBe("dirty");
  });

  it("is dirty when an earlier result is renamed (with -z, the source path follows the entry)", () => {
    expect(worktreeState(status("R  results/oracle/b.json", "results/oracle/a.json"))).toBe("dirty");
  });
});
