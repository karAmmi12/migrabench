// Requêtes témoins d'une mesure (spec de l'étape 3, « Journal d'accès ») :
// le runner les envoie depuis l'hôte sur le port publié du legacy, puis relit
// le journal d'accès jusqu'à y voir leur ligne. À la clôture, il contrôle le
// journal et le fige dans le dossier des bruts. Le contrôle lui-même est la
// fonction pure de runner/access-log.ts.
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { citedFileSha256 as digestOf } from "../shared/digest.ts";
import { type AccessLogCheck, checkAccessLog, isWitnessLine, witnessPath } from "./access-log.ts";
import type { AccessLogRecord } from "./measure-record.ts";

// Port publié du legacy (docker-compose.yml), seul port journalisé.
const LEGACY_PUBLISHED_URL = "http://127.0.0.1:8080";
// Fichier écrit par la valve d'accès (fixtures/legacy-app/access-log/), et
// nom du journal figé dans le dossier des bruts.
export const ACCESS_LOG_FILE = "access.log";
// Délai pour voir la ligne d'une requête témoin : la valve écrit sans tampon,
// mais après l'envoi de la réponse.
const WITNESS_LINE_TIMEOUT_MS = 5_000;

export interface WitnessOptions {
  // Dossier du journal d'accès vivant, monté dans le legacy.
  accessLogDir: string;
  marker: string;
  // Adresse du legacy et délai : ceux du banc par défaut, remplacés par les tests.
  legacyUrl?: string;
  timeoutMs?: number;
}

export interface WitnessResult {
  // Contenu du journal d'accès une fois la ligne vue, ou au bout du délai.
  log: string;
  // Échec de l'envoi (connexion refusée, délai), à joindre à la preuve.
  error?: string;
}

export async function sendWitness(name: string, { accessLogDir, marker, legacyUrl = LEGACY_PUBLISHED_URL, timeoutMs = WITNESS_LINE_TIMEOUT_MS }: WitnessOptions): Promise<WitnessResult> {
  let error: string | undefined;
  try {
    // Le statut ne compte pas (401 sans identifiants) : seule la ligne du journal fait foi.
    await (await fetch(`${legacyUrl}${witnessPath(marker, name)}`, { signal: AbortSignal.timeout(timeoutMs) })).arrayBuffer();
  } catch (cause) {
    error = `Witness request ${name} failed: ${String((cause as Error).cause ?? cause)}`;
  }
  const deadline = Date.now() + timeoutMs;
  const seen = (content: string) => content.split("\n").some((entry) => isWitnessLine(entry, marker, name));
  let log = await readAccessLog(accessLogDir);
  while (error === undefined && !seen(log) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    log = await readAccessLog(accessLogDir);
  }
  return { log, ...(error === undefined ? {} : { error }) };
}

export interface ClosedAccessLog {
  outcome: AccessLogCheck["outcome"];
  // Empreinte du journal figé, sous son chemin dans le dossier des bruts.
  raw: Record<string, string>;
  // Absent si le legacy n'a jamais créé son journal.
  accessLog?: AccessLogRecord;
  // Preuve d'une issue autre que `ok`.
  detail?: string;
}

// Clôture : requête témoin de fin, contrôle du journal, et journal figé dans
// `rawDir`. Le legacy reste en marche après la mesure et continue d'écrire
// dans son journal vivant (healthcheck) : le brut cité est le journal tel
// qu'il a été contrôlé.
export async function closeAccessLog(
  options: WitnessOptions & { rawDir: string; startWitnesses: readonly string[]; seamAMarkers: readonly string[] },
): Promise<ClosedAccessLog> {
  const { rawDir, startWitnesses, seamAMarkers, accessLogDir, marker } = options;
  const witness = await sendWitness("end", options);
  const check = checkAccessLog({ log: witness.log, marker, expected: [...startWitnesses, "end"], seamAMarkers });
  const closed: ClosedAccessLog = { outcome: check.outcome, raw: {} };
  if (await isFile(join(accessLogDir, ACCESS_LOG_FILE))) {
    const closedLog = join(rawDir, ACCESS_LOG_FILE);
    await writeFile(closedLog, witness.log);
    const log = await digestOf(closedLog);
    closed.raw[ACCESS_LOG_FILE] = log;
    closed.accessLog = { log, lines: check.lines, witnesses: check.witnesses };
  }
  if (check.outcome !== "ok") closed.detail = witnessEvidence(witness, check);
  return closed;
}

// Preuve d'un journal d'accès en défaut : l'échec de l'envoi de la requête
// témoin, s'il y en a eu un, puis les lignes du journal.
export function witnessEvidence(witness: WitnessResult, check: Exclude<AccessLogCheck, { outcome: "ok" }>): string {
  return witness.error === undefined ? check.evidence : `${witness.error}\n${check.evidence}`;
}

// Journal d'accès vivant, vide tant que le legacy n'y a rien écrit.
async function readAccessLog(accessLogDir: string): Promise<string> {
  try {
    return await readFile(join(accessLogDir, ACCESS_LOG_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
