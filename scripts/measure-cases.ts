// Mesures du job de CI des mesures (#74) et issue attendue de chacune : le
// candidat de référence (mesure comptée sur `main`, de diagnostic sur une PR),
// les huit candidats défectueux du tableau de la spec de l'étape 3
// (« Candidats défectueux »), les pannes de la pile prouvées à la main par #68
// et la mesure interrompue de #71. `caseProblems` est pur : il compare le code
// de sortie, measure.json et oracle.json à l'issue attendue, et rend les
// écarts, vides quand la mesure est celle attendue.

import { IMPACTS, SCREENS } from "../gates/accessibility.ts";
import type { GateOutcome } from "../gates/result.ts";

export interface MeasureCase {
  // Dossier passé à `--candidate`.
  candidate: string;
  // Options de `migrabench measure` après `--candidate`.
  args?: string[];
  // Variables ajoutées à l'environnement de la mesure.
  env?: Record<string, string>;
  exitCode: 0 | 3;
  category: string;
  reason: string;
  // Preuve exacte du verdict, pour une mesure invalide.
  evidence?: string;
  // Issue attendue de chaque phase nommée ; les autres ne sont pas regardées.
  phases?: Record<string, string>;
  // Textes que le détail d'une phase doit citer.
  detailCites?: { phase: string; texts: string[] };
  oracleExecuted?: boolean;
  // oracle.json gardé dans le dossier de la mesure, ou absent.
  oracleJson: "kept" | "absent";
  // Scénarios : nombre exact, ou au moins un.
  summary?: { passed?: number; failed?: number | "at-least-one"; unreached?: number };
  // Requêtes témoins de début et de fin dans le journal d'accès.
  witnesses?: boolean;
  // Requêtes témoins de début attendues, exactement et dans l'ordre : une par
  // démarrage du candidat, redémarrages du legacy par une porte compris (#131).
  startWitnesses?: string[];
  // Mesure prévue pour compter : `counted`, arbre propre, origin/main connu.
  counted?: boolean;
  // Résultats de portes attendus (#124) : leur issue, et un texte qu'un de
  // leurs constats doit citer.
  gates?: { gate: string; name: string; outcome: GateOutcome; findingCites?: string }[];
}

const REFERENCE = "fixtures/reference-candidate";
const DEFECTIVE = "fixtures/defective-candidates";
const CONFORMING = "fixtures/conforming-candidates";
// Porte du relais (#124).
const RELAY = { gate: "relay", name: "legacy-port-untouched" };
// Porte d'accessibilité (#128) : ses résultats nommés, par écran et par gravité.
const accessibility = (outcomes: { tables: GateOutcome; axe: Record<(typeof IMPACTS)[number], GateOutcome> }) => [
  ...SCREENS.flatMap((screen) => [
    { gate: "accessibility", name: `tables-count/${screen}`, outcome: outcomes.tables },
    { gate: "accessibility", name: `tables-nested/${screen}`, outcome: outcomes.tables },
  ]),
  ...Object.entries(outcomes.axe).map(([impact, outcome]) => ({ gate: "accessibility", name: `axe/${impact}`, outcome })),
];
// Porte de la valeur témoin (#130).
const WITNESS_VALUE = { gate: "witness-value", name: "absent-from-har" };
// Porte XSS (#129) : ses six résultats nommés, réussis sauf ceux donnés.
type XssName = `${"executed" | "as-text"}/${(typeof SCREENS)[number]}`;
const xss = (outcomes: Partial<Record<XssName, GateOutcome>> = {}, others: GateOutcome = "passed") =>
  SCREENS.flatMap((screen) => (["executed", "as-text"] as const).map((check) => {
    const name: XssName = `${check}/${screen}`;
    return { gate: "xss", name, outcome: outcomes[name] ?? others };
  }));
