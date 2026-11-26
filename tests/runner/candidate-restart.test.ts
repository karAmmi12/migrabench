// Redémarrage du legacy demandé par une porte (`restartLegacy()`, spec de
// l'étape 4, « Registre, contexte et ordre » et « Précisions de G0 ») :
// redémarrage réussi, pile qui ne redevient pas saine, candidat qui ne
// redevient pas disponible.
//
// Sans la pile : un faux `docker`, placé en tête du PATH, remplace Docker,
// comme dans tests/runner/runner-errors.test.ts. Il note chaque appel. Selon
// DOCKER_STUB_MODE, la recréation de la pile réussit ou échoue (legacy
// `unhealthy`), et le conteneur du candidat est dit arrêté. Le port 8080 du
// legacy est joué par un serveur local qui écrit le journal d'accès vivant,
// ligne par ligne. Chaque ligne reprend la vraie ligne de la requête témoin
// `start-1` de l'exécution 45624689673
// (tests/fixtures/ci45624689673/PROVENANCE.md) : seuls l'horodatage et le
// chemin changent. Le candidat est joué par un serveur local, absent quand il
// ne doit pas redevenir disponible.
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StackIncident } from "../../gates/context.ts";
import { examineRelay } from "../../gates/relay.ts";
import { stackContextDigests } from "../../oracle/stack-images.ts";
import { checkAccessLog } from "../../runner/access-log.ts";
import { candidateStarter } from "../../runner/candidate-restart.ts";
import type { CandidateService } from "../../runner/candidate-runtime.ts";
import { type PhaseRecord, verdict } from "../../runner/verdict.ts";
import { ACCESS_LOG_FILE } from "../../runner/witness.ts";
import { readFixture } from "../real-fixtures.ts";

// Vraie ligne de la requête témoin `start-1` (ligne 2 du journal).
const REAL_WITNESS_LINE = readFixture("ci45624689673/oracle-artifacts/20261125T133422Z-52303ae-reference-candidate/access.log").split("\n")[1]!;
const MARKER = "c".repeat(64);

const workDir = mkdtempSync(join(tmpdir(), "mb-restart-"));
const stubDir = join(workDir, "stub");
const accessLogDir = join(workDir, "access-log");
const stubLog = join(stubDir, "calls.log");
const originalPath = process.env.PATH;

let legacy: Server;
let legacyUrl: string;
let candidate: Server | undefined;

const SERVICE: CandidateService = {
  compose: ["compose", "--file", "docker-compose.yml", "--file", join(workDir, "compose.candidate.yml")],
  composeOverride: "sha256:override",
  startLog: join(workDir, "start.log"),
};

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

function close(server: Server | undefined): Promise<void> {
  return new Promise((resolve) => (server === undefined ? resolve() : server.close(() => resolve())));
}

