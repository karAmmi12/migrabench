// Contrôle d'un résultat de l'oracle déjà écrit (#53) : la collecte refuse un
// résultat invalide au moment de l'écrire, ce contrôle refuse un résultat
// versionné écrit par une version antérieure de la collecte, modifié à la
// main ou produit sous un mauvais Node. C'est l'unique définition d'un
// résultat valide : la vérification de la preuve (proof.ts) la reprend, le
// contrôle des résultats d'étalonnage (#72) en reprend les règles, sauf le sel,
// et le contrôle des mesures prévues pour compter (#73) les reprend toutes.

import { describeMachinePath, machinePathsIn } from "./collect.ts";

// Ce que le contrôle lit d'un résultat de l'oracle.
export interface CheckedResult {
  config?: { metadata?: Record<string, unknown> };
}

export interface ResultEnvironment {
  // Version de Node de .nvmrc, avec ou sans « v ».
  node: string;
  // Vrai si le commit (SHA complet) est un objet du dépôt local.
  commitExists: (sha: string) => boolean;
}

export type ResultRule = "worktree" | "node" | "saltImposed" | "benchCommit" | "machine-path" | "counted" | "originMain" | "oracle";

// Environnement du contrôle d'une mesure : l'historique, en plus.
export interface MeasureEnvironment extends ResultEnvironment {
  // Vrai si `ancestor` est `descendant` ou l'un de ses ancêtres.
  isAncestor: (ancestor: string, descendant: string) => boolean;
}

export interface Violation {
  rule: ResultRule;
  detail: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/;

// Manquements d'un résultat, vide s'il est valide.
export function checkResult(result: CheckedResult, environment: ResultEnvironment): Violation[] {
  return checkRecorded(result, result.config?.metadata ?? {}, environment, { salt: true });
}

// Manquements d'un résultat d'étalonnage versionné dans results/calibration/,
// vide s'il est valide : son environnement est dans `environment`, et
// l'étalonnage ne tire pas de sel.
export function checkCalibrationResult(result: unknown, environment: ResultEnvironment): Violation[] {
  const recorded = (result as { environment?: Record<string, unknown> } | null)?.environment ?? {};
  return checkRecorded(result, recorded, environment, { salt: false });
}

// Manquements d'une mesure versionnée dans results/counted/, vide si elle est
// valide. `oracleDigest` : empreinte citée (`sha256:…`) du oracle.json de son
// dossier, ou undefined s'il n'y en a pas.
export function checkMeasureResult(measure: unknown, oracleDigest: string | undefined, environment: MeasureEnvironment): Violation[] {
  const record = (measure ?? {}) as { counted?: unknown; originMain?: unknown; saltImposed?: unknown; environment?: Record<string, unknown>; oracle?: { executed?: unknown; result?: unknown } };
  const metadata: Record<string, unknown> = { ...record.environment, ...("saltImposed" in record ? { saltImposed: record.saltImposed } : {}) };
  const violations = checkRecorded(measure, metadata, environment, { salt: true });
  const violate = (rule: ResultRule, detail: string) => violations.push({ rule, detail });

  if (record.counted !== true) violate("counted", `${JSON.stringify(record.counted) ?? "missing"}, expected true`);
  const { originMain } = record;
  const { benchCommit } = metadata;
  if (typeof originMain !== "string" || !FULL_SHA.test(originMain)) {
    violate("originMain", `${JSON.stringify(originMain) ?? "missing"} is not a full commit SHA`);
  } else if (!environment.commitExists(originMain)) {
    violate("originMain", `${originMain} is not a commit of this repository`);
  } else if (typeof benchCommit === "string" && environment.commitExists(benchCommit) && !environment.isAncestor(benchCommit, originMain)) {
    violate("benchCommit", `${benchCommit} is neither originMain ${originMain} nor one of its ancestors`);
  }

  const executed = record.oracle?.executed === true;
  if (executed && oracleDigest === undefined) violate("oracle", "oracle.json is missing, although the oracle ran");
  else if (executed && record.oracle?.result !== oracleDigest) {
    violate("oracle", `oracle.json has digest ${oracleDigest}, the measure cites ${JSON.stringify(record.oracle?.result)}`);
  } else if (!executed && oracleDigest !== undefined) violate("oracle", "oracle.json is present, although the oracle did not run");
  return violations;
}

// Règles communes : `metadata` porte l'état où le résultat a été obtenu,
// `result` est cherché en entier pour les chemins machine.
function checkRecorded(result: unknown, metadata: Record<string, unknown>, environment: ResultEnvironment, { salt }: { salt: boolean }): Violation[] {
  const violations: Violation[] = [];
  const violate = (rule: ResultRule, detail: string) => violations.push({ rule, detail });

  if (metadata.worktree !== "clean") violate("worktree", `${JSON.stringify(metadata.worktree)}, expected "clean"`);
  const node = `v${environment.node.replace(/^v/, "")}`;
  if (metadata.node !== node) violate("node", `${JSON.stringify(metadata.node)}, expected "${node}" (.nvmrc)`);
  if (salt && metadata.saltImposed !== false) {
    violate("saltImposed", `${"saltImposed" in metadata ? JSON.stringify(metadata.saltImposed) : "missing"}, expected false`);
  }
  const { benchCommit } = metadata;
  if (typeof benchCommit !== "string" || !FULL_SHA.test(benchCommit)) {
    violate("benchCommit", `${JSON.stringify(benchCommit)} is not a full commit SHA`);
  } else if (!environment.commitExists(benchCommit)) {
    violate("benchCommit", `${benchCommit} is not a commit of this repository`);
  }
  for (const machinePath of machinePathsIn(result)) violate("machine-path", `contains ${describeMachinePath(machinePath)}`);
  return violations;
}

// Message d'échec : le fichier et la règle violée.
export function formatViolation(file: string, { rule, detail }: Violation): string {
  return `${file}: rule ${rule}: ${detail}`;
}
