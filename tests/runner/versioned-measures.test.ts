// Chaque mesure versionnée dans results/counted/ passe le contrôle de
// oracle/result-check.ts (#73) : règles de #53, `counted: true`, `originMain`
// connu, `benchCommit` dans son historique, empreinte de oracle.json ; et
// oracle.json lui-même passe le contrôle des résultats de l'oracle (#53) :
// l'empreinte prouve qu'il n'a pas changé, pas qu'il est sain.
//
// Le même chemin est d'abord éprouvé sur la copie d'une vraie mesure comptée
// (exécution 45624689673, tests/fixtures/ci45624689673/PROVENANCE.md), qui
// doit passer, puis sur des variantes de cette copie, écrites dans un dossier
// temporaire : une empreinte fausse, un oracle.json au sel imposé et un
// dossier sans measure.json (mesure plantée ou interrompue), qui doivent
// échouer. Tant que results/counted/ est vide, le test le dit (test sauté,
// nommé) au lieu de passer en silence.
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import { FETCH_PULL_HEADS, measureEnvironment } from "../../oracle/repository.ts";
import { type CheckedResult, checkMeasureResult, checkResult, formatViolation } from "../../oracle/result-check.ts";
import { cited, sha256 } from "../../shared/digest.ts";
import { COUNTED_DIR_FROM_ROOT, ROOT } from "../../shared/root.ts";
import { fixturePath, MEASURES, readFixture, readMeasure, variant } from "../real-fixtures.ts";

const environment = measureEnvironment(new URL("../../", import.meta.url));

// Manquements d'un dossier de mesure : son measure.json et, s'il existe, son
// oracle.json. Un dossier sans measure.json est un manquement : une mesure
// prévue pour compter ne disparaît jamais (récit 23). `dir` : relatif à la
// racine du dépôt, ou absolu.
function checkMeasureDirectory(dir: string): string[] {
  const path = isAbsolute(dir) ? dir : join(ROOT, dir);
  const measureFile = join(path, "measure.json");
  if (!existsSync(measureFile)) return [`${dir}: measure.json is missing (a counted measure that crashed or was interrupted?)`];
  const oracleFile = join(path, "oracle.json");
  const oracle = existsSync(oracleFile) ? readFileSync(oracleFile) : undefined;
  const oracleDigest = oracle === undefined ? undefined : cited(sha256(oracle));
  const violations = checkMeasureResult(JSON.parse(readFileSync(measureFile, "utf8")), oracleDigest, environment);
  const oracleViolations = oracle === undefined ? [] : checkResult(JSON.parse(oracle.toString("utf8")) as CheckedResult, environment);
  return [
    ...violations.map((violation) => formatViolation(`${dir}/measure.json`, violation)),
    ...oracleViolations.map((violation) => formatViolation(`${dir}/oracle.json`, violation)),
  ];
}

function report(problems: string[]): string {
  const hint = problems.some((problem) => /rule (benchCommit|originMain):/.test(problem))
    ? `\nThe commit may only be reachable from its pull request head: ${FETCH_PULL_HEADS}`
    : "";
  return `${problems.join("\n")}${hint}`;
}

// La vraie mesure comptée : son measure.json et son oracle.json, tels qu'écrits par le banc.
const REFERENCE_DIR = fixturePath(MEASURES.reference.results);
// Texte de son oracle.json, dont measure.json cite l'empreinte.
const ORACLE_TEXT = readFixture(`${MEASURES.reference.results}/oracle.json`);

// Dossier temporaire d'une variante : `files` y est écrit tel quel.
function variantDirectory(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "mb-counted-measure-"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

describe("check of a versioned measure, on a real measure and its variants", () => {
  it("passes the real counted measure", () => {
    const problems = checkMeasureDirectory(REFERENCE_DIR);

    expect(problems, report(problems)).toEqual([]);
  });

  it("fails a measure whose oracle.json is not the one it cites", () => {
    const measure = variant(readMeasure(MEASURES.reference), ({ oracle }) => ((oracle as { result: string }).result = cited("0".repeat(64))));

    expect(checkMeasureDirectory(variantDirectory({ "measure.json": JSON.stringify(measure), "oracle.json": ORACLE_TEXT }))).toEqual([expect.stringContaining("rule oracle:")]);
  });

  // L'oracle.json au sel imposé est cité par son empreinte : seule sa propre
  // règle échoue.
  it("fails a measure whose oracle.json does not pass the oracle result check", () => {
    const oracle = variant(JSON.parse(ORACLE_TEXT) as { config: { metadata: Record<string, unknown> } }, ({ config }) => (config.metadata.saltImposed = true));
    const oracleText = JSON.stringify(oracle);
    const measure = variant(readMeasure(MEASURES.reference), ({ oracle }) => ((oracle as { result: string }).result = cited(sha256(oracleText))));

    expect(checkMeasureDirectory(variantDirectory({ "measure.json": JSON.stringify(measure), "oracle.json": oracleText }))).toEqual([expect.stringMatching(/oracle\.json: rule saltImposed:/)]);
  });

  it("fails a measure directory without measure.json", () => {
    expect(checkMeasureDirectory(variantDirectory({ "oracle.json": ORACLE_TEXT }))).toEqual([expect.stringContaining("measure.json is missing")]);
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
