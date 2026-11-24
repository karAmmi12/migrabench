// Mesure prévue pour compter (`--counted`, #73 ; spec de l'étape 3, récits 11
// à 14) : elle part d'un état publié, ou elle est refusée avant toute action
// (`refused-counted`, code 4), avec toutes les conditions manquantes nommées
// dans un seul message.

// Faits relevés avant la mesure (runner/counted-facts.ts pour ceux de Git).
export interface CountedFacts {
  worktreeClean: boolean;
  // Commit de origin/main après `git fetch`, ou undefined si le fetch a échoué.
  originMain: string | undefined;
  // HEAD est origin/main ou l'un de ses ancêtres.
  headReachable: boolean;
  saltImposed: boolean;
  timeoutCapImposed: boolean;
  // Un résultat d'étalonnage de CI est versionné (runner/calibration-results.ts).
  calibrationVersioned: boolean;
}

export type CountedCondition = "worktree-modified" | "origin-main-unfetched" | "head-unpublished" | "salt-imposed" | "timeout-cap-imposed" | "no-calibration";

const DESCRIPTIONS: Readonly<Record<CountedCondition, string>> = {
  "worktree-modified": "the worktree is modified",
  "origin-main-unfetched": "origin/main could not be fetched",
  "head-unpublished": "HEAD is not reachable from origin/main",
  "salt-imposed": "the salt is imposed (ORACLE_SALT)",
  "timeout-cap-imposed": "a timeout cap is imposed (--timeout-cap-ms)",
  "no-calibration": "no calibration result is versioned in results/calibration/",
};

export type CountedPreconditions = { ok: true; originMain: string } | { ok: false; missing: CountedCondition[]; message: string };

export function countedPreconditions(facts: CountedFacts): CountedPreconditions {
  const missing: CountedCondition[] = [];
  if (!facts.worktreeClean) missing.push("worktree-modified");
  // Sans origin/main, l'atteignabilité de HEAD ne se vérifie pas : seul le
  // fetch manqué est nommé.
  if (facts.originMain === undefined) missing.push("origin-main-unfetched");
  else if (!facts.headReachable) missing.push("head-unpublished");
  if (facts.saltImposed) missing.push("salt-imposed");
  if (facts.timeoutCapImposed) missing.push("timeout-cap-imposed");
  if (!facts.calibrationVersioned) missing.push("no-calibration");
  if (missing.length === 0 && facts.originMain !== undefined) return { ok: true, originMain: facts.originMain };
  const message = [
    "a measure planned to count must start from a published state; missing conditions:",
    ...missing.map((condition) => `  - ${DESCRIPTIONS[condition]}`),
  ].join("\n");
  return { ok: false, missing, message };
}