// Porte Lighthouse (#134) : relevée, sans seuil.
const LIGHTHOUSE = { gate: "lighthouse", name: "performance" };
// Un candidat sans écran : aucune passe n'aboutit.
const LIGHTHOUSE_NOT_EVALUABLE = { ...LIGHTHOUSE, outcome: "not-evaluable" as const };
// Le legacy rend la charge en HTML sur la recherche : il échoue à ses deux
// résultats (décision de Karim, #129), et passe la fiche et la remise.
const XSS_LEGACY = xss({ "executed/search": "failed", "as-text/search": "failed" });
// Porte de rôle (#131) : ses trois résultats nommés, réussis sauf ceux donnés.
type RoleName = "role-replay-control" | "role-replay" | "role-forced-browsing";
const role = (outcomes: Partial<Record<RoleName, GateOutcome>> = {}, others: GateOutcome = "passed") =>
  (["role-replay-control", "role-replay", "role-forced-browsing"] as const).map((name) => ({ gate: "role-check", name, outcome: outcomes[name] ?? others }));
// Le legacy : l'agent remet le dossier par le rejeu, mais ne voit aucun
// bouton « Remettre ».
const ROLE_LEGACY = role({ "role-replay": "failed" });
// La remise enregistrée, puis trois redémarrages du legacy, chacun avec sa
// requête témoin.
const ROLE_RESTARTS = ["start-1", "start-2", "start-3", "start-4"];
// Candidats XSS : des relais du legacy qui ne réécrivent que les pages
// porteuses de la charge. L'oracle n'y regarde pas : 38 scénarios réussis.
// Comme le legacy, ils laissent passer la valeur témoin.
const xssCase = (candidate: string, gates: MeasureCase["gates"]): MeasureCase => ({
  candidate,
  exitCode: 0,
  category: "completed",
  reason: "ok",
  oracleExecuted: true,
  oracleJson: "kept",
  summary: { passed: 38, failed: 0, unreached: 0 },
  witnesses: true,
  gates: [{ ...WITNESS_VALUE, outcome: "failed" }, ...(gates ?? []), ...ROLE_LEGACY, { ...RELAY, outcome: "failed" }],
});
// Candidats de la porte de rôle : des relais du legacy qui ne changent que la
// fiche, la remise et la requête de remise. Comme le legacy, ils échouent à la
// valeur témoin, à XSS sur la recherche et au relais.
const roleCase = (candidate: string, gates: MeasureCase["gates"], summary: MeasureCase["summary"] = { passed: 38, failed: 0, unreached: 0 }): MeasureCase => ({
  candidate,
  exitCode: 0,
  category: "completed",
  reason: "ok",
  phases: { gates: "ok", closing: "ok" },
  oracleExecuted: true,
  oracleJson: "kept",
  summary,
  witnesses: true,
  startWitnesses: ROLE_RESTARTS,
  gates: [{ ...WITNESS_VALUE, outcome: "failed" }, ...XSS_LEGACY, ...(gates ?? []), { ...RELAY, outcome: "failed" }],
});
// Candidat qui n'affiche aucun écran : rien d'examiné.
const ACCESSIBILITY_NOT_EVALUABLE = accessibility({ tables: "not-evaluable", axe: { critical: "not-evaluable", serious: "not-evaluable", moderate: "not-evaluable", minor: "not-evaluable" } });
const NOT_RUN = "not-run";
const AFTER_CONTRACT_NOT_RUN = { build: NOT_RUN, start: NOT_RUN, oracle: NOT_RUN, gates: NOT_RUN };

