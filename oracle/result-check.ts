// Contrôle d'un résultat de l'oracle déjà écrit (#53) : la collecte refuse un
// résultat invalide au moment de l'écrire, ce contrôle refuse un résultat
// versionné écrit par une version antérieure de la collecte, modifié à la
// main ou produit sous un mauvais Node. Rend la liste des manquements, vide si
// le résultat est valide ; chacun nomme le fichier et la règle violée.

import { machinePathIn } from "./collect.ts";

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

const FULL_SHA = /^[0-9a-f]{40}$/;

export function checkResult(file: string, result: CheckedResult, environment: ResultEnvironment): string[] {
  const metadata = result.config?.metadata ?? {};
  const problems: string[] = [];
  const violate = (rule: string, detail: string) => problems.push(`${file}: rule ${rule}: ${detail}`);

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
  if (machinePath === "../") violate("machine-path", "contains a path above the repository root (../)");
  else if (machinePath !== undefined) violate("machine-path", `contains ${machinePath}`);
  return problems;
}
