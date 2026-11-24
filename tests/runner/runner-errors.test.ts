// Erreurs imprévues du runner (spec de l'étape 3, règle
// `runner-error-before-candidate`, « Codes de sortie », #68) : rangées dans
// une mesure, invalide avant le lancement de `npm ci`, panne pendant que le
// candidat tourne ensuite, avec l'erreur en détail. Le code 1 reste celui de
// ce qui ne peut pas être rangé.
//
// Sans la pile : un faux `docker`, placé en tête du PATH, remplace Docker,
// comme dans tests/runner/stack-not-from-this-copy.test.ts. Il rend pour les
// images de la pile le label de cette copie, réussit tout appel qu'il ne
// connaît pas sans rien faire, et échoue sur l'appel que nomme
// DOCKER_STUB_FAIL. Playwright, lui, est le vrai : il liste les scénarios.
//
// Le verrou du banc est pris dans un XDG_STATE_HOME temporaire (#92).
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stackContextDigests } from "../../oracle/stack-images.ts";
import { DIAGNOSTIC_DIR_FROM_ROOT } from "../../runner/paths.ts";
import { ARTIFACTS_DIR_FROM_ROOT, ROOT } from "../../shared/root.ts";

const STATE_HOME = mkdtempSync(join(tmpdir(), "mb-state-"));
const stubDir = mkdtempSync(join(tmpdir(), "mb-docker-stub-"));
const DOCKER_ERROR = "docker: Error response from daemon: No such image: migrabench-runtime:latest.";

function entries(): string[] {
  return [DIAGNOSTIC_DIR_FROM_ROOT, ARTIFACTS_DIR_FROM_ROOT].flatMap((dir) =>
    existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).map((name) => join(dir, name)) : [],
  );
}

const before = entries();

beforeAll(async () => {
  const digests = await stackContextDigests();
  const image = (service: "legacy" | "archive") =>
    `echo '{"image":"sha256:${"a".repeat(64)}","labels":{"org.migrabench.context-digest":"${digests[service]}"}}'; exit 0 ;;`;
  writeFileSync(
    join(stubDir, "docker"),
    `#!/bin/sh
case "$DOCKER_STUB_FAIL:$*" in
  "info:info "*) echo "Cannot connect to the Docker daemon" >&2; exit 97 ;;
  "fetch-125:run --name "*-fetch" "*|"install-125:run --name "*-install" "*) echo "${DOCKER_ERROR}" >&2; exit 125 ;;
  "fetch-125:inspect "*|"install-125:inspect "*-install) echo "Error: No such object" >&2; exit 1 ;;
  "stack-up:compose up "*|"stack-up:compose ps "*) echo "docker stub: stack-up" >&2; exit 97 ;;
esac
case "$*" in
  "info "*) echo 8 ;;
  "image inspect "*migrabench-runtime) echo "sha256:${"r".repeat(64)}" ;;
  "image inspect "*migrabench-legacy) ${image("legacy")}
  "image inspect "*migrabench-archive) ${image("archive")}
  "inspect --format "*) echo "false 2026-11-24T21:00:00.000000000Z" ;;
esac
exit 0
`,
  );
  chmodSync(join(stubDir, "docker"), 0o755);
});

afterAll(() => {
  for (const entry of entries()) if (!before.includes(entry)) rmSync(join(ROOT, entry), { recursive: true, force: true });
  rmSync(STATE_HOME, { recursive: true, force: true });
  rmSync(stubDir, { recursive: true, force: true });
});

// Mesure du candidat de référence sous le faux `docker` : code de sortie et measure.json.
// Chaque mesure démarre dans une nouvelle seconde : l'identifiant de la
// mesure est horodaté à la seconde, et un dossier de mesure n'est jamais réécrit.
function measure(fail: string) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_010 - (Date.now() % 1_000));
  const seen = entries();
  const { ORACLE_SALT: _oracleSalt, ...inherited } = process.env;
  const { status, stderr } = spawnSync(process.execPath, ["runner/cli.ts", "measure", "--candidate", "fixtures/reference-candidate"], {
    cwd: ROOT,
    env: { ...inherited, PATH: `${stubDir}:${process.env.PATH}`, XDG_STATE_HOME: STATE_HOME, DOCKER_STUB_FAIL: fail },
    encoding: "utf8",
  });
  const written = entries().filter((entry) => !seen.includes(entry) && entry.startsWith(DIAGNOSTIC_DIR_FROM_ROOT));
  if (written.length !== 1) throw new Error(`Expected one measure, found ${written.length} (exit code ${status}): ${stderr}`);
  const record = JSON.parse(readFileSync(join(ROOT, written[0]!, "measure.json"), "utf8"));
  const phases = record.phases.map(({ name, outcome }: { name: string; outcome: string }) => `${name}:${outcome}`);
  const detail = (name: string) => record.phases.find((entry: { name: string }) => entry.name === name)?.detail as string | undefined;
  return { status, record, phases, detail };
}

describe("unexpected runner errors", { timeout: 120_000 }, () => {
  it("make the measure invalid, runner-error-before-candidate, exit code 3, when they happen in the preparation", () => {
    const { status, record, phases } = measure("info");

    expect(status).toBe(3);
    expect(record.verdict).toMatchObject({ category: "invalid", reason: "runner-error-before-candidate" });
    expect(record.verdict.evidence).toContain("Cannot connect to the Docker daemon");
    expect(phases).toEqual(["preparation:runner-error-before-candidate", "contract:not-run", "build:not-run", "start:not-run", "oracle:not-run", "gates:not-run", "closing:ok"]);
    expect(record.oracle).toMatchObject({ executed: false, summary: { unreached: 38 } });
  });

  it("make the measure invalid when Docker never starts the fetch container: npm ci was not launched", () => {
    const { status, record, phases } = measure("fetch-125");

    expect(status).toBe(3);
    expect(record.verdict).toMatchObject({ category: "invalid", reason: "runner-error-before-candidate" });
    expect(record.verdict.evidence).toContain(DOCKER_ERROR);
    expect(phases.slice(0, 3)).toEqual(["preparation:ok", "contract:ok", "build:runner-error-before-candidate"]);
  });

  it("count as a stack failure while the candidate runs, exit code 0, once npm ci was launched", () => {
    const { status, record, phases, detail } = measure("install-125");

    expect(status).toBe(0);
    expect(record.verdict).toEqual({ category: "stack-down-while-candidate", reason: "stack-down-while-candidate" });
    expect(phases.slice(0, 4)).toEqual(["preparation:ok", "contract:ok", "build:stack-down-while-candidate", "start:not-run"]);
    expect(detail("build")).toContain(DOCKER_ERROR);
  });

  it("count an error thrown after npm ci as a stack failure while the candidate runs, with the error in detail", () => {
    const { status, record, phases, detail } = measure("stack-up");

    expect(status).toBe(0);
    expect(record.verdict).toEqual({ category: "stack-down-while-candidate", reason: "stack-down-while-candidate" });
    expect(phases).toEqual(["preparation:ok", "contract:ok", "build:ok", "start:stack-down-while-candidate", "oracle:not-run", "gates:not-run", "closing:ok"]);
    expect(detail("start")).toContain("docker stub: stack-up");
    expect(record.oracle).toMatchObject({ executed: false, summary: { unreached: 38 } });
  });
});
