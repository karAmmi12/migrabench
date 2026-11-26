import type { ApiError, DossierView, ResultRow } from '../server/contract';

export type Outcome<T> = { ok: true; data: T } | { ok: false; status: number; errors: string[]; dossier?: DossierView };

async function call<T>(method: string, url: string, body?: unknown): Promise<Outcome<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: method === 'GET' ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'dossiers' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    const err = (json ?? {}) as Partial<ApiError>;
    return { ok: false, status: res.status, errors: err.errors ?? ['Le service des dossiers est momentanément indisponible.'], dossier: err.dossier };
  } catch {
    return { ok: false, status: 0, errors: ['Le service des dossiers est momentanément indisponible.'] };
  }
}

export const search = (query: string) => call<{ results: ResultRow[] }>('GET', `/api/dossiers${query}`);
export const readDossier = (number: string) => call<DossierView>('GET', `/api/dossiers/${encodeURIComponent(number)}`);
export const saveDossier = (number: string, applicant: string, subject: string) =>
  call<DossierView>('PUT', `/api/dossiers/${encodeURIComponent(number)}`, { applicant, subject });
export const submitDossier = (number: string) => call<DossierView>('POST', `/api/dossiers/${encodeURIComponent(number)}/remise`);
