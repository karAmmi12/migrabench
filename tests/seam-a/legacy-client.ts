// Seam A : adresse du legacy et identifiants des deux rôles, partagés par
// les tests HTTP. Prérequis : `docker compose up -d --build --wait` (README).
import { readFileSync } from "node:fs";
import { parseUsersWithoutUnknown, type Role, type User } from "../../scripts/users.ts";

export const LEGACY_URL = process.env.LEGACY_URL ?? "http://localhost:8080";

const users = parseUsersWithoutUnknown(
  readFileSync(new URL("../../fixtures/users.json", import.meta.url), "utf8"),
);

export function userWithRole(role: Role): User {
  const user = users.find((entry) => entry.role === role);
  if (!user) throw new Error(`No user with role ${role} in fixtures/users.json`);
  return user;
}

export function basicAuthHeader(user: Pick<User, "username" | "password">): string {
  return `Basic ${Buffer.from(`${user.username}:${user.password}`).toString("base64")}`;
}