// Le candidat de référence obtient 100 % (critère de fin de l'étape 3).
const reference: MeasureCase = {
  candidate: REFERENCE,
  exitCode: 0,
  category: "completed",
  reason: "ok",
  phases: { preparation: "ok", contract: "ok", build: "ok", start: "ok", oracle: "ok", gates: "ok", closing: "ok" },
  oracleExecuted: true,
  oracleJson: "kept",
  summary: { passed: 38, failed: 0, unreached: 0 },
  witnesses: true,
  startWitnesses: ROLE_RESTARTS,
  // Le relais appelle le port 8080 du legacy : le test négatif de la porte.
  // Le legacy échoue aux tableaux sur chaque écran, et axe y relève une
  // violation critique (`image-alt`) et une sérieuse (`html-has-lang`). Le
  // lien « Accusé de remise » porte la valeur témoin. Lighthouse relève
  // l'écran d'arrivée du legacy.
  gates: [
    { ...WITNESS_VALUE, outcome: "failed", findingCites: "accuse-de-remise" },
    ...accessibility({ tables: "failed", axe: { critical: "failed", serious: "failed", moderate: "passed", minor: "passed" } }),
    ...XSS_LEGACY,
    { ...LIGHTHOUSE, outcome: "measured" },
    ...ROLE_LEGACY,
    { ...RELAY, outcome: "failed" },
  ],
};

