// `npm test` : lance `vitest run` en tenant le verrou du banc (outil `test`)
// du début à la fin, y compris sur échec et sur interruption (#94). Les tests
// du Seam A écrivent sur la pile, et l'un d'eux redémarre le legacy (#67) :
// aucun autre outil du banc ne doit la recréer ou la mesurer pendant ce temps.
//
// Les arguments sont passés à Vitest : `npm test -- <fichier>`.
//
// Limite : tué par SIGKILL, ce processus ne peut rien relayer. Vitest continue
// alors seul, et le verrou du banc, orphelin, sera repris par le prochain
// outil du banc.
//
// Sans dépendance hors de Node : le script est copié tel quel dans un dépôt
// temporaire par ses tests.
import { spawn } from "node:child_process";
import { constants } from "node:os";
import { acquireBenchLockOrExit } from "../shared/bench-lock.ts";

const VITEST = new URL("../node_modules/vitest/vitest.mjs", import.meta.url).pathname;

const lock = acquireBenchLockOrExit({ tool: "test" });

const vitest = spawn(process.execPath, [VITEST, "run", ...process.argv.slice(2)], { stdio: "inherit" });

// Interruption : le signal est relayé à Vitest, et le verrou du banc n'est
// libéré qu'à sa fin. Le relais couvre un signal envoyé à ce seul processus.
// Avec Ctrl+C, Vitest reçoit SIGINT deux fois (groupe de processus, puis
// relais) : il ne l'écoute qu'une fois, et le second le termine aussitôt,
// après son propre nettoyage.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => vitest.kill(signal));
}

vitest.once("error", (error) => {
  lock.release();
  console.error(`Cannot launch Vitest: ${error.message}`);
  process.exit(1);
});

vitest.once("exit", (code, signal) => {
  lock.release();
  process.exit(code ?? 128 + (signal === null ? 0 : (constants.signals[signal] ?? 0)));
});
