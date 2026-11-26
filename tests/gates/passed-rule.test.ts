// Seule règle de réussite (ADR 0008, « Conséquences ») : aucun module hors de
// gates/result.ts ne compare une issue à `"passed"`. Il passe par
// `gateResultPassed`, qui refuse un résultat relevé.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../shared/root.ts";

// Dossiers des sources du banc, sans les tests.
const SOURCE_DIRS = ["gates", "runner", "oracle", "scripts", "shared"];
const RULE_MODULE = "gates/result.ts";

// `outcome` comparé à `"passed"`, dans un sens ou dans l'autre, avec `==`,
// `===`, `!=` ou `!==`, quelle que soit la sorte de guillemets.
const COMPARISON = [/\boutcome\s*[!=]==?\s*(["'`])passed\1/, /(["'`])passed\1\s*[!=]==?\s*[\w.?!]*\boutcome\b/];

// Lignes, numérotées à partir de 1, qui comparent une issue à `"passed"`.
export function passedComparisons(source: string): string[] {
  return source.split("\n").flatMap((line, index) => (COMPARISON.some((pattern) => pattern.test(line)) ? [`${index + 1}: ${line.trim()}`] : []));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)));
}

describe("passed comparisons", () => {
  // Témoin : le contrôle sait détecter chaque forme.
  it.each([
    'if (result.outcome === "passed") count++;',
    "return r.outcome == 'passed';",
    "const ok = result.outcome !== `passed`;",
    'const ok = "passed" === result.outcome;',
    'const ok = "passed" !== gate?.outcome;',
  ])("finds %s", (line) => {
    expect(passedComparisons(`const a = 1;\n${line}\n`)).toEqual([`2: ${line}`]);
  });

  it.each(['status === "passed"', 'const result = { outcome: "passed" };', 'type Outcome = "passed" | "failed";'])("does not take %s for a comparison of an outcome", (line) => {
    expect(passedComparisons(line)).toEqual([]);
  });

  it(`is found nowhere in the bench sources outside ${RULE_MODULE}`, () => {
    const files = SOURCE_DIRS.flatMap(sourceFiles).filter((file) => file !== RULE_MODULE);
    // Le contrôle a bien examiné des sources, dont le module des portes.
    expect(files).toContain("gates/registry.ts");
    const found = files.flatMap((file) => passedComparisons(readFileSync(join(ROOT, file), "utf8")).map((line) => `${file}:${line}`));
    expect(found).toEqual([]);
  });
});
