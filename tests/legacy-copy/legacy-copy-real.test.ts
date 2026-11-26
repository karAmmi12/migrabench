// Copie expurgée du vrai legacy (ADR 0010, #125), sans Docker : marqueur des
// commentaires à la source, puis test témoin sur la copie, le prompt et le
// brief de l'agent.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GATES } from "../../gates/registry.ts";
import { BENCH_MARKER, expurgate, isExcluded, readLegacyFiles, REWRITES, unmarkedBenchComments } from "../../scripts/legacy-copy.ts";
import { readBenchEnv, ROOT } from "../../shared/root.ts";

const legacy = readLegacyFiles(ROOT);
const copy = expurgate(legacy);
const kit = ["prompt.md", "brief.md"].map((name) => ({
  path: `fixtures/trial-kit/${name}`,
  content: readFileSync(join(ROOT, "fixtures/trial-kit", name), "utf8"),
}));

// Noms des scénarios de l'oracle, tels qu'exécutés : relevés dans l'oracle.json
// de la dernière mesure comptée versionnée, une vraie sortie du banc.
interface OracleSuite {
  specs?: { title: string }[];
  suites?: OracleSuite[];
}
const latestCounted = readdirSync(join(ROOT, "results/counted")).sort().at(-1) ?? "";
const oracleResult = JSON.parse(readFileSync(join(ROOT, "results/counted", latestCounted, "oracle.json"), "utf8")) as OracleSuite;
const titlesOf = (suite: OracleSuite): string[] => [
  ...(suite.specs ?? []).map((spec) => spec.title),
  ...(suite.suites ?? []).flatMap(titlesOf),
];
const scenarioNames = titlesOf(oracleResult);

// Noms des portes et de leurs résultats, lus dans le registre des portes
// (#124), en mots entiers : une porte ajoutée au registre entre dans le
// témoin. Les noms ne sont jamais `role` ni `auth` seuls, vocabulaire Java EE
// que la copie garde (`role-name`, `isUserInRole`, `auth-constraint`) :
// décision de Karim du 26/11 sur #125.
const GATE_NAMES = GATES.flatMap((gate) => [gate.name, ...Object.keys(gate.results)]);

const { ARCHIVE_TOKEN } = await readBenchEnv();
if (ARCHIVE_TOKEN === undefined) throw new Error("ARCHIVE_TOKEN missing from .env");

// Termes cherchés en sous-chaîne, sans tenir compte de la casse.
const SUBSTRINGS = [
  "TRAPS", "piège", "trap", "scenario:", "gate:", "test:", "banc", "bench", "benchmark", "harness", "oracle", "témoin", "temoin",
  ARCHIVE_TOKEN, "XSS", "migrabench", "__mb", BENCH_MARKER, ...scenarioNames,
];
// Termes cherchés en mots entiers : `réservé` ne doit pas prendre « Remise
// réservée aux instructeurs », texte de l'écran 3 (décision de Karim du 26/11).
const WORDS = ["réservé", ...GATE_NAMES, "seam", "glossary", "adr"];

function witnessHits(text: string): string[] {
  const lower = text.toLowerCase();
  return [
    ...SUBSTRINGS.filter((term) => lower.includes(term.toLowerCase())),
    ...WORDS.filter((word) => new RegExp(`(?<![\\p{L}\\p{N}_-])${word}(?![\\p{L}\\p{N}_-])`, "iu").test(text)),
  ];
}

describe("bench comments of fixtures/legacy-app", () => {
  it.each(legacy.filter((file) => !isExcluded(file.path)).map((file) => [file.path, file]))(
    "%s: every comment that cites the bench carries the marker",
    (_path, file) => {
      expect(unmarkedBenchComments(file.path, file.content).map((comment) => comment.text)).toEqual([]);
    },
  );
});

describe("legacy copy given to the agent", () => {
  it("finds the oracle scenarios to look for", () => {
    expect(scenarioNames.length).toBeGreaterThanOrEqual(38);
  });

  it("finds the gates to look for in the registry", () => {
    expect(GATE_NAMES).toContain("relay");
    expect(GATE_NAMES).not.toContain("role");
    expect(GATE_NAMES).not.toContain("auth");
  });

  it("finds the file of every rewrite of the copy", () => {
    expect(REWRITES.filter((rewrite) => !legacy.some((file) => file.path === rewrite.path))).toEqual([]);
  });

  it("names no reservation in the dataset loader of the copy", () => {
    const loader = copy.find((file) => file.path.endsWith("/DatasetLoader.java"));

    expect(loader?.content).toBeDefined();
    expect(loader?.content).not.toMatch(/reservation/i);
  });

  it.each(SUBSTRINGS.concat(WORDS).map((term) => [term]))("the witness finds %s planted in a file", (term) => {
    expect(witnessHits(`<p>Un texte avec ${term} dedans</p>`)).toContain(term);
  });

  it("leaves out TRAPS.md, the Dockerfile and access-log/, and keeps every other file", () => {
    const kept = legacy.filter((file) => !isExcluded(file.path));

    expect(copy.map((file) => file.path).some((path) => /TRAPS|Dockerfile|access-log/.test(path))).toBe(false);
    expect(copy).toHaveLength(kept.length);
  });

  it.each([...copy, ...kit].map((file) => [file.path, file]))("%s: no bench term in the path or content", (_path, file) => {
    expect(witnessHits(file.path)).toEqual([]);
    expect(witnessHits(file.content)).toEqual([]);
  });

  it("keeps no reserved dossier and no reservations, and every field of every kept dossier is clean", () => {
    const source = JSON.parse(legacy.find((file) => file.path === "src/main/resources/dossiers.json")?.content ?? "") as {
      reservations: Record<string, string[]>;
    };
    const dataset = JSON.parse(copy.find((file) => file.path === "src/main/resources/dossiers.json")?.content ?? "") as Record<
      string,
      Record<string, string>[]
    >;
    const reserved = new Set(Object.values(source.reservations).flat());

    expect(Object.keys(dataset)).toEqual(["dossiers"]);
    expect(dataset.dossiers?.length).toBeGreaterThan(0);
    for (const dossier of dataset.dossiers ?? []) {
      expect(reserved.has(dossier.number as string), dossier.number).toBe(false);
      for (const [field, value] of Object.entries(dossier)) {
        expect(witnessHits(`${field} ${value}`), `${dossier.number}.${field}`).toEqual([]);
      }
    }
  });
});
