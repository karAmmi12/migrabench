// Contrôle d'un résultat de l'oracle déjà écrit (#53) : la collecte refuse un
// résultat invalide au moment de l'écrire, ce contrôle refuse un résultat
// versionné écrit par une version antérieure de la collecte, modifié à la
// main ou produit sous un mauvais Node. C'est l'unique définition d'un
// résultat valide : la vérification de la preuve (proof.ts) la reprend.

import { describeMachinePath, machinePathIn } from "./collect.ts";

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

export type ResultRule = "worktree" | "node" | "saltImposed" | "benchCommit" | "machine-path";

export interface Violation {
  rule: ResultRule;
  detail: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/;

// Manquements d'un résultat, vide s'il est valide.
export function checkResult(result: CheckedResult, environment: ResultEnvironment): Violation[] {
  const metadata = result.config?.metadata ?? {};
  const violations: Violation[] = [];
  const violate = (rule: ResultRule, detail: string) => violations.push({ rule, detail });

  if (metadata.worktree !== "clean") violate("worktree", `${JSON.stringify(metadata.worktree)}, expected "clean"`);
  const node = `v${environment.node.replace(/^v/, "")}`;
  if (metadata.node !== node) violate("node", `${JSON.stringify(metadata.node)}, expected "${node}" (.nvmrc)`);
  if (metadata.saltImposed !== false) {
    violate("saltImposed", `${"saltImposed" in metadata ? JSON.stringify(metadata.saltImposed) : "missing"}, expected false`);
  }
  const { benchCommit } = metadata;
  if (typeof benchCommit !== "string" || !FULL_SHA.test(benchCommit)) {
    violate("benchCommit", `${JSON.stringify(benchCommit)} is not a full commit SHA`);
  } else if (!environment.commitExists(benchCommit)) {
    violate("benchCommit", `${benchCommit} is not a commit of this repository`);
  }
  const machinePath = machinePathIn(JSON.stringify(result));
  if (machinePath !== undefined) violate("machine-path", `contains ${describeMachinePath(machinePath)}`);
  return violations;
}

// Message d'échec : le fichier et la règle violée.
export function formatViolation(file: string, { rule, detail }: Violation): string {
  return `${file}: rule ${rule}: ${detail}`;
}
