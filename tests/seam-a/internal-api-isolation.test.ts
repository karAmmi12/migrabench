// Seam A : l'API interne est servie sur le port 8081, appelée depuis
// mb-internal. Ce port n'est joignable ni depuis l'hôte, ni depuis un
// conteneur du réseau default (ADR 0004, #78). Le filtre par port est une
// pièce du banc, pas un piège : il refuse l'API interne sur le port 8080,
// avec ou sans identifiants.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { basicAuthHeader, LEGACY_URL, legacyFetch, userWithRole } from "./legacy-client.ts";
import {
  callInternalApi,
  fetchFromInternal,
  SCREENS_URL_FROM_INTERNAL,
} from "./internal-api-client.ts";

// D-0001 : dossier partagé en lecture.
const READ_PATH = "/api/dossiers/D-0001";

// Réseau default de la pile (projet Compose `migrabench`), où un conteneur
// lancé par le test, sans mb-internal, essaie de joindre le legacy. L'image
// du service d'archivage fournit le fetch de son Node 22.
const DEFAULT_NETWORK = "migrabench_default";
const PROBE = `
fetch(process.argv[1], { signal: AbortSignal.timeout(5000) }).then(
  (response) => console.log("status " + response.status),
  (error) => console.log("error " + (error.cause?.code ?? error.name)),
);`;

async function fetchFromDefaultNetwork(url: string): Promise<string> {
  const { stdout } = await promisify(execFile)("docker", ["run", "--rm", "--network", DEFAULT_NETWORK, "--entrypoint", "node", "migrabench-archive", "-e", PROBE, url]);
  return stdout.trim();
}

describe("internal API isolation", () => {
  it("serves the internal API on port 8081 from mb-internal", async () => {
    const { status, json } = await callInternalApi("GET", READ_PATH);

    expect(status).toBe(200);
    expect(json).toMatchObject({ number: "D-0001" });
  });

  it("refuses the internal API on port 8080 from mb-internal", async () => {
    const response = await fetchFromInternal(`${SCREENS_URL_FROM_INTERNAL}${READ_PATH}`);

    expect(response.status).toBe(403);
    expect(response.body).not.toContain("D-0001");
  });

  it("refuses the internal API on port 8080 from the host, even with credentials", async () => {
    const response = await legacyFetch(READ_PATH, {
      headers: { Authorization: basicAuthHeader(userWithRole("instructeur")) },
    });

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("D-0001");
  });

  // Témoin : sur une pile dont Tomcat écoute 8081 sur toutes ses interfaces
  // (avant #78), ce conteneur reçoit `status 200`.
  it("does not serve port 8081 to a container on the default network, which still reaches port 8080", async () => {
    expect(await fetchFromDefaultNetwork(`http://legacy:8081${READ_PATH}`)).toBe("error ECONNREFUSED");
    // L'alias qui nomme l'adresse du legacy dans mb-internal n'existe pas sur default.
    expect(await fetchFromDefaultNetwork(`http://legacy-internal-api:8081${READ_PATH}`)).toBe("error ENOTFOUND");
    expect(await fetchFromDefaultNetwork("http://legacy:8080/")).toBe("status 401");
  }, 30_000);

  it("does not publish port 8081 on the host", async () => {
    const legacyHost = new URL(LEGACY_URL);
    legacyHost.port = "8081";

    await expect(fetch(new URL(READ_PATH, legacyHost))).rejects.toThrow();
  });
});
