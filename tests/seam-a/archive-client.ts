// Seam A : adresse du service d'archivage et valeur témoin, partagées par les
// tests HTTP. Prérequis : `docker compose up -d --build --wait` (README).
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export const ARCHIVE_URL = process.env.ARCHIVE_URL ?? "http://localhost:8090";

// Valeur témoin injectée par le banc dans le legacy et le service d'archivage,
// lue dans le .env que lit aussi docker compose.
export const ARCHIVE_TOKEN = archiveTokenOf(
  parseEnv(readFileSync(new URL("../../.env", import.meta.url), "utf8")),
);

function archiveTokenOf(env: NodeJS.Dict<string>): string {
  const token = env.ARCHIVE_TOKEN;
  if (token === undefined || token === "") throw new Error("ARCHIVE_TOKEN is missing from .env");
  return token;
}

export function receiptUrl(query: { jeton?: string; numero?: string }): string {
  const url = new URL("/accuse-de-remise", ARCHIVE_URL);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  return url.href;
}
