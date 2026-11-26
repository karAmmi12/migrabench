// Redémarrage du legacy demandé par une porte (`restartLegacy()`, spec de
// l'étape 4, « Registre, contexte et ordre » et « Précisions de G0 ») :
// redémarrage réussi, pile qui ne redevient pas saine ou qui vient d'une autre
// copie, requête témoin absente du journal, candidat qui ne redevient pas
// disponible. Chaque échec passe par le vrai registre des portes, qui le
// laisse passer au lieu d'en faire une erreur de porte.
//
// Sans la pile : un faux `docker`, placé en tête du PATH, remplace Docker. Il
// note chaque appel et échoue sur tout appel qu'il ne connaît pas. Selon
// DOCKER_STUB_MODE, la recréation de la pile échoue (legacy `unhealthy`), les
// images portent une empreinte étrangère, ou le conteneur du candidat est dit
// en marche. Ses sorties de `docker inspect` ont la forme relevée le
// 2026-11-26 sur le conteneur du legacy (Docker 29.1.3) : `Id`,
// `RestartCount`, `State.{Status, Running, ExitCode, Error, StartedAt}`,
// `State.Health.{Status, Log[].{ExitCode, Output}}`, et `{image, labels}`
// pour `--format`.
//
// Le port 8080 du legacy est joué par un serveur local qui écrit le journal
// d'accès vivant, ligne par ligne, et note chaque requête témoin dans le
// journal des appels. Chaque ligne reprend la vraie ligne de la requête
// témoin `start-1` de l'exécution 45624689673
// (tests/fixtures/ci45624689673/PROVENANCE.md) : seuls l'horodatage et le
// chemin changent. Le candidat est joué par un serveur local.
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type GateContext, StackIncident } from "../../gates/context.ts";
import { type Gate, runGates } from "../../gates/registry.ts";
import { examineRelay } from "../../gates/relay.ts";
import { stackContextDigests } from "../../oracle/stack-images.ts";
import { checkAccessLog } from "../../runner/access-log.ts";
import { type CandidateStarter, candidateStarter } from "../../runner/candidate-start.ts";
import type { CandidateService } from "../../runner/candidate-runtime.ts";
import { type PhaseRecord, verdict } from "../../runner/verdict.ts";
import { ACCESS_LOG_FILE } from "../../runner/witness.ts";
import { readFixture } from "../real-fixtures.ts";

// Vraie ligne de la requête témoin `start-1` (ligne 2 du journal).
const REAL_WITNESS_LINE = readFixture("ci45624689673/oracle-artifacts/20261125T133422Z-52303ae-reference-candidate/access.log").split("\n")[1]!;
const MARKER = "c".repeat(64);
const WITNESS_PATH = new RegExp(`^/migrabench-witness/${MARKER}/(\\S+)$`);
const FOREIGN = `sha256:${"0".repeat(64)}`;

const workDir = mkdtempSync(join(tmpdir(), "mb-restart-"));
const stubDir = join(workDir, "stub");
const accessLogDir = join(workDir, "access-log");
const stubLog = join(stubDir, "calls.log");
const originalPath = process.env.PATH;

let legacy: Server;
let legacyUrl: string;
// Le faux legacy écrit-il son journal d'accès ?
let legacyLogs = true;
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
  const labels = (digest: string) => `{"image":"sha256:${"a".repeat(64)}","labels":{"org.migrabench.context-digest":"${digest}"}}`;
  const state = (health: string, exitCode: number) =>
    `[{"Id":"id","RestartCount":0,"State":{"Status":"running","Running":true,"ExitCode":0,"Error":"","StartedAt":"2026-11-26T12:00:00Z","Health":{"Status":"${health}","Log":[{"ExitCode":${exitCode},"Output":""}]}}}]`;
  writeFileSync(
    join(stubDir, "docker"),
    `#!/bin/sh
echo "$*" >> "${stubLog}"
case "$DOCKER_STUB_MODE:$*" in
  "stack-fails:compose up --detach --force-recreate --no-build --wait legacy archive browser") echo "docker stub: legacy unhealthy" >&2; exit 1 ;;
  "stack-fails:inspect legacy-id") echo '${state("unhealthy", 1)}'; exit 0 ;;
  "foreign-stack:inspect --format "*" legacy-id") echo '${labels(FOREIGN)}'; exit 0 ;;
  "candidate-runs:inspect --format {{.State.Running}} candidate-id") echo true; exit 0 ;;
esac
case "$*" in
  "compose up --detach --force-recreate --no-build --wait legacy archive browser") exit 0 ;;
  "compose ps --quiet legacy"|"compose ps --all --quiet legacy") echo legacy-id; exit 0 ;;
  "compose ps --quiet archive"|"compose ps --all --quiet archive") echo archive-id; exit 0 ;;
  "inspect --format "*" legacy-id") echo '${labels(digests.legacy)}'; exit 0 ;;
  "inspect --format "*" archive-id") echo '${labels(digests.archive)}'; exit 0 ;;
  "inspect legacy-id"|"inspect archive-id") echo '${state("healthy", 0)}'; exit 0 ;;
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
    const witness = WITNESS_PATH.exec(request.url ?? "")?.[1];
    if (witness !== undefined) appendFileSync(stubLog, `witness ${witness}\n`);
    if (legacyLogs) {
      const line = REAL_WITNESS_LINE.replace(/^\S+/, new Date().toISOString().replace("Z", "+0000")).replace(/"GET \S+ /, `"GET ${request.url} `);
      appendFileSync(join(accessLogDir, ACCESS_LOG_FILE), `${line}\n`);
    }
    response.writeHead(401).end();
  });
  legacyUrl = await listen(legacy);
});

