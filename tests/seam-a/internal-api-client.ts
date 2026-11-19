// Seam A : appels à l'API interne du legacy depuis le réseau mb-internal.
// L'hôte ne joint pas ce réseau (ADR 0004) : la requête part du conteneur du
// service d'archivage, seul service du banc branché dessus aujourd'hui, avec
// le fetch de son Node 22. Prérequis : `docker compose up -d --build --wait`.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Adresse vue depuis mb-internal, la même que LEGACY_API_URL pour la couche
// serveur du candidat (ADR 0004).
export const INTERNAL_API_URL = "http://legacy:8081";

// Mêmes JSP et même API, par le port 8080 vu depuis mb-internal.
export const SCREENS_URL_FROM_INTERNAL = "http://legacy:8080";

export interface InternalResponse {
  status: number;
  body: string;
}

export interface InternalRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

// Exécuté dans le conteneur : argv = [node, url, request JSON].
const PROBE = `
const [url, request] = process.argv.slice(1);
fetch(url, JSON.parse(request)).then(
  async (response) => console.log(JSON.stringify({ status: response.status, body: await response.text() })),
  (error) => { console.error(String(error.cause ?? error)); process.exit(2); },
);`;

const execFileAsync = promisify(execFile);

/** Requête HTTP émise depuis mb-internal. Rejette si la connexion échoue. */
export async function fetchFromInternal(url: string, request: InternalRequest = {}): Promise<InternalResponse> {
  const { stdout } = await execFileAsync("docker", [
    "compose", "exec", "-T", "archive", "node", "-e", PROBE, url, JSON.stringify(request),
  ]);
  return JSON.parse(stdout) as InternalResponse;
}

/** Appel JSON à l'API interne par le port 8081, depuis mb-internal. */
export async function callInternalApi(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  const response = await fetchFromInternal(`${INTERNAL_API_URL}${path}`, {
    method,
    ...(body === undefined
      ? { headers }
      : { headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  return { status: response.status, json: response.body === "" ? undefined : JSON.parse(response.body) };
}
