// La référence d'un job lourd (#76, scripts/ci-scope.ts) se cherche par le nom
// que l'API GitHub rend pour ce job : son `name:` s'il en a un, sinon son id.
// Un `name:` ajouté ferait tourner le job à chaque fois, sans rien signaler.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HEAVY_JOBS } from "../scripts/ci-scope.ts";

const dir = new URL("../.github/workflows/", import.meta.url);

// Bloc YAML de chaque job : de `  <id>:` jusqu'au job suivant.
function jobBlocks(): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  for (const name of readdirSync(dir).filter((file) => /\.ya?ml$/.test(file))) {
    const lines = readFileSync(new URL(name, dir), "utf8").split("\n");
    const start = lines.indexOf("jobs:");
    let current: string[] | null = null;
    for (const line of start === -1 ? [] : lines.slice(start + 1)) {
      const id = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)?.[1];
      if (id !== undefined) blocks.set(id, (current = []));
      else if (/^\S/.test(line)) current = null;
      else current?.push(line);
    }
  }
  return blocks;
}

describe("heavy jobs", () => {
  const blocks = jobBlocks();

  it.each(HEAVY_JOBS)("%s exists and has no name: the API names it by its id", (job) => {
    const block = blocks.get(job);

    expect(block, `job ${job} absent des workflows`).toBeDefined();
    expect(block!.filter((line) => /^ {4}name:/.test(line))).toEqual([]);
  });
});
