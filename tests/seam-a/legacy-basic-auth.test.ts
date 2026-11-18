// Seam A : appels HTTP contre la pile `docker compose up`.
// Prérequis : `docker compose up -d --build --wait` (voir README).
import { describe, expect, it } from "vitest";
import { ROLES } from "../../scripts/users.ts";
import { basicAuthHeader, LEGACY_URL, userWithRole } from "./legacy-client.ts";

describe("legacy page served behind Tomcat BASIC authentication", () => {
  it.each(ROLES)("answers the %s", async (role) => {
    const response = await fetch(`${LEGACY_URL}/`, {
      headers: { Authorization: basicAuthHeader(userWithRole(role)) },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Recherche de dossiers");
  });

  it("refuses a request without credentials with a BASIC challenge, not a login screen", async () => {
    const response = await fetch(`${LEGACY_URL}/`, { redirect: "manual" });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Basic realm="migrabench"/);
  });

  it("refuses a known user with a wrong password", async () => {
    const agent = userWithRole("agent");
    const response = await fetch(`${LEGACY_URL}/`, {
      headers: { Authorization: basicAuthHeader({ ...agent, password: `${agent.password}-wrong` }) },
    });

    expect(response.status).toBe(401);
  });
});
