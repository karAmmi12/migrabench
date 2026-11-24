// Seam A : adresse du legacy et identifiants des deux rôles, partagés par
// les tests HTTP. Prérequis : `docker compose up -d --build --wait` (README).
import { readFileSync } from "node:fs";
import { inject } from "vitest";
import { seamAUserAgent } from "../../shared/seam-a-marker.ts";
import { parseUsersWithoutUnknown, type Role, type User } from "../../scripts/users.ts";

export const LEGACY_URL = process.env.LEGACY_URL ?? "http://localhost:8080";

// Marqueur du Seam A de cette exécution de `npm test` (tests/seam-a-marker.setup.ts).
export const SEAM_A_MARKER = inject("seamAMarker");

// En-tête que porte chaque requête des tests du Seam A vers le legacy : une
// mesure qui le trouve dans son journal d'accès est invalide (#67).
export const SEAM_A_HEADERS = { "User-Agent": seamAUserAgent(SEAM_A_MARKER) };

/** `fetch` vers le legacy, `path` relatif à LEGACY_URL, avec le marqueur du Seam A. */
export function legacyFetch(path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
  return fetch(`${LEGACY_URL}${path}`, { ...init, headers: { ...SEAM_A_HEADERS, ...init.headers } });
}

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
