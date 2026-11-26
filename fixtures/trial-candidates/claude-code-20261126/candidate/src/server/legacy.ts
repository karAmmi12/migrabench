import type { Status } from './contract.js';

/** Dossier tel que l'API interne le renvoie. */
export interface LegacyDossier {
  number: string;
  applicant: string;
  subject: string;
  status: Status;
  filedOn: string; // aaaa-mm-jj
  submittedOn: string | null;
}

export class LegacyError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

/** 404, 409 : réponses métier de l'API interne. Tout le reste est une panne. */
export class LegacyApi {
  constructor(private readonly base: string, private readonly timeoutMs = 10_000) {}

  async search(params: Record<string, string>): Promise<LegacyDossier[]> {
    const query = new URLSearchParams(params).toString();
    const body = await this.call('GET', `/dossiers${query ? `?${query}` : ''}`);
    return (body as { dossiers: LegacyDossier[] }).dossiers;
  }

  read(number: string): Promise<LegacyDossier> {
    return this.call('GET', `/dossiers/${encodeURIComponent(number)}`) as Promise<LegacyDossier>;
  }

  update(number: string, applicant: string, subject: string): Promise<LegacyDossier> {
    return this.call('PUT', `/dossiers/${encodeURIComponent(number)}`, { applicant, subject }) as Promise<LegacyDossier>;
  }

  submit(number: string): Promise<LegacyDossier> {
    return this.call('POST', `/dossiers/${encodeURIComponent(number)}/remise`) as Promise<LegacyDossier>;
  }

  private async call(method: string, path: string, json?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/api${path}`, {
        method,
        headers: json === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json; charset=UTF-8' },
        body: json === undefined ? undefined : JSON.stringify(json),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      });
    } catch (e) {
      throw new LegacyError(502, `API interne injoignable : ${(e as Error).message}`);
    }
    if (res.ok) {
      try { return await res.json(); } catch { throw new LegacyError(502, 'Réponse illisible de l’API interne'); }
    }
    throw new LegacyError(res.status === 404 || res.status === 409 ? res.status : 502, `API interne : HTTP ${res.status}`);
  }
}
