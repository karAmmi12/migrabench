// Empreinte SHA-256, seul calcul d'empreinte du banc : fichiers bruts,
// résultats et contenu d'un candidat.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// Empreinte en hexadécimal.
export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function fileSha256(path: string): Promise<string> {
  return sha256(await readFile(path));
}

// Forme citée dans un résultat : `sha256:<hexadécimal>`.
export function cited(hex: string): string {
  return `sha256:${hex}`;
}

// Mesure des minutes de CI (#76) : commit de code jetable, hors oracle/.
// Deuxième commit de code jetable (#76), annulé par le commit docs suivant.
