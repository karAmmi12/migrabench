// Racine du dépôt et valeurs du banc, partagées par l'oracle et le runner.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

// Racine du dépôt, sans barre finale.
export const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");

// Bruts (traces, HAR, sorties), un dossier par exécution complète de l'oracle
// ou par mesure, ignoré par Git (ADR 0005).
export const ARTIFACTS_DIR_FROM_ROOT = ".oracle-artifacts";

// Valeurs du banc de .env (horloge figée, valeur témoin).
export async function readBenchEnv(): Promise<Record<string, string | undefined>> {
  return parseEnv(await readFile(join(ROOT, ".env"), "utf8"));
}
