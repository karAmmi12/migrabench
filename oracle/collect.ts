// Collecte de l'oracle (fonction pure) : prend le JSON du reporter Playwright,
// les empreintes de ses HAR et traces et le sel, et rend le résultat enrichi
// (spec de l'étape 2, « Résultat JSON »).
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

export interface CollectInput {
  // Empreinte SHA-256 (hexadécimal) de chaque fichier cité par artifactPaths.
  hashes: Readonly<Record<string, string>>;
  salt: string;
}

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

export function collect(report: JSONReport, { hashes, salt }: CollectInput): { report: JSONReport; summary: OracleSummary } {
  const result = structuredClone(report);
  const statuses: { status: ScenarioStatus; keyboard: boolean }[] = [];

  for (const { spec, test } of scenarios(result)) {
    for (const { attachment: name, annotation } of ARTIFACTS) {
      const attachment = lastResult(test).attachments.find((entry) => entry.name === name);
      if (attachment?.path === undefined) throw new Error(`${spec.title}: no ${name} attachment`);
      const digest = hashes[attachment.path];
      if (digest === undefined) throw new Error(`${spec.title}: no digest for ${attachment.path}`);
      test.annotations.push({ type: annotation, description: `sha256:${digest}` });
    }
    statuses.push({ status: statusOf(test), keyboard: spec.tags.includes(KEYBOARD_TAG) });
  }

  const summary = summarize(statuses);
  result.config.metadata = { ...result.config.metadata, salt, summary };
  return { report: result, summary };
}

function statusOf(test: JSONReportTest): ScenarioStatus {
  if (lastResult(test).status === "passed" && test.status === "expected") return "passed";
  const reached = test.annotations.some((annotation) => annotation.type === REACH_ANNOTATION);
  return reached ? "failed" : "unreached";
}

function summarize(statuses: { status: ScenarioStatus; keyboard: boolean }[]): OracleSummary {
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

// Un scénario = une spec exécutée par l'unique projet (Chromium seul).
function scenarios(report: JSONReport): { spec: JSONReportSpec; test: JSONReportTest }[] {
  const walk = (suite: JSONReportSuite): { spec: JSONReportSpec; test: JSONReportTest }[] => [
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
