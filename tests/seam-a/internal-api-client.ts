// Seam A : appels à l'API interne du legacy depuis le réseau mb-internal.
// L'hôte ne joint pas ce réseau (ADR 0004) : la requête part du conteneur du
// service d'archivage, seul service du banc branché dessus aujourd'hui, avec
// le fetch de son Node 22. Prérequis : `docker compose up -d --build --wait`.
import { fetchFromInternal as fetchUnmarked, INTERNAL_API_URL, type InternalRequest, type InternalResponse } from "../../shared/internal-api.ts";
import { SEAM_A_HEADERS } from "./legacy-client.ts";

export { INTERNAL_API_URL, type InternalRequest, type InternalResponse };

// Mêmes JSP et même API, par le port 8080 vu depuis mb-internal.
export const SCREENS_URL_FROM_INTERNAL = "http://legacy:8080";

/** Requête HTTP émise depuis mb-internal, avec le marqueur du Seam A.
 * Rejette si la connexion échoue. */
export async function fetchFromInternal(url: string, request: InternalRequest = {}): Promise<InternalResponse> {
  return fetchUnmarked(url, { ...request, headers: { ...SEAM_A_HEADERS, ...request.headers } });
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
