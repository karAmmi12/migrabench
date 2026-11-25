// Mesures du job de CI des mesures (#74) et issue attendue de chacune : le
// candidat de référence (mesure comptée sur `main`, de diagnostic sur une PR),
// les huit candidats défectueux du tableau de la spec de l'étape 3
// (« Candidats défectueux »), les pannes de la pile prouvées à la main par #68
// et la mesure interrompue de #71. `caseProblems` est pur : il compare le code
// de sortie, measure.json et oracle.json à l'issue attendue, et rend les
// écarts, vides quand la mesure est celle attendue.

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
  // Mesure prévue pour compter : `counted`, arbre propre, origin/main connu.
  counted?: boolean;
}

const REFERENCE = "fixtures/reference-candidate";
const DEFECTIVE = "fixtures/defective-candidates";
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
  },
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
  environment?: { worktree?: unknown; originMain?: unknown };
  phases?: { name: string; outcome: string; detail?: string }[];
  oracle?: { executed?: unknown; summary?: Record<string, unknown> };
  accessLog?: { witnesses?: { name: string }[] };
  verdict?: { category?: unknown; reason?: unknown; evidence?: unknown };
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
    if (typeof measure.environment?.originMain !== "string" || measure.environment.originMain === "") problems.push("environment.originMain is missing");
  }
  return problems;
}
