// Seam A : appels HTTP contre la pile `docker compose up`.
// Prérequis : `docker compose up -d --build --wait` (voir README).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseUsers, ROLES, type Role, type User } from "../../scripts/users.ts";

const LEGACY_URL = process.env.LEGACY_URL ?? "http://localhost:8080";

const users = parseUsers(
  readFileSync(new URL("../../fixtures/users.json", import.meta.url), "utf8"),
);

function userWithRole(role: Role): User {
  const user = users.find((entry) => entry.role === role);
  if (!user) throw new Error(`No user with role ${role} in fixtures/users.json`);
  return user;
}

function basicAuthHeader(user: User): string {
  return `Basic ${Buffer.from(`${user.username}:${user.password}`).toString("base64")}`;
}

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
