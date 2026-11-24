// Seam A : appels HTTP contre la pile `docker compose up`.
// Prérequis : `docker compose up -d --build --wait` (voir README).
import { describe, expect, it } from "vitest";
import { ROLES } from "../../scripts/users.ts";
import { UNKNOWN_USER } from "../../scripts/users.ts";
import { basicAuthHeader, legacyFetch, userWithRole } from "./legacy-client.ts";

describe("legacy page served behind Tomcat BASIC authentication", () => {
  it.each(ROLES)("answers the %s", async (role) => {
    const response = await legacyFetch(`/`, {
      headers: { Authorization: basicAuthHeader(userWithRole(role)) },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Recherche de dossiers");
  });

  it("refuses a request without credentials with a BASIC challenge, not a login screen", async () => {
    const response = await legacyFetch(`/`, { redirect: "manual" });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Basic realm="migrabench"/);
  });

  it("refuses a user absent from the users file", async () => {
    const response = await legacyFetch(`/`, {
      headers: { Authorization: basicAuthHeader(UNKNOWN_USER) },
    });

    expect(response.status).toBe(401);
  });
});
