// Chaque mesure versionnée dans results/counted/ passe le contrôle de
// oracle/result-check.ts (#73) : règles de #53, `counted: true`, `originMain`
// connu, `benchCommit` dans son historique, empreinte de oracle.json.
//
// Le même chemin est d'abord éprouvé sur des fixtures : une mesure valide, qui
// doit passer, une variante à l'empreinte fausse et un dossier sans
// measure.json (mesure plantée ou interrompue), qui doivent échouer. Tant que
// results/counted/ est vide, le test le dit (test sauté, nommé) au lieu de
// passer en silence.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FETCH_PULL_HEADS, measureEnvironment } from "../../oracle/repository.ts";
import { checkMeasureResult, formatViolation } from "../../oracle/result-check.ts";
import { cited, sha256 } from "../../shared/digest.ts";
import { COUNTED_DIR_FROM_ROOT, ROOT } from "../../shared/root.ts";

const FIXTURES = "tests/fixtures/counted-measures";
const environment = measureEnvironment(new URL("../../", import.meta.url));

// Manquements d'un dossier de mesure : son measure.json et, s'il existe, son
// oracle.json. Un dossier sans measure.json est un manquement : une mesure
// prévue pour compter ne disparaît jamais (récit 23).
function checkMeasureDirectory(dir: string): string[] {
  const measureFile = join(ROOT, dir, "measure.json");
  if (!existsSync(measureFile)) return [`${dir}: measure.json is missing (a counted measure that crashed or was interrupted?)`];
  const oracleFile = join(ROOT, dir, "oracle.json");
  const oracleDigest = existsSync(oracleFile) ? cited(sha256(readFileSync(oracleFile))) : undefined;
  const violations = checkMeasureResult(JSON.parse(readFileSync(measureFile, "utf8")), oracleDigest, environment);
  return violations.map((violation) => formatViolation(`${dir}/measure.json`, violation));
}

function report(problems: string[]): string {
  const hint = problems.some((problem) => /rule (benchCommit|originMain):/.test(problem))
    ? `\nThe commit may only be reachable from its pull request head: ${FETCH_PULL_HEADS}`
    : "";
  return `${problems.join("\n")}${hint}`;
}

describe("check of a versioned measure, on fixtures", () => {
  it("passes a valid measure planned to count", () => {
    const problems = checkMeasureDirectory(`${FIXTURES}/valid`);

    expect(problems, report(problems)).toEqual([]);
  });

  it("fails a measure whose oracle.json is not the one it cites", () => {
    expect(checkMeasureDirectory(`${FIXTURES}/wrong-oracle-digest`)).toEqual([expect.stringContaining("rule oracle:")]);
  });

  it("fails a measure directory without measure.json", () => {
    expect(checkMeasureDirectory(`${FIXTURES}/no-measure-json`)).toEqual([expect.stringContaining("measure.json is missing")]);
  });
});

// Chaque dossier de results/counted/, avec ou sans measure.json.
const measures = existsSync(join(ROOT, COUNTED_DIR_FROM_ROOT))
  ? readdirSync(join(ROOT, COUNTED_DIR_FROM_ROOT), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => name)
      .sort()
  : [];

describe("versioned measures planned to count", () => {
  if (measures.length === 0) {
    it.skip(`0 versioned measure in ${COUNTED_DIR_FROM_ROOT}/: check not evaluable`, () => {});
  } else {
    it.each(measures)("%s passes the measure check", (name) => {
      const dir = `${COUNTED_DIR_FROM_ROOT}/${name}`;
      const problems = checkMeasureDirectory(dir);

      expect(problems, report(problems)).toEqual([]);
    });
  }
});
