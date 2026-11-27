// Configuration globale de Vitest, la première : Vitest ne démarre que sous le
// verrou du banc tenu par le `npm test` qui l'a lancé (#163). Lancé
// directement, il écrirait sur la pile pendant une mesure et la rendrait
// invalide.
import { npmTestLockProblem } from "../shared/bench-lock.ts";

export default function setup(): void {
  const problem = npmTestLockProblem();
  if (problem !== undefined) throw new Error(problem);
}
