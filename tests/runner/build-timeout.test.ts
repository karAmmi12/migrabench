// Délai global de la construction (#112) : à l'échéance, `docker kill` vise
// le conteneur de l'étape, et chaque essai est gardé dans les bruts. Si le
// client `docker run` ne rend toujours pas la main après le délai de grâce,
// le banc le tue : le délai borne la construction.
//
// Sans Docker : un faux `docker`, placé en tête du PATH, remplace Docker.
// - `run` écrit une ligne, puis attend selon DOCKER_STUB_RUN : `hang`, il
//   ignore SIGTERM et ne rend jamais la main (le client bloqué de #112) ;
//   `killable`, il rend la main dès qu'un `docker kill` a réussi ;
// - `kill` échoue comme sur un conteneur déjà arrêté (`hang`), ou réussit
//   et le note (`killable`) ;
// - `inspect` dit le conteneur démarré, sans OOM.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUILD_CLIENT_GRACE_MS, buildCandidate } from "../../runner/build.ts";

const stubDir = mkdtempSync(join(tmpdir(), "mb-docker-stub-"));
const killed = join(stubDir, "killed");
const NOT_RUNNING = "Error response from daemon: cannot kill container: migrabench-t-fetch: container migrabench-t-fetch is not running";
const savedPath = process.env.PATH;

beforeAll(() => {
  writeFileSync(
    join(stubDir, "docker"),
    `#!/bin/sh
case "$DOCKER_STUB_RUN:$1" in
  "hang:run") echo "up to date in 135ms"; trap '' TERM INT; exec sleep 60 ;;
  "killable:run") echo "up to date in 135ms"; while [ ! -f "${killed}" ]; do sleep 0.1; done; exit 137 ;;
  "hang:kill") echo "${NOT_RUNNING}" >&2; exit 1 ;;
  "killable:kill") touch "${killed}"; echo "$2"; exit 0 ;;
  *:inspect) echo "false 2026-11-25T00:18:18.000000000Z" ;;
esac
exit 0
`,
  );
  chmodSync(join(stubDir, "docker"), 0o755);
  process.env.PATH = `${stubDir}:${savedPath}`;
});

afterAll(() => {
  process.env.PATH = savedPath;
  delete process.env.DOCKER_STUB_RUN;
});

async function timedOutBuild(mode: "hang" | "killable") {
  process.env.DOCKER_STUB_RUN = mode;
  const rawDir = mkdtempSync(join(tmpdir(), "mb-build-timeout-"));
  const copyDir = join(rawDir, "candidate");
  mkdirSync(copyDir);
  writeFileSync(join(copyDir, "package.json"), "{}");
  const result = await buildCandidate({
    measureId: "t",
    image: "migrabench-runtime",
    user: { uid: 501, gid: 20 },
    rawDir,
    copyDir,
    build: undefined,
    limits: { buildTimeoutMs: 300, readyTimeoutMs: 1_000, buildMemoryBytes: 1, buildCpus: 1 },
  });
  return { result, timeoutLog: () => readFileSync(join(rawDir, "fetch-timeout.log"), "utf8") };
}

describe("global build timeout (#112)", () => {
  it("kills a docker run client that does not return after the grace period", async () => {
    const { result, timeoutLog } = await timedOutBuild("hang");
    expect(result.outcome).toEqual({ outcome: "build-timeout", detail: "fetch was stopped: the global build timeout ran out" });
    // Le délai (300 ms) plus la grâce, et non les 60 s du client bloqué.
    expect(result.durationMs).toBeLessThan(300 + BUILD_CLIENT_GRACE_MS + 3_000);
    const log = timeoutLog();
    expect(log).toContain(`docker kill migrabench-t-fetch exited with code 1: ${NOT_RUNNING}`);
    expect(log).toMatch(/docker run client killed with SIGKILL: still running \d+ ms after the timeout\n/);
    expect(result.raw["fetch-timeout.log"]).toMatch(/^sha256:[0-9a-f]{64}$/);
  }, 20_000);

  it("keeps the docker run client when docker kill stops the container", async () => {
    const { result, timeoutLog } = await timedOutBuild("killable");
    expect(result.outcome).toMatchObject({ outcome: "build-timeout" });
    expect(result.durationMs).toBeLessThan(BUILD_CLIENT_GRACE_MS);
    const log = timeoutLog();
    expect(log).toContain("docker kill migrabench-t-fetch exited with code 0: migrabench-t-fetch");
    expect(log).not.toContain("client killed");
  }, 20_000);
});
