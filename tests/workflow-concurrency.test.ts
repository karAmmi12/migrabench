// Chaque workflow a un groupe de concurrence par PR (#76) : un nouveau commit
// annule l'exécution en cours sur la même PR. Hors PR (push sur main,
// workflow_dispatch), chaque exécution a son propre groupe et n'est jamais
// annulée : les preuves produites sur main restent complètes.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../.github/workflows/", import.meta.url);
const workflows = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));

const CONCURRENCY = [
  "concurrency:",
  "  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}",
  "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
].join("\n");

describe("workflow concurrency", () => {
  it("finds the repository's workflows", () => {
    expect(workflows.length).toBeGreaterThanOrEqual(5);
  });

  it.each(workflows)("%s cancels the previous run of the same pull request, and only there", (name) => {
    expect(readFileSync(new URL(name, dir), "utf8")).toContain(`\n${CONCURRENCY}\n`);
  });
});
