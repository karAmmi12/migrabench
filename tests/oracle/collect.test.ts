// Collecte de l'oracle, sur de vrais rapports JSON de Playwright, sans lancer
// Playwright (#115). Trois mesures de l'exécution 45624689673
// (tests/fixtures/ci45624689673/PROVENANCE.md) : le candidat de référence
// (38 scénarios réussis), le relais qui altère un libellé (scénarios échoués)
// et la sonde d'isolation (scénarios non atteints). Pour chacune : le rapport
// brut de Playwright (`oracle/report.json`), l'oracle.json que le banc en a
// tiré et son measure.json. Chaque variante part d'un rapport brut et ne
// change que ce que son test regarde.
import { basename } from "node:path";
import type { JSONReport, JSONReportSpec, JSONReportSuite } from "@playwright/test/reporter";
import { describe, expect, it } from "vitest";
import { artifactPaths, collect, type OracleSummary, unreachedSummary } from "../../oracle/collect.ts";
import { CI_ROOT, MEASURES, readJsonFixture } from "../real-fixtures.ts";

interface Measure {
  salt: string;
  saltImposed: boolean;
  oracle: { summary: OracleSummary };
}

interface RealCase {
  // Rapport brut de Playwright, chemins absolus du runner de la CI.
  raw: JSONReport;
  // oracle.json écrit par le banc à partir de ce rapport.
  oracle: JSONReport;
  measure: Measure;
  // Dossier des bruts de l'oracle sur le runner de la CI.
  artifactsDir: string;
}

function realCase({ results, artifacts }: { results: string; artifacts: string }): RealCase {
  return {
    raw: readJsonFixture<JSONReport>(`${artifacts}/oracle/report.json`),
    oracle: readJsonFixture<JSONReport>(`${results}/oracle.json`),
    measure: readJsonFixture<Measure>(`${results}/measure.json`),
    artifactsDir: `${CI_ROOT}/.oracle-artifacts/${basename(artifacts)}/oracle`,
  };
}

const REFERENCE = realCase(MEASURES.reference);
const RELAY = realCase(MEASURES.relay);
const PROBE = realCase(MEASURES.probe);

function specsOf(report: JSONReport): JSONReportSpec[] {
  const walk = (suite: JSONReportSuite): JSONReportSpec[] => [...suite.specs, ...(suite.suites ?? []).flatMap(walk)];
  return report.suites.flatMap(walk);
}

// Empreintes des HAR et traces, telles que l'oracle.json de la mesure les cite
// (mb:har, mb:trace), indexées par le chemin absolu du rapport brut. Les bruts
// eux-mêmes ne sont pas copiés : la collecte reçoit les empreintes, elle ne
// les calcule pas.
function realHashes({ raw, oracle }: RealCase): Record<string, string> {
  const cited = specsOf(oracle);
  return Object.fromEntries(
    specsOf(raw).flatMap((spec, index) => {
      const annotations = cited[index]!.tests[0]!.annotations;
      return spec.tests[0]!.results.at(-1)!.attachments.flatMap((attachment) => {
        const annotation = annotations.find(({ type }) => type === `mb:${attachment.name}`);
        return annotation === undefined || attachment.path === undefined ? [] : [[attachment.path, annotation.description!.replace("sha256:", "")]];
      });
    }),
  );
}

// Collecte d'une mesure comme le banc l'a faite, sur `raw` ou une variante.
function collectCase(real: RealCase, raw: JSONReport = real.raw, { root = CI_ROOT, saltImposed = real.measure.saltImposed, hashes = realHashes(real) } = {}) {
  return collect(raw, { hashes, salt: real.measure.salt, saltImposed, root, artifactsDir: real.artifactsDir.replace(CI_ROOT, root) });
}

// Variante d'un rapport brut : `change` modifie une copie.
function variant(raw: JSONReport, change: (copy: JSONReport) => void): JSONReport {
  const copy = structuredClone(raw);
  change(copy);
  return copy;
}

const firstSpec = (report: JSONReport) => specsOf(report)[0]!;
const firstResult = (report: JSONReport) => firstSpec(report).tests[0]!.results.at(-1)!;