beforeEach(async () => {
  writeFileSync(stubLog, "");
  rmSync(join(accessLogDir, ACCESS_LOG_FILE), { force: true });
  await close(candidate);
  candidate = undefined;
  legacyLogs = true;
  delete process.env.DOCKER_STUB_MODE;
});

afterAll(async () => {
  process.env.PATH = originalPath;
  delete process.env.DOCKER_STUB_MODE;
  await close(candidate);
  await close(legacy);
  rmSync(workDir, { recursive: true, force: true });
});

// Ce qui compte, dans l'ordre : recréation de la pile, arrêt du candidat,
// requête témoin, recréation du candidat.
function keyCalls(): string[] {
  return readFileSync(stubLog, "utf8")
    .split("\n")
    .flatMap((call) => {
      if (call === "compose up --detach --force-recreate --no-build --wait legacy archive browser") return ["stack recreated"];
      if (call.endsWith(" rm --stop --force candidate")) return ["candidate removed"];
      if (call.endsWith(" up --detach --force-recreate --no-deps candidate")) return ["candidate recreated"];
      if (call.startsWith("witness ")) return [call];
      return [];
    });
}

// Démarrage du candidat comme après la recréation de la pile par l'oracle
// (`start-1`), avec un candidat qui répond. Le journal des appels repart à vide.
async function startedAfterOracle({ readyTimeoutMs = 2_000 } = {}) {
  candidate = createServer((_request, response) => response.end("ready"));
  const startWitnesses: string[] = [];
  const starter = candidateStarter({ service: SERVICE, salt: "5a17", accessLogDir, marker: MARKER, readyTimeoutMs, startWitnesses, legacyUrl, candidateUrl: await listen(candidate) });
  await starter.readyCandidate();
  writeFileSync(stubLog, "");
  return { starter, startWitnesses };
}

// Une porte de test qui redémarre le legacy, passée par le vrai registre :
// l'échec du redémarrage en sort tel quel, jamais en résultat `errored`.
async function restartThroughRegistry(starter: CandidateStarter): Promise<StackIncident> {
  const restarting: Gate = { name: "restarting", group: "writes", results: { only: "judged" }, timeoutMs: 20_000, examine: async (context) => (await context.restartLegacy(), []) };
  const context = { restartLegacy: starter.restartLegacy } as unknown as Omit<GateContext, "signal">;
  const incident = await runGates([restarting], context).then(() => undefined, (error: unknown) => error);
  expect(incident).toBeInstanceOf(StackIncident);
  return incident as StackIncident;
}

// Verdict d'une mesure dont la phase `gates` prend l'issue du redémarrage.
function verdictOfGates(incident: StackIncident) {
  const phase = (name: PhaseRecord["name"], outcome = "ok", detail?: string) =>
    ({ name, outcome, startedAt: "2026-11-26T12:00:00.000Z", durationMs: 1, raw: {}, ...(detail === undefined ? {} : { detail }) }) as PhaseRecord;
  return verdict([phase("preparation"), phase("contract"), phase("build"), phase("start"), phase("oracle"), phase("gates", incident.outcome, incident.detail), phase("closing")]).verdict;
}

