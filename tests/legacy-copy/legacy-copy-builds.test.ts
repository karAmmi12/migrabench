// La copie expurgée du legacy compile et démarre (ADR 0010, #125) : image
// construite avec le Dockerfile du banc, sur un contexte où la copie remplace
// fixtures/legacy-app. Le journal d'accès (access-log/), exclu de la copie
// mais lu par le Dockerfile, vient du banc. Prérequis : Docker. Ne touche pas
// à la pile : image, conteneur et ports à part.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expurgate, readLegacyFiles } from "../../scripts/legacy-copy.ts";
import { parseUsersWithoutUnknown } from "../../scripts/users.ts";
import { spawnCommand } from "../../shared/process.ts";
import { readBenchEnv, ROOT } from "../../shared/root.ts";

const copy = expurgate(readLegacyFiles(ROOT));
const NAME = `migrabench-legacy-copy-${process.pid}`;
const READY_TIMEOUT_MS = 120_000;

const agent = parseUsersWithoutUnknown(readFileSync(join(ROOT, "fixtures/users.json"), "utf8")).find(
  (user) => user.role === "agent",
);
if (agent === undefined) throw new Error("No agent in fixtures/users.json");
const AGENT = `Basic ${Buffer.from(`${agent.username}:${agent.password}`).toString("base64")}`;

let context = "";
let screensUrl = "";
let apiUrl = "";

async function hostPort(containerPort: number): Promise<string> {
  const { stdout } = await spawnCommand("docker", ["port", NAME, `${containerPort}/tcp`]);
  const address = stdout.split("\n").find((line) => line.startsWith("127.0.0.1:"));
  if (address === undefined) throw new Error(`No 127.0.0.1 port for ${containerPort}: ${stdout}`);
  return `http://${address}`;
}

async function waitForAuthChallenge(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await fetch(`${screensUrl}/`).then((response) => response.status, () => 0);
    if (status === 401) return;
    await new Promise((done) => setTimeout(done, 1000));
  }
  const { stdout, stderr } = await spawnCommand("docker", ["logs", NAME], { allowFailure: true });
  throw new Error(`The legacy copy did not answer 401 within ${READY_TIMEOUT_MS} ms:\n${stdout}${stderr}`);
}

beforeAll(async () => {
  const started = Date.now();
  context = mkdtempSync(join(tmpdir(), "legacy-copy-"));
  for (const file of copy) {
    const path = join(context, "fixtures/legacy-app", file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
  }
  for (const path of ["fixtures/legacy-app/access-log", "fixtures/users.json", "scripts/users.ts", "scripts/generate-tomcat-users.ts"]) {
    cpSync(join(ROOT, path), join(context, path), { recursive: true });
  }
  await spawnCommand("docker", ["build", "-q", "-f", join(ROOT, "fixtures/legacy-app/Dockerfile"), "-t", NAME, context]);
  const built = Date.now();

  const { FROZEN_DATE } = await readBenchEnv();
  if (FROZEN_DATE === undefined) throw new Error("FROZEN_DATE missing from .env");
  await spawnCommand("docker", [
    "run", "-d", "--name", NAME, "-e", `FROZEN_DATE=${FROZEN_DATE}`, "-e", "ARCHIVE_TOKEN=copy-test",
    "-p", "127.0.0.1::8080", "-p", "127.0.0.1::8081", NAME,
  ]);
  screensUrl = await hostPort(8080);
  apiUrl = await hostPort(8081);
  await waitForAuthChallenge();
  // Durée relevée dans la sortie des tests, pour la fiche du ticket.
  console.log(`legacy copy: build ${built - started} ms, start ${Date.now() - built} ms`);
}, 900_000);

afterAll(async () => {
  await spawnCommand("docker", ["rm", "-f", NAME], { allowFailure: true });
  await spawnCommand("docker", ["rmi", "-f", NAME], { allowFailure: true });
  if (context !== "") rmSync(context, { recursive: true, force: true });
});

describe("legacy copy built with the bench Dockerfile", () => {
  it("asks for BASIC credentials, under the renamed realm", async () => {
    const response = await fetch(`${screensUrl}/`);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Basic realm="dossiers"/);
  });

  it("runs a search through the renamed Struts action", async () => {
    const response = await fetch(`${screensUrl}/rechercher.do?number=D-0001`, { headers: { Authorization: AGENT } });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Élodie Marchand");
  });

  it("reads its messages from the renamed resource bundle", async () => {
    const response = await fetch(`${screensUrl}/rechercher.do?number=D-1`, { headers: { Authorization: AGENT } });

    expect(await response.text()).toContain("Le numéro doit être au format D- suivi de 4 chiffres, par exemple D-0001.");
  });

  it("loads the filtered dataset, and only it", async () => {
    const dataset = JSON.parse(copy.find((file) => file.path === "src/main/resources/dossiers.json")?.content ?? "") as {
      dossiers: { number: string }[];
    };
    const response = await fetch(`${apiUrl}/api/dossiers`);
    const body = (await response.json()) as { dossiers: { number: string }[] };

    expect(body.dossiers.map((dossier) => dossier.number)).toEqual(dataset.dossiers.map((dossier) => dossier.number));
  });
});