describe("oracle collection, on real Playwright reports", () => {
  it.each([
    ["reference candidate", REFERENCE],
    ["relay that alters a label", RELAY],
    ["isolation probe", PROBE],
  ])("turns the raw report of the %s into its oracle.json, with the summary of its measure.json", (_, real) => {
    const { report, summary } = collectCase(real);

    expect(summary).toEqual(real.measure.oracle.summary);
    expect(report).toEqual(real.oracle);
  });

  it("classifies passed, failed (reached) and unreached scenarios", () => {
    expect(collectCase(REFERENCE).summary).toMatchObject({ scenarios: 38, passed: 38, failed: 0, unreached: 0 });
    expect(collectCase(RELAY).summary).toMatchObject({ scenarios: 38, passed: 25, failed: 13, unreached: 0 });
    expect(collectCase(PROBE).summary).toMatchObject({ scenarios: 38, passed: 0, failed: 0, unreached: 38 });
  });

  // Dans les vrais rapports, mb:reach est à la fois dans les annotations du
  // test et dans celles de son résultat.
  it("reads mb:reach from the result annotations too", () => {
    const raw = variant(RELAY.raw, (copy) => {
      for (const spec of specsOf(copy)) spec.tests[0]!.annotations = spec.tests[0]!.annotations.filter(({ type }) => type !== "mb:reach");
    });

    expect(collectCase(RELAY, raw).summary).toMatchObject({ failed: 13, unreached: 0 });
  });

  // Trois des 13 échecs du relais, sans mb:reach nulle part, deviennent non
  // atteints : les deux taux diffèrent.
  it("computes both rates and the @clavier count", () => {
    const unreached = ["search-applicant-contains-case", "sheet-tab-order", "sheet-content"];
    const raw = variant(RELAY.raw, (copy) => {
      for (const spec of specsOf(copy).filter(({ title }) => unreached.includes(title))) {
        const test = spec.tests[0]!;
        test.annotations = [];
        test.results.at(-1)!.annotations = [];
      }
    });

    expect(collectCase(RELAY, raw).summary).toEqual({
      scenarios: 38,
      passed: 25,
      failed: 10,
      unreached: 3,
      passRate: 25 / 38,
      reachedPassRate: 25 / 35,
      keyboard: { passed: 3, total: 5 },
    });
  });

  it("leaves the reached rate undefined when no scenario is reached", () => {
    expect(collectCase(PROBE).summary).toEqual({
      scenarios: 38,
      passed: 0,
      failed: 0,
      unreached: 38,
      passRate: 0,
      reachedPassRate: null,
      keyboard: { passed: 0, total: 5 },
    });
  });

  it("adds the HAR and trace digests to each scenario, after its own annotations", () => {
    const hashes = realHashes(REFERENCE);
    const { report } = collectCase(REFERENCE);

    specsOf(REFERENCE.raw).forEach((spec, index) => {
      const [har, trace] = ["har", "trace"].map((name) => spec.tests[0]!.results[0]!.attachments.find((attachment) => attachment.name === name)!.path!);
      expect(specsOf(report)[index]!.tests[0]!.annotations).toEqual([
        ...spec.tests[0]!.annotations,
        { type: "mb:har", description: `sha256:${hashes[har!]}` },
        { type: "mb:trace", description: `sha256:${hashes[trace!]}` },
      ]);
    });
  });

  it.each([false, true])(
    "adds the salt, whether it was imposed (%s), and the summary to the execution metadata, after the environment",
    (saltImposed) => {
      const { report, summary } = collectCase(REFERENCE, REFERENCE.raw, { saltImposed });

      expect(report.config.metadata).toEqual({ ...REFERENCE.raw.config.metadata, salt: REFERENCE.measure.salt, saltImposed, summary });
      expect(Object.keys(report.config.metadata).slice(-3)).toEqual(["salt", "saltImposed", "summary"]);
    },
  );

  it("does not modify the Playwright report it reads", () => {
    const before = structuredClone(REFERENCE.raw);

    collectCase(REFERENCE);

    expect(REFERENCE.raw).toEqual(before);
  });

  it.each(["har", "trace"])("fails instead of writing an incomplete result when a scenario has no %s", (name) => {
    const raw = variant(REFERENCE.raw, (copy) => {
      const result = specsOf(copy)[1]!.tests[0]!.results[0]!;
      result.attachments = result.attachments.filter((attachment) => attachment.name !== name);
    });

    expect(() => collectCase(REFERENCE, raw)).toThrow(`${specsOf(raw)[1]!.title}: no ${name} attachment`);
  });

  it("fails when an artifact has no digest", () => {
    const har = artifactPaths(REFERENCE.raw)[0];

    expect(() => collectCase(REFERENCE, REFERENCE.raw, { hashes: {} })).toThrow(`${firstSpec(REFERENCE.raw).title}: no digest for ${har}`);
  });
});

