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
import { acquireBenchLockOrExit, NPM_TEST_PID } from "../shared/bench-lock.ts";

const VITEST = new URL("../node_modules/vitest/vitest.mjs", import.meta.url).pathname;

const lock = acquireBenchLockOrExit({ tool: "test" });

// Vitest reçoit le PID de ce processus, détenteur du verrou du banc : son
// globalSetup refuse de démarrer sans lui (#163, tests/bench-lock-held.setup.ts).
//
// Vitest tourne dans son propre groupe de processus (`detached`) : Ctrl+C,
// envoyé par le terminal au groupe de premier plan, ne l'atteint que par le
// relais ci-dessous. Sinon il recevrait SIGINT deux fois, du terminal et du
// relais ; il n'écoute le signal qu'une fois, et le second l'arrêterait au
// milieu de son nettoyage (#94). Ce processus ne peut pas savoir si un SIGINT
// visait son groupe ou lui seul : il relaie donc toujours, et Vitest ne
// l'entend que de lui.
const vitest = spawn(process.execPath, [VITEST, "run", ...process.argv.slice(2)], {
  stdio: "inherit",
  detached: true,
  env: { ...process.env, [NPM_TEST_PID]: String(process.pid) },
});

// Interruption : la première est relayée à Vitest, une seule fois. npm relaie
// lui aussi SIGINT et SIGTERM à ce processus, qui les reçoit donc en double
// sous Ctrl+C. Le verrou du banc n'est libéré qu'à la fin de Vitest, après son
// nettoyage. Pour l'arrêter sans attendre : SIGKILL sur son PID.
let relayed = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    if (relayed) return;
    relayed = true;
    vitest.kill(signal);
  });
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