export const MEASURE_CASES = {
  reference,
  "reference-counted": { ...reference, args: ["--counted"], counted: true },
  // 1 : `url` refusée et dépendance résolue sur un autre hôte, les deux citées.
  "contract-invalid": {
    candidate: `${DEFECTIVE}/contract-invalid`,
    exitCode: 0,
    category: "contract-failure",
    reason: "contract-invalid",
    phases: { contract: "contract-invalid", ...AFTER_CONTRACT_NOT_RUN },
    detailCites: { phase: "contract", texts: ['field "url" is not allowed', "is resolved on another host"] },
    oracleJson: "absent",
  },
  // 2
  "build-fails": { candidate: `${DEFECTIVE}/build-fails`, exitCode: 0, category: "candidate-failure", reason: "build-failed", phases: { build: "build-failed", start: NOT_RUN }, oracleJson: "absent" },
  // 3 : plafond des délais imposé en CI, pour ne pas attendre tout le délai de
  // construction (spec, « Plafond des délais imposé »).
  "build-never-ends": {
    candidate: `${DEFECTIVE}/build-never-ends`,
    args: ["--timeout-cap-ms", "20000"],
    exitCode: 0,
    category: "candidate-failure",
    reason: "build-timeout",
    phases: { build: "build-timeout", start: NOT_RUN },
    oracleJson: "absent",
  },
  // 4
  "never-ready": {
    candidate: `${DEFECTIVE}/never-ready`,
    exitCode: 0,
    category: "candidate-failure",
    reason: "start-not-ready",
    phases: { start: "start-not-ready", oracle: NOT_RUN },
    oracleExecuted: false,
    oracleJson: "absent",
  },
  // 5 : le constat de la sonde est vérifié à part (start-report:check -- probe).
  "isolation-probe": { candidate: `${DEFECTIVE}/isolation-probe`, exitCode: 0, category: "completed", reason: "ok", oracleExecuted: true, oracleJson: "kept" },
  // 6
  "relay-alters-label": {
    candidate: `${DEFECTIVE}/relay-alters-label`,
    exitCode: 0,
    category: "completed",
    reason: "ok",
    oracleExecuted: true,
    oracleJson: "kept",
    summary: { failed: "at-least-one" },
    // Il relaie le lien « Accusé de remise » du legacy.
    gates: [{ ...WITNESS_VALUE, outcome: "failed" }, { ...RELAY, outcome: "failed" }],
  },
  // #124 : candidat qui appelle le port 8080 avec le User-Agent du healthcheck.
  "relay-forged-healthcheck": {
    candidate: `${DEFECTIVE}/relay-forged-healthcheck`,
    exitCode: 0,
    category: "completed",
    reason: "ok",
    oracleExecuted: true,
    oracleJson: "kept",
    witnesses: true,
    gates: [{ ...WITNESS_VALUE, outcome: "passed" }, ...ACCESSIBILITY_NOT_EVALUABLE, ...xss({}, "not-evaluable"), LIGHTHOUSE_NOT_EVALUABLE, ...role({}, "not-evaluable"), { ...RELAY, outcome: "failed", findingCites: '"curl/8.18.0"' }],
  },
  // #124 : candidat conforme, qui ne touche jamais le port 8080.
  "relay-untouched": {
    candidate: `${CONFORMING}/relay-untouched`,
    exitCode: 0,
    category: "completed",
    reason: "ok",
    oracleExecuted: true,
    oracleJson: "kept",
    witnesses: true,
    gates: [{ ...WITNESS_VALUE, outcome: "passed" }, ...ACCESSIBILITY_NOT_EVALUABLE, ...xss({}, "not-evaluable"), LIGHTHOUSE_NOT_EVALUABLE, ...role({}, "not-evaluable"), { ...RELAY, outcome: "passed" }],
  },
  // #129 : candidat conforme, qui échappe partout.
  "xss-escapes": xssCase(`${CONFORMING}/xss-escapes`, xss()),
  // #129 : candidat qui assainit la recherche au lieu de l'échapper.
  "xss-sanitizes": xssCase(`${DEFECTIVE}/xss-sanitizes`, xss({ "as-text/search": "failed" })),
  // #129 : candidat qui injecte sur la fiche après une requête, témoin de l'attente.
  "xss-injects-on-sheet": xssCase(`${DEFECTIVE}/xss-injects-on-sheet`, xss({ "executed/sheet": "failed" })),
  // #129 : candidat qui exécute la charge sur la recherche, puis efface
  // `window.__mbXss` ; l'écriture de `undefined` reste signalée.
  "xss-executes-then-erases": xssCase(`${DEFECTIVE}/xss-executes-then-erases`, [
    ...xss({ "as-text/search": "failed" }).filter(({ name }) => name !== "executed/search"),
    { gate: "xss", name: "executed/search", outcome: "failed", findingCites: "undefined" },
  ]),
  // #131 : bouton masqué dans la vue, sans contrôle de rôle.
  "role-button-hidden-in-view": roleCase(`${DEFECTIVE}/role-button-hidden-in-view`, role({ "role-replay": "failed" })),
  // #131 : écran de remise protégé seulement par son lien. Sans le lien,
  // l'agent n'atteint pas cinq scénarios de l'oracle (exécution 46001662192,
  // commit f9510e8 : 33 réussis, 5 non atteints).
  "role-screen-protected-by-link": roleCase(`${DEFECTIVE}/role-screen-protected-by-link`, role({ "role-replay": "failed", "role-forced-browsing": "failed" }), { passed: 33, failed: 0, unreached: 5 }),
  // #131 : jeton anti-CSRF sans contrôle de rôle.
  "role-csrf-without-role-check": roleCase(`${DEFECTIVE}/role-csrf-without-role-check`, role({ "role-replay": "failed" })),
  // #131 : candidat conforme, jeton anti-CSRF et contrôle de rôle.
  "role-csrf-and-role-check": roleCase(`${CONFORMING}/role-csrf-and-role-check`, role()),
  // 7 : le legacy ne devient jamais sain.
  "broken-stack": {
    candidate: REFERENCE,
    env: { COMPOSE_FILE: "docker-compose.yml:tests/fixtures/broken-stack/legacy-never-healthy.compose.yml" },
    exitCode: 3,
    category: "invalid",
    reason: "stack-failed-before-candidate",
    phases: { start: "stack-failed-before-candidate", oracle: NOT_RUN },
    oracleExecuted: false,
    oracleJson: "absent",
  },
  // 8 : images de la pile construites avec une empreinte de contexte étrangère
  // (préparé par le job avant la mesure).
  "foreign-stack": {
    candidate: REFERENCE,
    exitCode: 3,
    category: "invalid",
    reason: "stack-not-from-this-copy",
    phases: { preparation: "stack-not-from-this-copy", contract: NOT_RUN, ...AFTER_CONTRACT_NOT_RUN },
    oracleExecuted: false,
    oracleJson: "absent",
  },
  // #68 : legacy arrêté pendant l'oracle ; le résultat de l'oracle est gardé.
  // Hors du job de CI (#74) : sur le runner, ses 38 scénarios attendent chacun
  // 30 s avec un seul worker. Lancé à la main.
  "legacy-stopped-during-oracle": {
    candidate: REFERENCE,
    exitCode: 0,
    category: "stack-down-while-candidate",
    reason: "stack-down-while-candidate",
    phases: { oracle: "stack-down-while-candidate" },
    oracleExecuted: true,
    oracleJson: "kept",
  },
  // #68 : configuration de Playwright cassée (préparé par le job).
  "oracle-config-broken": {
    candidate: REFERENCE,
    exitCode: 3,
    category: "invalid",
    reason: "oracle-error",
    phases: { oracle: "oracle-error", gates: NOT_RUN },
    oracleExecuted: false,
    oracleJson: "absent",
  },
  // #71 : SIGINT pendant l'oracle.
  interrupted: {
    candidate: REFERENCE,
    exitCode: 3,
    category: "invalid",
    reason: "interrupted",
    evidence: "Interrupted by SIGINT",
    phases: { preparation: "ok", contract: "ok", build: "ok", start: "ok", oracle: "interrupted", gates: NOT_RUN, closing: "ok" },
    oracleExecuted: false,
    oracleJson: "absent",
  },
} satisfies Record<string, MeasureCase>;

