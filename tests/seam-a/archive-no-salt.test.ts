// Seam A : sans ARCHIVE_SALT, `docker compose up` démarre quand même la pile ;
// le service d'archivage délivre l'accusé avec une référence tirée de son
// propre sel, et la variable n'est dans aucun des deux conteneurs.
// La pile est une seconde pile, sous un autre nom de projet, sur les images
// déjà construites (`npm run stack:up`) et sans port publié.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseEnv, promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ARCHIVE_TOKEN } from "./archive-client.ts";

const execFileAsync = promisify(execFile);

const COMPOSE = [
  "compose",
  "--project-name", "migrabench-no-salt",
  "--file", fileURLToPath(new URL("../../docker-compose.yml", import.meta.url)),
  "--file", fileURLToPath(new URL("./no-salt.compose.yml", import.meta.url)),
];

// Environnement du shell sans ARCHIVE_SALT, même si celui de `npm test` l'a (CI).
const SHELL_WITHOUT_SALT = { ...process.env };
delete SHELL_WITHOUT_SALT.ARCHIVE_SALT;

async function compose(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("docker", [...COMPOSE, ...args], { env: SHELL_WITHOUT_SALT });
  return stdout;
}

// Exécuté dans le conteneur du service : il s'appelle lui-même, faute de port publié.
const PROBE = `
fetch(process.argv[1]).then(
  async (response) => console.log(JSON.stringify({ status: response.status, body: await response.text() })),
  (error) => { console.error(String(error.cause ?? error)); process.exit(2); },
);`;

describe("stack started without ARCHIVE_SALT", () => {
  beforeAll(async () => {
    await compose("up", "--detach", "--no-build", "--pull", "never", "--wait");
  }, 300_000);

  afterAll(async () => {
    await compose("down", "--volumes", "--remove-orphans");
  }, 120_000);

  it("still delivers the receipt, with an archive reference", async () => {
    const url = `http://localhost:8090/accuse-de-remise?jeton=${ARCHIVE_TOKEN}&numero=D-0007`;
    const { status, body } = JSON.parse(await compose("exec", "-T", "archive", "node", "-e", PROBE, url)) as {
      status: number;
      body: string;
    };

    expect(status).toBe(200);
    expect(body).toContain("Accusé de remise du dossier D-0007");
    expect(body).toMatch(/Référence d'archivage : [0-9A-F]{12}</);
  });

  it.each(["archive", "legacy"])("leaves ARCHIVE_SALT out of the %s container", async (service) => {
    expect(parseEnv(await compose("exec", "-T", service, "env"))).not.toHaveProperty("ARCHIVE_SALT");
  });
});
