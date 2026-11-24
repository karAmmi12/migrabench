// État des services de la pile (spec de l'étape 3, règles
// `stack-failed-before-candidate` et `stack-down-while-candidate`, #68) :
// fonctions pures sur la sortie de `docker inspect`. Les objets ci-dessous
// reprennent les champs de `docker inspect` relevés le 24/11/2026 dans la
// session de #68 (Docker Desktop, conteneurs migrabench-legacy-1 sain, puis
// arrêté par `docker stop`).
import { describe, expect, it } from "vitest";
import { describeStack, isHealthy, serviceState, stackDown } from "../../oracle/stack-state.ts";

const LEGACY_ID = "4f3c2b1a0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b";
const ARCHIVE_ID = "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b";

function inspected(id: string, state: Record<string, unknown>, restartCount = 0) {
  return {
    Id: id,
    RestartCount: restartCount,
    State: {
      Status: "running",
      Running: true,
      Restarting: false,
      ExitCode: 0,
      Error: "",
      StartedAt: "2026-11-24T20:42:29.410857305Z",
      Health: { Status: "healthy", Log: [{ ExitCode: 0, Output: "" }] },
      ...state,
    },
  };
}

const healthy = [serviceState("legacy", inspected(LEGACY_ID, {})), serviceState("archive", inspected(ARCHIVE_ID, {}))];

describe("stackDown", () => {
  it("finds nothing when both services run in the same containers, healthy, never restarted", () => {
    const after = [serviceState("legacy", inspected(LEGACY_ID, {})), serviceState("archive", inspected(ARCHIVE_ID, {}))];

    expect(stackDown(healthy, after)).toBeUndefined();
  });

  it("names a stopped service, with its state", () => {
    const after = [
      serviceState("legacy", inspected(LEGACY_ID, { Status: "exited", Running: false, ExitCode: 143, Health: { Status: "unhealthy", Log: [] } })),
      serviceState("archive", inspected(ARCHIVE_ID, {})),
    ];

    expect(stackDown(healthy, after)).toEqual({
      services: ["legacy"],
      detail: "legacy is down: not running. legacy: container 4f3c2b1a0e9d exited, exit code 143, health unhealthy, started 2026-11-24T20:42:29.410857305Z, restarts 0",
    });
  });

  it("names a service that restarted, even if it is healthy again", () => {
    const after = [
      serviceState("legacy", inspected(LEGACY_ID, {})),
      serviceState("archive", inspected(ARCHIVE_ID, { StartedAt: "2026-11-24T20:50:00.000000000Z" }, 1)),
    ];

    expect(stackDown(healthy, after)?.services).toEqual(["archive"]);
    expect(stackDown(healthy, after)?.detail).toMatch(/^archive is down: restarted\. archive: container 9a8b7c6d5e4f running/);
  });

  it("names a service whose container was replaced or removed", () => {
    const replaced = [serviceState("legacy", inspected("1".repeat(64), {})), serviceState("archive", undefined)];

    expect(stackDown(healthy, replaced)).toEqual({
      services: ["legacy", "archive"],
      detail: [
        "legacy is down: container replaced. legacy: container 111111111111 running, exit code 0, health healthy, started 2026-11-24T20:42:29.410857305Z, restarts 0",
        "archive is down: no container. archive: no container",
      ].join("\n"),
    });
  });

  it("names a running service that is not healthy", () => {
    const after = [serviceState("legacy", inspected(LEGACY_ID, { Health: { Status: "unhealthy", Log: [{ ExitCode: 1, Output: "000\n" }] } })), healthy[1]!];

    expect(stackDown(healthy, after)?.detail).toBe(
      "legacy is down: unhealthy. legacy: container 4f3c2b1a0e9d running, exit code 0, health unhealthy, started 2026-11-24T20:42:29.410857305Z, restarts 0; last health check: exit 1: 000",
    );
  });
});

describe("describeStack", () => {
  it("describes each service, with its last health checks, as the evidence of a stack that did not become healthy", () => {
    const states = [
      serviceState("legacy", inspected(LEGACY_ID, { Health: { Status: "unhealthy", Log: [{ ExitCode: 1, Output: "first" }, { ExitCode: 1, Output: "second\n" }] } })),
      serviceState("archive", inspected(ARCHIVE_ID, {})),
    ];

    expect(describeStack(states)).toBe(
      [
        "legacy: container 4f3c2b1a0e9d running, exit code 0, health unhealthy, started 2026-11-24T20:42:29.410857305Z, restarts 0; last health check: exit 1: second",
        "archive: container 9a8b7c6d5e4f running, exit code 0, health healthy, started 2026-11-24T20:42:29.410857305Z, restarts 0",
      ].join("\n"),
    );
  });
});

describe("isHealthy", () => {
  it("is true only when every service runs and is healthy: a failed recreation is not a stack failure without that evidence", () => {
    expect(isHealthy(healthy)).toBe(true);
    expect(isHealthy([healthy[0]!, serviceState("archive", undefined)])).toBe(false);
    expect(isHealthy([serviceState("legacy", inspected(LEGACY_ID, { Health: { Status: "starting", Log: [] } })), healthy[1]!])).toBe(false);
    expect(isHealthy([serviceState("legacy", inspected(LEGACY_ID, { Status: "exited", Running: false })), healthy[1]!])).toBe(false);
  });
});
