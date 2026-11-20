// Seam A : l'API interne est servie sur le port 8081, appelée depuis
// mb-internal, et ce port n'est pas joignable depuis l'hôte (ADR 0004, qui
// note aussi la limite du réseau default). Le filtre par port est une pièce
// du banc, pas un piège : il refuse l'API interne sur le port 8080, avec ou
// sans identifiants.
import { describe, expect, it } from "vitest";
import { basicAuthHeader, LEGACY_URL, userWithRole } from "./legacy-client.ts";
import {
  callInternalApi,
  fetchFromInternal,
  SCREENS_URL_FROM_INTERNAL,
} from "./internal-api-client.ts";

// D-0001 : dossier partagé en lecture.
const READ_PATH = "/api/dossiers/D-0001";

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
    const response = await fetch(`${LEGACY_URL}${READ_PATH}`, {
      headers: { Authorization: basicAuthHeader(userWithRole("instructeur")) },
    });

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("D-0001");
  });

  it("does not publish port 8081 on the host", async () => {
    const legacyHost = new URL(LEGACY_URL);
    legacyHost.port = "8081";

    await expect(fetch(new URL(READ_PATH, legacyHost))).rejects.toThrow();
  });
});