describe("restartLegacy", { timeout: 30_000 }, () => {
  it("recreates the stack, removes the candidate, sends the next witness start-2 in the chain, then recreates the candidate", async () => {
    const { starter, startWitnesses } = await startedAfterOracle();

    await starter.restartLegacy();

    expect(keyCalls()).toEqual(["stack recreated", "candidate removed", "witness start-2", "candidate recreated"]);
    expect(startWitnesses).toEqual(["start-1", "start-2"]);
    expect(readFileSync(join(accessLogDir, ACCESS_LOG_FILE), "utf8").split("\n").filter((line) => line !== "")).toHaveLength(2);
    // La chaîne des témoins, close par `end` comme à la clôture, reste intacte
    // pour le contrôle du journal et pour la porte du relais.
    await fetch(`${legacyUrl}/migrabench-witness/${MARKER}/end`);
    const closed = readFileSync(join(accessLogDir, ACCESS_LOG_FILE), "utf8");
    const check = checkAccessLog({ log: closed, marker: MARKER, expected: [...startWitnesses, "end"], seamAMarkers: [] });
    expect(check).toMatchObject({ outcome: "ok", witnesses: [{ name: "start-1", line: 1 }, { name: "start-2", line: 2 }, { name: "end", line: 3 }] });
    expect(examineRelay({ log: closed, witnesses: check.witnesses })).toEqual({ examined: 3, findings: [] });
  });

  it("is a stack failure, never a gate error, when the legacy does not become healthy again: the measure is invalid", async () => {
    const { starter, startWitnesses } = await startedAfterOracle();
    process.env.DOCKER_STUB_MODE = "stack-fails";

    const incident = await restartThroughRegistry(starter);

    expect(incident.outcome).toBe("stack-failed-before-candidate");
    expect(incident.detail).toContain("legacy: container id running, exit code 0, health unhealthy");
    // Ni témoin ni candidat après une pile qui n'est pas redevenue saine.
    expect(keyCalls()).toEqual(["stack recreated"]);
    expect(startWitnesses).toEqual(["start-1"]);
    expect(verdictOfGates(incident)).toMatchObject({ category: "invalid", reason: "stack-failed-before-candidate" });
  });

  it("is a stack failure when the recreated stack comes from another copy of the repository: the measure is invalid", async () => {
    const { starter, startWitnesses } = await startedAfterOracle();
    process.env.DOCKER_STUB_MODE = "foreign-stack";

    const incident = await restartThroughRegistry(starter);

    expect(incident.outcome).toBe("stack-not-from-this-copy");
    expect(incident.detail).toContain(`carries ${FOREIGN}`);
    expect(keyCalls()).toEqual(["stack recreated"]);
    expect(startWitnesses).toEqual(["start-1"]);
    expect(verdictOfGates(incident)).toMatchObject({ category: "invalid", reason: "stack-not-from-this-copy" });
  });

  it("makes the measure invalid when the witness start-2 is missing from the access log, without recreating the candidate", async () => {
    const { starter } = await startedAfterOracle();
    legacyLogs = false;

    const incident = await restartThroughRegistry(starter);

    expect(incident.outcome).toBe("access-log-inactive");
    expect(incident.detail).toContain("Missing witness request start-2");
    expect(keyCalls()).toEqual(["stack recreated", "candidate removed", "witness start-2"]);
    expect(verdictOfGates(incident)).toMatchObject({ category: "invalid", reason: "access-log-inactive" });
  });

  it("is a candidate failure when the recreated candidate has exited", async () => {
    const { starter, startWitnesses } = await startedAfterOracle();
    // Disponible au premier démarrage, le candidat ne répond plus ensuite.
    await close(candidate);
    candidate = undefined;

    const incident = await restartThroughRegistry(starter);

    expect(incident.outcome).toBe("start-exited");
    expect(keyCalls()).toEqual(["stack recreated", "candidate removed", "witness start-2", "candidate recreated"]);
    expect(startWitnesses).toEqual(["start-1", "start-2"]);
    expect(verdictOfGates(incident)).toEqual({ category: "candidate-failure", reason: "start-exited" });
  });

  it("is a candidate failure when the recreated candidate runs but never becomes available", async () => {
    const { starter } = await startedAfterOracle({ readyTimeoutMs: 1_000 });
    await close(candidate);
    candidate = undefined;
    process.env.DOCKER_STUB_MODE = "candidate-runs";

    const incident = await restartThroughRegistry(starter);

    expect(incident.outcome).toBe("start-not-ready");
    expect(verdictOfGates(incident)).toEqual({ category: "candidate-failure", reason: "start-not-ready" });
  });
});
