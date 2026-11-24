// Environnement du dépôt contre lequel un résultat de l'oracle est contrôlé
// (result-check.ts) : la version de Node de .nvmrc, et les commits connus.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { MeasureEnvironment, ResultEnvironment } from "./result-check.ts";

// Les PR sont fusionnées en squash : le commit du banc d'un résultat n'est pas
// un ancêtre de main, il n'est joignable que par la tête de sa PR. Cette
// commande (package.json) récupère ces têtes ; la CI la lance (tests.yml).
export const FETCH_PULL_HEADS = "npm run fetch:pull-heads";

export function repositoryEnvironment(root: URL): ResultEnvironment {
  return {
    node: readFileSync(new URL(".nvmrc", root), "utf8").trim(),
    commitExists: (sha) => {
      try {
        execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: root, stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    },
  };
}

// Environnement du contrôle d'une mesure versionnée (#73) : l'historique, en
// plus, pour vérifier que le commit du banc est originMain ou l'un de ses
// ancêtres.
export function measureEnvironment(root: URL): MeasureEnvironment {
  return {
    ...repositoryEnvironment(root),
    isAncestor: (ancestor, descendant) => {
      try {
        execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root, stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    },
  };
}
