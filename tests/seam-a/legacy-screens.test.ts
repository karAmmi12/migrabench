// Seam A : chaque écran du legacy répond aux deux rôles et refuse une
// requête sans identifiants. Les comportements fins des écrans relèvent de
// l'oracle (spec de l'étape 1, « Décisions de test »).
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

// Dossier partagé en lecture : ces tests ne font que des GET.
const SCREENS = [
  { name: "dossier sheet", path: "/fiche.do?number=D-0001", title: "Fiche dossier" },
] as const;

describe.each(SCREENS)("$name screen", ({ path, title }) => {
  it.each(ROLES)("answers the %s", async (role) => {
    const response = await fetch(`${LEGACY_URL}${path}`, {
      headers: { Authorization: basicAuthHeader(userWithRole(role)) },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(title);
  });

  it("refuses a request without credentials", async () => {
    const response = await fetch(`${LEGACY_URL}${path}`, { redirect: "manual" });

    expect(response.status).toBe(401);
  });
});
