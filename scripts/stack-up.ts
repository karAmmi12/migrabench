// `npm run stack:up` : démarre la pile de développement avec un sel tiré pour
// elle, et l'écrit dans .dev-archive-salt pour que `npm test` le relise.
// Ce sel de développement ne sert jamais à une exécution mesurée (README).
// Le verrou du banc est tenu pendant le démarrage ; s'il est tenu par un autre
// outil du banc, refus avec le code 4, avant d'écrire le sel.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { acquireBenchLockOrExit } from "../shared/bench-lock.ts";
import { DEV_SALT_FILE, DEV_SALT_FILE_FROM_ROOT } from "./dev-archive-salt.ts";

const lock = acquireBenchLockOrExit({ tool: "stack-up" });
const salt = randomBytes(32).toString("hex");
let up;
try {
  // Écrit avant le démarrage : le fichier donne toujours le dernier sel passé à la pile.
  writeFileSync(DEV_SALT_FILE, `${salt}\n`, { mode: 0o600 });
  up = spawnSync("docker", ["compose", "up", "--detach", "--build", "--wait"], {
    stdio: "inherit",
    env: { ...process.env, ARCHIVE_SALT: salt },
  });
} finally {
  lock.release();
}
if (up.error) throw up.error;
if (up.status !== 0) {
  console.error("docker compose up failed");
  process.exit(up.status ?? 1);
}
console.log(`Stack up with a development salt, written to ${DEV_SALT_FILE_FROM_ROOT}: never use it for a measured run.`);
