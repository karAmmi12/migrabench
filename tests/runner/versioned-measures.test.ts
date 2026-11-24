// Chaque mesure versionnée dans results/counted/ passe le contrôle de
// oracle/result-check.ts (#73) : règles de #53, `counted: true`, `originMain`
// connu, `benchCommit` dans son historique, empreinte de oracle.json.
//
// Le même chemin est d'abord éprouvé sur deux fixtures : une mesure témoin
// valide, qui doit passer, et une variante à l'empreinte fausse, qui doit
// échouer. Tant que results/counted/ est vide, le test le dit (test sauté,
// nommé) au lieu de passer en silence.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FETCH_PULL_HEADS, measureEnvironment } from "../../oracle/repository.ts";
import { checkMeasureResult, formatViolation, type Violation } from "../../oracle/result-check.ts";
import { cited, sha256 } from "../../shared/digest.ts";
import { COUNTED_DIR_FROM_ROOT, ROOT } from "../../shared/root.ts";

const FIXTURES = "tests/fixtures/counted-measures";
const environment = measureEnvironment(new URL("../../", import.meta.url));

// Contrôle d'un dossier de mesure : son measure.json et, s'il existe, son oracle.json.
function checkMeasureDirectory(dir: string): Violation[] {
  const oracleFile = join(ROOT, dir, "oracle.json");
  const oracleDigest = existsSync(oracleFile) ? cited(sha256(readFileSync(oracleFile))) : undefined;
  return checkMeasureResult(JSON.parse(readFileSync(join(ROOT, dir, "measure.json"), "utf8")), oracleDigest, environment);
}

function messages(dir: string, violations: Violation[]): string {
  const hint = violations.some(({ rule }) => rule === "benchCommit" || rule === "originMain")
    ? `\nThe commit may only be reachable from its pull request head: ${FETCH_PULL_HEADS}`
    : "";
  return `${violations.map((violation) => formatViolation(`${dir}/measure.json`, violation)).join("\n")}${hint}`;
}

describe("check of a versioned measure, on fixtures", () => {
  it("passes a valid measure planned to count", () => {
    const violations = checkMeasureDirectory(`${FIXTURES}/valid`);

    expect(violations, messages(`${FIXTURES}/valid`, violations)).toEqual([]);
  });

  it("fails a measure whose oracle.json is not the one it cites", () => {
    expect(checkMeasureDirectory(`${FIXTURES}/wrong-oracle-digest`).map(({ rule }) => rule)).toEqual(["oracle"]);
  });
});

const measures = existsSync(join(ROOT, COUNTED_DIR_FROM_ROOT))
  ? readdirSync(join(ROOT, COUNTED_DIR_FROM_ROOT)).filter((name) => existsSync(join(ROOT, COUNTED_DIR_FROM_ROOT, name, "measure.json"))).sort()
  : [];

describe("versioned measures planned to count", () => {
  if (measures.length === 0) {
    it.skip(`0 versioned measure in ${COUNTED_DIR_FROM_ROOT}/: check not evaluable`, () => {});
  } else {
    it.each(measures)("%s passes the measure check", (name) => {
      const dir = `${COUNTED_DIR_FROM_ROOT}/${name}`;
      const violations = checkMeasureDirectory(dir);

      expect(violations, messages(dir, violations)).toEqual([]);
    });
  }
});