export type MeasureCaseName = keyof typeof MEASURE_CASES;

export function isMeasureCaseName(name: string): name is MeasureCaseName {
  return Object.hasOwn(MEASURE_CASES, name);
}

// Ce que la mesure a rendu : son code de sortie, son measure.json, et son
// oracle.json s'il existe (son sel dans config.metadata, comme tout résultat
// de l'oracle).
export interface Observed {
  exitCode: number;
  record: object;
  oracle: object | undefined;
}

// Lecture tolérante de measure.json : un champ absent est un écart, pas une exception.
interface MeasureView {
  counted?: unknown;
  saltImposed?: unknown;
  // À la racine, comme le lit oracle/result-check.ts : pas sous environment.
  originMain?: unknown;
  environment?: { worktree?: unknown };
  phases?: { name: string; outcome: string; detail?: string }[];
  oracle?: { executed?: unknown; summary?: Record<string, unknown> };
  accessLog?: { witnesses?: { name: string }[] };
  verdict?: { category?: unknown; reason?: unknown; evidence?: unknown };
  gates?: { gate?: unknown; name?: unknown; outcome?: unknown; findings?: unknown[] }[];
}

// Un constat cite-t-il le texte, dans l'une de ses valeurs ? Il est cherché
// tel qu'il est écrit dans le JSON du constat, guillemets échappés compris.
function citesText(finding: unknown, text: string): boolean {
  const escaped = JSON.stringify(text).slice(1, -1);
  return JSON.stringify(finding).includes(escaped);
}