describe("oracle collection of paths", () => {
  // Le rapport brut de la référence, tel qu'il aurait été écrit depuis un
  // dépôt cloné sous un répertoire personnel de macOS.
  const MAC_ROOT = "/Users/someone/migrabench";
  const onMac = (raw: JSONReport) => JSON.parse(JSON.stringify(raw).replaceAll(CI_ROOT, MAC_ROOT)) as JSONReport;

  it("cites artifacts by paths relative to the execution's artifacts directory", () => {
    const { report } = collectCase(PROBE);

    expect(firstResult(report).attachments.map((attachment) => attachment.path)).toEqual([
      "remise-remise-summary-chromium/scenario.har",
      "remise-remise-summary-chromium/error-context.md",
      "remise-remise-summary-chromium/trace.zip",
    ]);
    // Forme : relatif, sans remontée, sans rien de la machine.
    for (const path of specsOf(report).flatMap((spec) => spec.tests[0]!.results[0]!.attachments.map((attachment) => attachment.path ?? ""))) {
      expect(path).toMatch(/^[\w.-]+(\/[\w.-]+)*$/);
      expect(path).not.toMatch(/(^|\/)\.\.(\/|$)/);
    }
  });

  it("makes every other absolute path relative to the repository root", () => {
    const { report } = collectCase(PROBE);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("/home/");
    expect(serialized).not.toContain(CI_ROOT);
    const config = report.config as unknown as Record<string, unknown>;
    expect(config.configFile).toBe("oracle/playwright.config.ts");
    expect(config.rootDir).toBe("oracle/scenarios");
    expect(config.projects).toMatchObject([{ outputDir: `.oracle-artifacts/${basename(MEASURES.probe.artifacts)}/oracle`, testDir: "oracle/scenarios" }]);
    expect(firstResult(report).errors[0]!.location).toEqual({ file: "oracle/support.ts", column: 14, line: 121 });
    expect(firstResult(report).error!.stack).toContain("at loadSearch (oracle/support.ts:121:14)");
  });

  // argv[0] du vrai rapport : le Node de l'outillage du runner, hors du dépôt.
  it("replaces a path outside the repository with the file name alone", () => {
    expect((REFERENCE.raw.config as unknown as { argv: string[] }).argv[0]).toBe("/opt/hostedtoolcache/node/22.23.5/x64/bin/node");

    const { report } = collectCase(REFERENCE);

    expect((report.config as unknown as { argv: string[] }).argv).toEqual(["node", "node_modules/.bin/playwright", "test", "--config", "oracle/playwright.config.ts"]);
  });

  it("gives the same result from a repository under a macOS home directory", () => {
    const hashes = Object.fromEntries(Object.entries(realHashes(REFERENCE)).map(([path, digest]) => [path.replace(CI_ROOT, MAC_ROOT), digest]));

    expect(collectCase(REFERENCE, onMac(REFERENCE.raw), { root: MAC_ROOT, hashes }).report).toEqual(REFERENCE.oracle);
  });

  it("fails rather than write a path field that climbs above the repository root", () => {
    const raw = variant(REFERENCE.raw, (copy) => (firstSpec(copy).file = "../../shared/remise.spec.ts"));

    expect(() => collectCase(REFERENCE, raw)).toThrow(
      "The oracle result would contain a machine path: a path above the repository root: ../../shared/remise.spec.ts",
    );
  });

  it("keeps ../ in a text that is not a path field (test output)", () => {
    const raw = variant(REFERENCE.raw, (copy) => (firstResult(copy).stdout = [{ text: "read ../../shared/fixture.json\n" }]));

    expect(firstResult(collectCase(REFERENCE, raw).report).stdout).toEqual([{ text: "read ../../shared/fixture.json\n" }]);
  });

  it("fails when an artifact lies outside the execution's artifacts directory", () => {
    const outside = "/tmp/elsewhere/scenario.har";
    const raw = variant(REFERENCE.raw, (copy) => (firstResult(copy).attachments[0]!.path = outside));
    const hashes = { ...realHashes(REFERENCE), [outside]: "0".repeat(64) };

    expect(() => collectCase(REFERENCE, raw, { hashes })).toThrow(`${firstSpec(raw).title}: attachment har lies outside the artifacts directory`);
  });

  it("fails rather than write a home directory path left outside the repository", () => {
    const raw = variant(REFERENCE.raw, (copy) => (firstResult(copy).stdout = [{ text: "cache in /home/someone/.cache/ms-playwright\n" }]));

    expect(() => collectCase(REFERENCE, raw)).toThrow("The oracle result would contain a machine path: /home/");
  });
});

// Oracle non lancé (spec de l'étape 3, « Règles des issues ») : la liste des
// scénarios (`playwright test --list`) n'a aucun résultat. Vraie liste de la
// mesure du candidat au contrat invalide, et le résumé de son measure.json.
describe("summary of an oracle that did not run", () => {
  it("counts every listed scenario as unreached", () => {
    const listed = readJsonFixture<JSONReport>(`${MEASURES.contractInvalid.artifacts}/oracle-list/list.json`);
    const { summary } = readJsonFixture<Measure>(`${MEASURES.contractInvalid.results}/measure.json`).oracle;

    expect(unreachedSummary(listed)).toEqual(summary);
    expect(summary).toEqual({
      scenarios: 38,
      passed: 0,
      failed: 0,
      unreached: 38,
      passRate: 0,
      reachedPassRate: null,
      keyboard: { passed: 0, total: 5 },
    });
  });
});
