// Seam A : adresse du legacy et identifiants des deux rôles, partagés par
// les tests HTTP. Prérequis : `docker compose up -d --build --wait` (README).
import { readFileSync } from "node:fs";
import { parseUsers, type Role, type User } from "../../scripts/users.ts";

export const LEGACY_URL = process.env.LEGACY_URL ?? "http://localhost:8080";

const users = parseUsers(
  readFileSync(new URL("../../fixtures/users.json", import.meta.url), "utf8"),
);

export function userWithRole(role: Role): User {
  const user = users.find((entry) => entry.role === role);
  if (!user) throw new Error(`No user with role ${role} in fixtures/users.json`);
  return user;
}

// Tomcat bloque un nom d'utilisateur 5 minutes après 5 échecs consécutifs
// (LockOutRealm de server.xml, laissé en place). Un test de faux identifiants
// vise donc toujours ce nom, absent de fixtures/users.json, jamais l'agent ni
// l'instructeur : il ne peut pas bloquer un compte dont dépendent les autres
// tests, l'oracle ou les portes.
export const UNKNOWN_USER = { username: "inconnu", password: "inconnu-mb" } as const;

if (users.some((user) => user.username === UNKNOWN_USER.username)) {
  throw new Error(`${UNKNOWN_USER.username} must not be a user of fixtures/users.json`);
}

export function basicAuthHeader(user: Pick<User, "username" | "password">): string {
  return `Basic ${Buffer.from(`${user.username}:${user.password}`).toString("base64")}`;
}
