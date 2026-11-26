// Composition complémentaire du service `candidate`, générée pour chaque
// mesure (spec de l'étape 3, « Exécution du candidat » ; ADR 0007).
import { describe, expect, it } from "vitest";
import { candidateCompose } from "../../runner/candidate-compose.ts";

const INPUT = {
  image: "migrabench-runtime",
  user: { uid: 501, gid: 20 },
  port: 8100,
  copyDir: "/repo/.oracle-artifacts/20261123T090507Z-454fb76-reference-candidate/candidate",
  usersFile: "/repo/fixtures/users.json",
  start: "node server.js",
  archiveToken: "mbtemoin-test",
  limits: { memoryBytes: 665_845_760, cpus: 1.5, pids: 256 },
};

function service() {
  return candidateCompose(INPUT).services.candidate;
}

describe("candidateCompose", () => {
  it("runs the declared start command with sh -c, from the bench runtime image, never pulled", () => {
    expect(service().image).toBe("migrabench-runtime");
    expect(service().pull_policy).toBe("never");
    expect(service().command).toEqual(["sh", "-c", "node server.js"]);
  });

  it("runs as the given non-root user", () => {
    expect(service().user).toBe("501:20");
  });

  it("mounts the candidate copy read-only as the working directory, with a writable temporary directory", () => {
    expect(service().working_dir).toBe("/candidate");
    expect(service().volumes).toContain(`${INPUT.copyDir}:/candidate:ro`);
    expect(service().tmpfs).toEqual(["/tmp"]);
  });

  it("mounts USERS_FILE read-only", () => {
    expect(service().volumes).toContain("/repo/fixtures/users.json:/run/migrabench/users.json:ro");
    expect(service().environment.USERS_FILE).toBe("/run/migrabench/users.json");
  });

  it("publishes the imposed port on 127.0.0.1 only and passes it in PORT", () => {
    expect(service().ports).toEqual(["127.0.0.1:8100:8100"]);
    expect(service().environment.PORT).toBe("8100");
  });

  it("passes the start variables of ADR 0004, and never the salt", () => {
    expect(service().environment).toEqual({
      PORT: "8100",
      LEGACY_API_URL: "http://legacy-internal-api:8081",
      ARCHIVE_URL: "http://archive:8090",
      ARCHIVE_TOKEN: "mbtemoin-test",
      USERS_FILE: "/run/migrabench/users.json",
    });
  });

  it("joins mb-internal and default", () => {
    expect(service().networks).toEqual(["default", "mb-internal"]);
  });

  it("applies the memory, CPU and process limits, with no swap beyond the memory limit", () => {
    expect(service().mem_limit).toBe(665_845_760);
    expect(service().memswap_limit).toBe(665_845_760);
    expect(service().cpus).toBe(1.5);
    expect(service().pids_limit).toBe(256);
  });

  it("grants no extra privilege: every capability dropped, no new privileges", () => {
    expect(service().cap_drop).toEqual(["ALL"]);
    expect(service().security_opt).toEqual(["no-new-privileges:true"]);
    expect(service()).not.toHaveProperty("privileged");
    expect(service()).not.toHaveProperty("cap_add");
  });

  it("mounts nothing but the candidate copy and USERS_FILE, so never the Docker socket", () => {
    expect(service().volumes).toEqual([`${INPUT.copyDir}:/candidate:ro`, "/repo/fixtures/users.json:/run/migrabench/users.json:ro"]);
  });
});
