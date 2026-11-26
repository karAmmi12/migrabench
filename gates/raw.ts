// Bruts d'une porte (ADR 0005) : écrits dans le dossier des bruts de la
// mesure, sous `gates/<porte>/`, et cités par leur empreinte sous ce chemin.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { citedFileSha256 } from "../shared/digest.ts";

export async function saveGateRaw(rawDir: string, gate: string, file: string, content: string): Promise<[path: string, digest: string]> {
  const path = `gates/${gate}/${file}`;
  const absolute = join(rawDir, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
  return [path, await citedFileSha256(absolute)];
}
