// Requêtes témoins d'une mesure (spec de l'étape 3, « Journal d'accès ») :
// le runner les envoie depuis l'hôte sur le port publié du legacy, puis relit
// le journal d'accès jusqu'à y voir leur ligne. Le contrôle lui-même est la
// fonction pure de runner/access-log.ts.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { witnessPath } from "./access-log.ts";

// Port publié du legacy (docker-compose.yml), seul port journalisé.
const LEGACY_PUBLISHED_URL = "http://127.0.0.1:8080";
// Fichier écrit par la valve d'accès (fixtures/legacy-app/access-log/).
export const ACCESS_LOG_FILE = "access.log";
// Délai pour voir la ligne d'une requête témoin : la valve écrit sans tampon,
// mais après l'envoi de la réponse.
const WITNESS_LINE_TIMEOUT_MS = 5_000;

export interface WitnessResult {
  // Contenu du journal d'accès une fois la ligne vue, ou au bout du délai.
  log: string;
  // Échec de l'envoi (connexion refusée, délai), à joindre à la preuve.
  error?: string;
}

export async function sendWitness(accessLogDir: string, marker: string, name: string): Promise<WitnessResult> {
  const path = witnessPath(marker, name);
  let error: string | undefined;
  try {
    // Le statut ne compte pas (401 sans identifiants) : seule la ligne du journal fait foi.
    await (await fetch(`${LEGACY_PUBLISHED_URL}${path}`, { signal: AbortSignal.timeout(WITNESS_LINE_TIMEOUT_MS) })).arrayBuffer();
  } catch (cause) {
    error = `Witness request ${name} failed: ${String((cause as Error).cause ?? cause)}`;
  }
  const deadline = Date.now() + WITNESS_LINE_TIMEOUT_MS;
  let log = await readAccessLog(accessLogDir);
  while (error === undefined && !log.includes(` ${path} `) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    log = await readAccessLog(accessLogDir);
  }
  return { log, ...(error === undefined ? {} : { error }) };
}

// Journal d'accès de la mesure, vide tant que le legacy n'y a rien écrit.
export async function readAccessLog(accessLogDir: string): Promise<string> {
  try {
    return await readFile(join(accessLogDir, ACCESS_LOG_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}