export function caseProblems(expected: MeasureCase, { exitCode, record, oracle }: Observed): string[] {
  const measure = record as MeasureView;
  const problems: string[] = [];
  if (exitCode !== expected.exitCode) problems.push(`exit code is ${exitCode}, expected ${expected.exitCode}`);

  const { category, reason, evidence } = measure.verdict ?? {};
  if (category !== expected.category || reason !== expected.reason) {
    problems.push(`verdict is ${String(category)} (${String(reason)}), expected ${expected.category} (${expected.reason})`);
  }
  if (expected.evidence !== undefined && evidence !== expected.evidence) {
    problems.push(`verdict.evidence is ${JSON.stringify(evidence)}, expected ${JSON.stringify(expected.evidence)}`);
  }

  const phases = measure.phases ?? [];
  for (const [name, outcome] of Object.entries(expected.phases ?? {})) {
    const found = phases.find((phase) => phase.name === name);
    if (found === undefined) problems.push(`phase ${name} is missing`);
    else if (found.outcome !== outcome) problems.push(`phase ${name} is ${found.outcome}, expected ${outcome}`);
  }
  if (expected.detailCites !== undefined) {
    const { phase, texts } = expected.detailCites;
    const detail = phases.find((entry) => entry.name === phase)?.detail ?? "";
    for (const text of texts) if (!detail.includes(text)) problems.push(`phase ${phase}: detail does not cite ${JSON.stringify(text)}`);
  }

  if (expected.oracleExecuted !== undefined && measure.oracle?.executed !== expected.oracleExecuted) {
    problems.push(`oracle.executed is ${String(measure.oracle?.executed)}, expected ${expected.oracleExecuted}`);
  }
  for (const [field, wanted] of Object.entries(expected.summary ?? {})) {
    const actual = measure.oracle?.summary?.[field];
    if (wanted === "at-least-one") {
      if (typeof actual !== "number" || actual < 1) problems.push(`oracle.summary.${field} is ${String(actual)}, expected at least 1`);
    } else if (actual !== wanted) {
      problems.push(`oracle.summary.${field} is ${String(actual)}, expected ${wanted}`);
    }
  }

  if (expected.witnesses === true) {
    const names = (measure.accessLog?.witnesses ?? []).map(({ name }) => name);
    if (!names.some((name) => name.startsWith("start"))) problems.push("accessLog.witnesses has no start witness");
    if (!names.includes("end")) problems.push("accessLog.witnesses has no end witness");
  }

  if (expected.startWitnesses !== undefined) {
    const starts = (measure.accessLog?.witnesses ?? []).map(({ name }) => name).filter((name) => name.startsWith("start"));
    if (starts.join(", ") !== expected.startWitnesses.join(", ")) problems.push(`accessLog.witnesses starts with ${starts.join(", ")}, expected ${expected.startWitnesses.join(", ")}`);
  }

  for (const { gate, name, outcome, findingCites } of expected.gates ?? []) {
    const found = (measure.gates ?? []).find((result) => result.gate === gate && result.name === name);
    if (found === undefined) problems.push(`gate ${gate}/${name} is missing`);
    else {
      if (found.outcome !== outcome) problems.push(`gate ${gate}/${name} is ${String(found.outcome)}, expected ${outcome}`);
      if (findingCites !== undefined && !(found.findings ?? []).some((finding) => citesText(finding, findingCites))) {
        problems.push(`gate ${gate}/${name}: no finding cites ${findingCites}`);
      }
    }
  }

  // Ni ORACLE_SALT ni ARCHIVE_SALT dans le job : le sel est toujours tiré, et
  // les deux fichiers le disent (#73, 71d8c18).
  if (measure.saltImposed !== false) problems.push(`measure.json: saltImposed is ${String(measure.saltImposed)}, expected false`);
  if (expected.oracleJson === "kept") {
    if (oracle === undefined) problems.push("oracle.json is missing");
    else {
      const oracleSalt = (oracle as { config?: { metadata?: { saltImposed?: unknown } } }).config?.metadata?.saltImposed;
      if (oracleSalt !== false) problems.push(`oracle.json: config.metadata.saltImposed is ${String(oracleSalt)}, expected false`);
    }
  } else if (oracle !== undefined) {
    problems.push("oracle.json is present, expected absent");
  }

  if (expected.counted === true) {
    if (measure.counted !== true) problems.push(`counted is ${String(measure.counted)}, expected true`);
    if (measure.environment?.worktree !== "clean") problems.push(`environment.worktree is ${String(measure.environment?.worktree)}, expected clean`);
    if (typeof measure.originMain !== "string" || measure.originMain === "") problems.push("originMain is missing");
  }
  return problems;
}
