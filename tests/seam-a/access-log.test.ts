// Seam A : journal d'accès du legacy (spec de l'étape 3, « Journal
// d'accès »), instrumentation du banc (TRAPS.md). Il survit à un redémarrage
// du legacy et ne contient que le connecteur 8080. Prérequis :
// `npm run stack:up`.
//
// Ce test redémarre le legacy : il tourne dans son propre groupe de Vitest,
// après tous les autres (vitest.config.ts). `npm test` ne tient pas le verrou
// du banc (#94) : ne pas le lancer pendant une mesure.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../shared/root.ts";
import { fetchFromInternal, INTERNAL_API_URL } from "./internal-api-client.ts";
import { legacyFetch, SEAM_A_MARKER } from "./legacy-client.ts";

const execFileAsync = promisify(execFile);
const COMPOSE = ["compose", "--file", join(ROOT, "docker-compose.yml")];
// Dossier du journal dans le conteneur (fixtures/legacy-app/access-log/).
const LOG_DIR_IN_CONTAINER = "/usr/local/tomcat/logs/migrabench";

async function docker(...args: string[]): Promise<string> {
  return (await execFileAsync("docker", args)).stdout.trim();
}

// Fichier du journal sur l'hôte, lu dans le montage du conteneur : la pile est
// commune à la machine, et peut avoir été lancée depuis une autre copie du dépôt.
async function accessLogFile(): Promise<string> {
  const container = await docker(...COMPOSE, "ps", "--quiet", "legacy");
  const mounts = JSON.parse(await docker("inspect", "--format", "{{json .Mounts}}", container)) as { Source: string; Destination: string }[];
  const mount = mounts.find(({ Destination }) => Destination === LOG_DIR_IN_CONTAINER);
  if (mount === undefined) throw new Error(`The legacy container mounts nothing on ${LOG_DIR_IN_CONTAINER}`);
  return join(mount.Source, "access.log");
}

// Lignes du journal qui portent `token`, une fois au moins une écrite : la
// valve écrit après l'envoi de la réponse.
async function linesWith(file: string, token: string): Promise<string[]> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const lines = (await readFile(file, "utf8")).split("\n").filter((line) => line.includes(token));
    if (lines.length > 0 || Date.now() > deadline) return lines;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe("legacy access log", { timeout: 120_000 }, () => {
  it("survives a restart of the legacy, carries the Seam A marker and leaves out port 8081", async () => {
    const run = randomBytes(4).toString("hex");
    const file = await accessLogFile();

    await legacyFetch(`/access-log-before-restart-${run}`);
    await docker(...COMPOSE, "restart", "legacy");
    await docker(...COMPOSE, "up", "--detach", "--no-recreate", "--wait", "legacy");
    await legacyFetch(`/access-log-after-restart-${run}`);
    const internal = await fetchFromInternal(`${INTERNAL_API_URL}/access-log-internal-${run}`);

    const before = await linesWith(file, `/access-log-before-restart-${run}`);
    const after = await linesWith(file, `/access-log-after-restart-${run}`);
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    // Format : horodatage, adresse et port locaux, adresse distante, ligne de
    // requête, statut, User-Agent avec le marqueur du Seam A.
    expect(after[0]).toMatch(
      new RegExp(`^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}[+-]\\d{4} \\S+:8080 \\S+ "GET /access-log-after-restart-${run} HTTP/1\\.1" \\d{3} "migrabench-seam-a/${SEAM_A_MARKER}"$`),
    );
    // La requête du port 8081 a bien été servie (401 sans identifiants, comme
    // tout chemin hors de l'API interne), mais n'est pas journalisée.
    expect(internal.status).toBe(401);
    expect(await readFile(file, "utf8")).not.toContain(`/access-log-internal-${run}`);
  });
});
