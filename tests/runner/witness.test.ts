// Requêtes témoins et clôture du journal d'accès (spec de l'étape 3, « Journal
// d'accès ») : contre un faux legacy HTTP qui écrit sa ligne de journal après
// avoir répondu, comme la valve d'accès de Tomcat.
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { witnessPath } from "../../runner/access-log.ts";
import { ACCESS_LOG_FILE, closeAccessLog, sendWitness } from "../../runner/witness.ts";
import { MEASURES, readFixture, readJsonFixture } from "../real-fixtures.ts";

// Ligne écrite par le faux legacy : la vraie requête témoin start-1 de la
// mesure comptée du candidat de référence (exécution 45624689673, ligne 2 de
// son access.log, tests/fixtures/ci45624689673/PROVENANCE.md), son chemin
// remplacé. Le marqueur est celui de cette mesure.
const MARKER = readJsonFixture<{ marker: string }>(`${MEASURES.reference.results}/measure.json`).marker;
const REAL_LINE = readFixture(`${MEASURES.reference.artifacts}/access.log`).split("\n")[1]!;

function logLine(path: string): string {
  return `${REAL_LINE.replace(witnessPath(MARKER, "start-1"), path)}\n`;
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

// Faux legacy : répond 401, puis écrit la ligne de la requête dans le journal
// vivant après `delayMs`. Rend son adresse et le dossier du journal.
async function fakeLegacy(delayMs: number): Promise<{ legacyUrl: string; accessLogDir: string }> {
  const accessLogDir = mkdtempSync(join(tmpdir(), "mb-access-log-"));
  const server = createServer((request, response) => {
    response.writeHead(401).end();
    setTimeout(() => appendFileSync(join(accessLogDir, ACCESS_LOG_FILE), logLine(request.url ?? "")), delayMs);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { legacyUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, accessLogDir };
}

// Adresse où rien n'écoute : un serveur ouvert puis fermé.
async function closedUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return `http://127.0.0.1:${port}`;
}

const sha256 = (content: string | Buffer) => `sha256:${createHash("sha256").update(content).digest("hex")}`;

describe("sendWitness", () => {
  it("waits for the witness line that the legacy writes after its response", async () => {
    const legacy = await fakeLegacy(300);

    const result = await sendWitness("start-1", { ...legacy, marker: MARKER, timeoutMs: 2_000 });

    expect(result.error).toBeUndefined();
    expect(result.log).toBe(logLine(witnessPath(MARKER, "start-1")));
  });

  it("names the failed witness request when the legacy does not answer, without waiting for a line", async () => {
    const accessLogDir = mkdtempSync(join(tmpdir(), "mb-access-log-"));
    const startedAt = Date.now();

    const result = await sendWitness("end", { accessLogDir, marker: MARKER, legacyUrl: await closedUrl(), timeoutMs: 2_000 });

    expect(result.error).toMatch(/^Witness request end failed: /);
    expect(result.log).toBe("");
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("gives up after its timeout when the line never comes", async () => {
    const legacy = await fakeLegacy(60_000);

    const result = await sendWitness("start-1", { ...legacy, marker: MARKER, timeoutMs: 500 });

    expect(result.error).toBeUndefined();
    expect(result.log).toBe("");
  });
});

describe("closeAccessLog", () => {
  it("cites the access log as checked, frozen in the raw directory, while the legacy keeps writing to the live one", async () => {
    const legacy = await fakeLegacy(50);
    const rawDir = mkdtempSync(join(tmpdir(), "mb-raw-"));
    const live = join(legacy.accessLogDir, ACCESS_LOG_FILE);
    appendFileSync(live, logLine(witnessPath(MARKER, "start-1")));

    const closed = await closeAccessLog({ ...legacy, marker: MARKER, timeoutMs: 2_000, rawDir, startWitnesses: ["start-1"], seamAMarkers: [] });
    // Le healthcheck du legacy écrit encore après la clôture.
    appendFileSync(live, logLine("/"));

    const frozen = readFileSync(join(rawDir, ACCESS_LOG_FILE));
    expect(closed.outcome).toBe("ok");
    expect(frozen.toString()).toBe(logLine(witnessPath(MARKER, "start-1")) + logLine(witnessPath(MARKER, "end")));
    expect(closed.raw).toEqual({ [ACCESS_LOG_FILE]: sha256(frozen) });
    expect(closed.accessLog).toEqual({ log: sha256(frozen), lines: 2, witnesses: [{ name: "start-1", line: 1 }, { name: "end", line: 2 }] });
    expect(sha256(readFileSync(live))).not.toBe(closed.accessLog?.log);
  });

  it("is access-log-inactive with the failed request as evidence, and cites no log, when the legacy never wrote one", async () => {
    const accessLogDir = mkdtempSync(join(tmpdir(), "mb-access-log-"));
    const rawDir = mkdtempSync(join(tmpdir(), "mb-raw-"));

    const closed = await closeAccessLog({ accessLogDir, marker: MARKER, legacyUrl: await closedUrl(), timeoutMs: 500, rawDir, startWitnesses: ["start-1"], seamAMarkers: [] });

    expect(closed.outcome).toBe("access-log-inactive");
    expect(closed.detail).toMatch(/^Witness request end failed: .*\nMissing witness request start-1/s);
    expect(closed.raw).toEqual({});
    expect(closed).not.toHaveProperty("accessLog");
  });
});
