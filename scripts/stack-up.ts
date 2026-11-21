// `npm run stack:up` : démarre la pile de développement avec un sel tiré pour
// elle, et l'écrit dans .dev-archive-salt pour que `npm test` le relise.
// Ce sel de développement ne sert jamais à une exécution mesurée (README).
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { DEV_SALT_FILE, DEV_SALT_FILE_FROM_ROOT } from "./dev-archive-salt.ts";

const salt = randomBytes(32).toString("hex");
// Écrit avant le démarrage : le fichier donne toujours le dernier sel passé à la pile.
writeFileSync(DEV_SALT_FILE, `${salt}\n`, { mode: 0o600 });

const { status, error } = spawnSync("docker", ["compose", "up", "--detach", "--build", "--wait"], {
  stdio: "inherit",
  env: { ...process.env, ARCHIVE_SALT: salt },
});
if (error) throw error;
if (status !== 0) {
  console.error("docker compose up failed");
  process.exit(status ?? 1);
}
console.log(`Stack up with a development salt, written to ${DEV_SALT_FILE_FROM_ROOT}: never use it for a measured run.`);
