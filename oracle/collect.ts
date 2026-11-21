// Collecte de l'oracle (fonction pure) : prend le JSON du reporter Playwright,
// les empreintes de ses HAR et traces et le sel, et rend le résultat enrichi
// (spec de l'étape 2, « Résultat JSON »). Le résultat est versionné : aucun
// chemin absolu de la machine qui l'a produit n'y reste.
import { isAbsolute, relative } from "node:path";
import type { JSONReport, JSONReportSpec, JSONReportSuite, JSONReportTest } from "@playwright/test/reporter";

export const REACH_ANNOTATION = "mb:reach";
export const KEYBOARD_TAG = "clavier";

// Pièces jointes que chaque scénario doit porter, et annotation qui cite leur empreinte.
const ARTIFACTS = [
  { attachment: "har", annotation: "mb:har" },
  { attachment: "trace", annotation: "mb:trace" },
] as const;

export type ScenarioStatus = "passed" | "failed" | "unreached";

export interface OracleSummary {
  scenarios: number;
  passed: number;
  failed: number;
  unreached: number;
  // Réussis sur tous les scénarios.
  passRate: number | null;
  // Réussis sur les scénarios atteints (réussis et échoués) ; null si aucun n'est atteint.
  reachedPassRate: number | null;
  keyboard: { passed: number; total: number };
}

// Un scénario : une spec, exécutée par l'unique projet (Chromium seul).
interface Scenario {
  spec: JSONReportSpec;
  test: JSONReportTest;
}

interface ScenarioOutcome {
  status: ScenarioStatus;
  keyboard: boolean;
}

export interface CollectInput {
  // Empreinte SHA-256 (hexadécimal) de chaque fichier cité par artifactPaths.
  hashes: Readonly<Record<string, string>>;
  salt: string;
  // Racine du dépôt, à laquelle les chemins du résultat sont rapportés.
  root: string;
  // Dossier des bruts de l'exécution (.oracle-artifacts/<identifiant>), auquel
  // les pièces jointes (traces, HAR) sont rapportées.
  artifactsDir: string;
}

// Champs du JSON Playwright qui contiennent un chemin de fichier, ou une liste
// de chemins (argv : binaire de Node et de Playwright).
const PATH_KEYS = new Set(["path", "file", "configFile", "rootDir", "outputDir", "testDir", "snapshotDir", "argv"]);

// Débuts de chemin qui trahiraient un répertoire personnel (macOS, Linux).
const HOME_PREFIXES = ["/Users/", "/home/"];

// Fichiers à hacher avant la collecte : HAR et trace de chaque scénario.
export function artifactPaths(report: JSONReport): string[] {
  return scenarios(report).flatMap(({ test }) =>
    lastResult(test).attachments.flatMap((attachment) =>
      ARTIFACTS.some(({ attachment: name }) => name === attachment.name) && attachment.path !== undefined
        ? [attachment.path]
        : [],
    ),
  );
}

export function collect(report: JSONReport, { hashes, salt, root, artifactsDir }: CollectInput): { report: JSONReport; summary: OracleSummary } {
  const result = structuredClone(report);
  const statuses: ScenarioOutcome[] = [];

  for (const { spec, test } of scenarios(result)) {
    for (const { attachment: name, annotation } of ARTIFACTS) {
      const attachment = lastResult(test).attachments.find((entry) => entry.name === name);
      if (attachment?.path === undefined) throw new Error(`${spec.title}: no ${name} attachment`);
      const digest = hashes[attachment.path];
      if (digest === undefined) throw new Error(`${spec.title}: no digest for ${attachment.path}`);
      test.annotations.push({ type: annotation, description: `sha256:${digest}` });
    }
    statuses.push({ status: statusOf(test), keyboard: spec.tags.includes(KEYBOARD_TAG) });
    for (const testResult of test.results) {
      for (const attachment of testResult.attachments) {
        if (attachment.path === undefined) continue;
        const cited = relative(artifactsDir, attachment.path);
        if (cited === "" || cited.startsWith("..") || isAbsolute(cited)) {
          throw new Error(`${spec.title}: attachment ${attachment.name} lies outside the artifacts directory`);
        }
        attachment.path = cited;
      }
    }
  }

  const summary = summarize(statuses);
  result.config.metadata = { ...result.config.metadata, salt, summary };
  const relativeResult = relativizePaths(result, root) as JSONReport;
  const serialized = JSON.stringify(relativeResult);
  const home = HOME_PREFIXES.find((prefix) => serialized.includes(prefix));
  if (home !== undefined) throw new Error(`The oracle result would contain a home directory path (${home})`);
  return { report: relativeResult, summary };
}

// Un champ de chemin absolu devient relatif à la racine ; dans tout autre texte
// (messages, piles d'appels, sorties), la racine est retirée là où elle apparaît.
function relativizePaths(value: unknown, root: string, key?: string): unknown {
  if (typeof value === "string") {
    if (key !== undefined && PATH_KEYS.has(key) && isAbsolute(value)) return relative(root, value) || ".";
    return value.replaceAll(`${root}/`, "").replaceAll(root, ".");
  }
  // Les éléments d'une liste héritent de son champ.
  if (Array.isArray(value)) return value.map((item) => relativizePaths(item, root, key));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entry]) => [entryKey, relativizePaths(entry, root, entryKey)]),
    );
  }
  return value;
}

function statusOf(test: JSONReportTest): ScenarioStatus {
  if (lastResult(test).status === "passed" && test.status === "expected") return "passed";
  // Annotation posée pendant le scénario : selon la version de Playwright, elle
  // figure dans les annotations du test, du résultat, ou des deux.
  const reached = [...test.annotations, ...lastResult(test).annotations].some(
    (annotation) => annotation.type === REACH_ANNOTATION,
  );
  return reached ? "failed" : "unreached";
}

function summarize(statuses: ScenarioOutcome[]): OracleSummary {
  const count = (status: ScenarioStatus) => statuses.filter((entry) => entry.status === status).length;
  const passed = count("passed");
  const failed = count("failed");
  const keyboard = statuses.filter((entry) => entry.keyboard);
  return {
    scenarios: statuses.length,
    passed,
    failed,
    unreached: count("unreached"),
    passRate: statuses.length === 0 ? null : passed / statuses.length,
    reachedPassRate: passed + failed === 0 ? null : passed / (passed + failed),
    keyboard: { passed: keyboard.filter((entry) => entry.status === "passed").length, total: keyboard.length },
  };
}

function scenarios(report: JSONReport): Scenario[] {
  const walk = (suite: JSONReportSuite): Scenario[] => [
    ...suite.specs.flatMap((spec) => spec.tests.map((test) => ({ spec, test }))),
    ...(suite.suites ?? []).flatMap(walk),
  ];
  return report.suites.flatMap(walk);
}

// Aucune relance (retries: 0) : le dernier résultat est le seul.
function lastResult(test: JSONReportTest) {
  const result = test.results.at(-1);
  if (result === undefined) throw new Error(`test of project ${test.projectName} has no result`);
  return result;
}
