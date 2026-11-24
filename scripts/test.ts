// `npm test` : lance `vitest run` en tenant le verrou du banc (outil `test`)
// du début à la fin, y compris sur échec et sur interruption (#94). Les tests
// du Seam A écrivent sur la pile, et l'un d'eux redémarre le legacy (#67) :
// aucun autre outil du banc ne doit la recréer ou la mesurer pendant ce temps.
//
// Les arguments sont passés à Vitest : `npm test -- <fichier>`.
//
// Sans dépendance hors de Node : le script est copié tel quel dans un dépôt
// temporaire par ses tests.
import { spawn } from "node:child_process";
import { constants } from "node:os";
import { acquireBenchLock, benchLockPathLine, heldMessage, takenOverNotice } from "../shared/bench-lock.ts";

const VITEST = new URL("../node_modules/vitest/vitest.mjs", import.meta.url).pathname;

const lock = acquireBenchLock({ tool: "test" });
if (!lock.ok) {
  console.error(`npm test refused: ${heldMessage(lock.holder)}.\n${benchLockPathLine()}\nWait for it to end, or stop it, then run \`npm test\` again.`);
  process.exit(4);
}
if (lock.takenOver !== undefined) console.error(takenOverNotice(lock.takenOver));

const vitest = spawn(process.execPath, [VITEST, "run", ...process.argv.slice(2)], { stdio: "inherit" });

// Interruption : le signal est relayé à Vitest, et le verrou du banc n'est
// libéré qu'à sa fin. Ctrl+C l'envoie déjà à tout le groupe de processus ; le
// relais couvre un signal envoyé à ce seul processus.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => vitest.kill(signal));
}

vitest.once("exit", (code, signal) => {
  lock.release();
  process.exit(code ?? 128 + (signal === null ? 0 : (constants.signals[signal] ?? 0)));
});