beforeAll(async () => {
  mkdirSync(stubDir);
  mkdirSync(accessLogDir);
  const digests = await stackContextDigests();
  const labels = (service: "legacy" | "archive") => `{"image":"sha256:${"a".repeat(64)}","labels":{"org.migrabench.context-digest":"${digests[service]}"}}`;
  const state = (health: string) => `[{"Id":"id","RestartCount":0,"State":{"Status":"running","Running":true,"ExitCode":0,"Error":"","StartedAt":"2026-11-26T12:00:00Z","Health":{"Status":"${health}","Log":[]}}}]`;
  writeFileSync(
    join(stubDir, "docker"),
    `#!/bin/sh
echo "$*" >> "${stubLog}"
case "$DOCKER_STUB_MODE:$*" in
  "stack-fails:compose up --detach --force-recreate --no-build --wait legacy archive") echo "dependency failed to start: container migrabench-legacy-1 is unhealthy" >&2; exit 1 ;;
  "stack-fails:inspect legacy-id") echo '${state("unhealthy")}'; exit 0 ;;
esac
case "$*" in
  "compose up --detach --force-recreate --no-build --wait legacy archive") exit 0 ;;
  "compose ps --quiet legacy"|"compose ps --all --quiet legacy") echo legacy-id; exit 0 ;;
  "compose ps --quiet archive"|"compose ps --all --quiet archive") echo archive-id; exit 0 ;;
  "inspect --format "*" legacy-id") echo '${labels("legacy")}'; exit 0 ;;
  "inspect --format "*" archive-id") echo '${labels("archive")}'; exit 0 ;;
  "inspect legacy-id"|"inspect archive-id") echo '${state("healthy")}'; exit 0 ;;
  *" ps --all --quiet candidate") echo candidate-id; exit 0 ;;
  "inspect --format {{.State.Running}} candidate-id") echo false; exit 0 ;;
  *" logs "*" candidate"|*" rm --stop --force candidate"|*" up --detach --force-recreate --no-deps candidate") exit 0 ;;
esac
echo "docker stub: unexpected call: $*" >&2
exit 97
`,
  );
  chmodSync(join(stubDir, "docker"), 0o755);
  process.env.PATH = `${stubDir}:${originalPath}`;
  // Faux port 8080 du legacy : une ligne du journal par requête, puis 401.
  legacy = createServer((request, response) => {
    const line = REAL_WITNESS_LINE.replace(/^\S+/, new Date().toISOString().replace("Z", "+0000")).replace(/"GET \S+ /, `"GET ${request.url} `);
    response.writeHead(401).end();
    appendFileSync(join(accessLogDir, ACCESS_LOG_FILE), `${line}\n`);
  });
  legacyUrl = await listen(legacy);
});

beforeEach(async () => {
  writeFileSync(stubLog, "");
  rmSync(join(accessLogDir, ACCESS_LOG_FILE), { force: true });
  await close(candidate);
  candidate = undefined;
  delete process.env.DOCKER_STUB_MODE;
});

afterAll(async () => {
  process.env.PATH = originalPath;
  delete process.env.DOCKER_STUB_MODE;
  await close(candidate);
  await close(legacy);
  rmSync(workDir, { recursive: true, force: true });
});

// Appels qui comptent, dans l'ordre : recréation de la pile, arrêt et
// recréation du candidat.
function keyCalls(): string[] {
  return readFileSync(stubLog, "utf8")
    .split("\n")
    .flatMap((call) => {
      if (call === "compose up --detach --force-recreate --no-build --wait legacy archive") return ["stack recreated"];
      if (call.endsWith(" rm --stop --force candidate")) return ["candidate removed"];
      if (call.endsWith(" up --detach --force-recreate --no-deps candidate")) return ["candidate recreated"];
      return [];
    });
}

// Démarrage du candidat comme après la recréation de la pile par l'oracle
// (`start-1`), puis rien d'autre que ce que le test regarde.
async function startedAfterOracle(candidateUrl: string) {
  const startWitnesses: string[] = [];
  const starter = candidateStarter({ service: SERVICE, salt: "5a17", accessLogDir, marker: MARKER, readyTimeoutMs: 2_000, startWitnesses, legacyUrl, candidateUrl });
  await starter.readyCandidate();
  writeFileSync(stubLog, "");
  return { starter, startWitnesses };
}

// Issue que la phase `gates` prend d'un redémarrage en échec, et son verdict.
function verdictOfGates(incident: StackIncident) {
  const phase = (name: PhaseRecord["name"], outcome = "ok", detail?: string) =>
    ({ name, outcome, startedAt: "2026-11-26T12:00:00.000Z", durationMs: 1, raw: {}, ...(detail === undefined ? {} : { detail }) }) as PhaseRecord;
  return verdict([phase("preparation"), phase("contract"), phase("build"), phase("start"), phase("oracle"), phase("gates", incident.outcome, incident.detail), phase("closing")]).verdict;
}

describe("restartLegacy", { timeout: 30_000 }, () => {
  it("recreates the stack, then the candidate, and sends the next witness start-2 in the chain", async () => {
    candidate = createServer((_request, response) => response.end("ready"));
    const { starter, startWitnesses } = await startedAfterOracle(await listen(candidate));

    await starter.restartLegacy();

    expect(keyCalls()).toEqual(["stack recreated", "candidate removed", "candidate recreated"]);
    expect(startWitnesses).toEqual(["start-1", "start-2"]);
    const log = readFileSync(join(accessLogDir, ACCESS_LOG_FILE), "utf8");
    // La chaîne des témoins, close par `end` comme à la clôture, reste intacte
    // pour le contrôle du journal et pour la porte du relais.
    await fetch(`${legacyUrl}/migrabench-witness/${MARKER}/end`);
    const closed = readFileSync(join(accessLogDir, ACCESS_LOG_FILE), "utf8");
    const check = checkAccessLog({ log: closed, marker: MARKER, expected: [...startWitnesses, "end"], seamAMarkers: [] });
    expect(check).toMatchObject({ outcome: "ok", witnesses: [{ name: "start-1", line: 1 }, { name: "start-2", line: 2 }, { name: "end", line: 3 }] });
    expect(examineRelay({ log: closed, witnesses: check.witnesses })).toEqual({ examined: 3, findings: [] });
    expect(log.split("\n").filter((line) => line !== "")).toHaveLength(2);
  });

  it("is a stack failure, never a gate error, when the legacy does not become healthy again: the measure is invalid", async () => {
    candidate = createServer((_request, response) => response.end("ready"));
    const { starter, startWitnesses } = await startedAfterOracle(await listen(candidate));
    process.env.DOCKER_STUB_MODE = "stack-fails";

    const incident = await starter.restartLegacy().then(() => undefined, (error: unknown) => error);

    expect(incident).toBeInstanceOf(StackIncident);
    expect(incident).toMatchObject({ outcome: "stack-failed-before-candidate" });
    expect((incident as StackIncident).detail).toContain("legacy: container id running, exit code 0, health unhealthy");
    // Ni témoin ni candidat après une pile qui n'est pas redevenue saine.
    expect(keyCalls()).toEqual(["stack recreated"]);
    expect(startWitnesses).toEqual(["start-1"]);
    expect(verdictOfGates(incident as StackIncident)).toMatchObject({ category: "invalid", reason: "stack-failed-before-candidate" });
  });

  it("is a candidate failure when the recreated candidate does not become available again", async () => {
    // Disponible au premier démarrage, le candidat ne répond plus ensuite.
    candidate = createServer((_request, response) => response.end("ready"));
    const { starter, startWitnesses } = await startedAfterOracle(await listen(candidate));
    await close(candidate);
    candidate = undefined;

    const incident = await starter.restartLegacy().then(() => undefined, (error: unknown) => error);

    expect(incident).toBeInstanceOf(StackIncident);
    expect(incident).toMatchObject({ outcome: "start-exited" });
    expect(keyCalls()).toEqual(["stack recreated", "candidate removed", "candidate recreated"]);
    expect(startWitnesses).toEqual(["start-1", "start-2"]);
    expect(verdictOfGates(incident as StackIncident)).toEqual({ category: "candidate-failure", reason: "start-exited" });
  });
});
