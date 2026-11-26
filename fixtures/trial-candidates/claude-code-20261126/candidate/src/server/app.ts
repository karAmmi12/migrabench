import { join } from 'node:path';
import { Readable } from 'node:stream';
import express, { type NextFunction, type Request, type Response } from 'express';
import { basicAuth, loadUsers, type User } from './auth.js';
import type { Config } from './config.js';
import type { ApiError, DossierView, ResultRow, Status } from './contract.js';
import { LegacyApi, LegacyError, type LegacyDossier } from './legacy.js';
import { messages } from './messages.js';
import { parseScreenDate, validateDossier, validateSearch } from './validation.js';

const STATUS_LABELS: Record<Status, string> = {
  BROUILLON: 'Brouillon',
  EN_INSTRUCTION: 'En instruction',
  REMIS: 'Remis',
};

const screenDate = (iso: string): string => iso.split('-').reverse().join('/');

export function toRow(d: LegacyDossier): ResultRow {
  return { number: d.number, applicant: d.applicant, subject: d.subject, statusLabel: STATUS_LABELS[d.status], filedOn: screenDate(d.filedOn) };
}

export function toView(d: LegacyDossier, user: User): DossierView {
  const applicantLocked = d.status !== 'BROUILLON';
  const subjectLocked = d.status === 'REMIS';
  return {
    number: d.number,
    applicant: d.applicant,
    subject: d.subject,
    status: d.status,
    statusLabel: STATUS_LABELS[d.status],
    filedOn: screenDate(d.filedOn),
    submittedOn: d.submittedOn ? screenDate(d.submittedOn) : null,
    applicantLocked,
    subjectLocked,
    editable: !applicantLocked || !subjectLocked,
    submissionLinked: d.status === 'EN_INSTRUCTION' || d.status === 'REMIS',
    canSubmit: d.status === 'EN_INSTRUCTION' && user.role === 'instructeur',
  };
}

/** Une seule valeur de chaîne par paramètre, comme Struts ; absent = vide. */
const param = (req: Request, name: string): string => {
  const v = req.query[name];
  return typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : '';
};

const PAGES = ['/', '/index.jsp', '/recherche.do', '/rechercher.do', '/fiche.do', '/remise.do'];
const NUMBER = /^[^/\\?#%\u0000-\u001f]{1,64}$/;

export function createApp(config: Config) {
  const legacy = new LegacyApi(config.legacyApiUrl);
  const users = loadUsers(config.usersFile);
  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });
  app.use(basicAuth(users));

  const api = express.Router();
  api.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  // Protection CSRF : l'authentification BASIC est envoyée automatiquement par le navigateur ;
  // un en-tête personnalisé impose une requête de même origine (pas de CORS accordé).
  api.use((req, res, next) => {
    if (req.method !== 'GET' && req.get('X-Requested-With') !== 'dossiers') {
      res.status(403).json({ errors: ['Requête refusée.'] } satisfies ApiError);
      return;
    }
    next();
  });

  const failure = (res: Response, e: unknown, ctx?: { user: User; number: string }) => {
    if (e instanceof LegacyError) {
      if (e.status === 404) return res.status(404).json({ errors: [messages.notFound] } satisfies ApiError);
      if (e.status === 409) return res.status(409).json({ errors: [ctx ? messages.notSubmittable : messages.locked] } satisfies ApiError);
    }
    console.error(e instanceof Error ? e.message : e);
    return res.status(502).json({ errors: [messages.unavailable] } satisfies ApiError);
  };
  const withNumber = (req: Request, res: Response): string | null => {
    const number = String(req.params.number);
    if (NUMBER.test(number)) return number;
    res.status(404).json({ errors: [messages.notFound] } satisfies ApiError);
    return null;
  };

  // Écran 1.
  api.get('/dossiers', async (req, res) => {
    const input = {
      number: param(req, 'number'), applicant: param(req, 'applicant'), status: param(req, 'status'),
      filedFrom: param(req, 'filedFrom'), filedTo: param(req, 'filedTo'),
    };
    const errors = validateSearch(input);
    if (errors.length > 0) { res.status(422).json({ errors } satisfies ApiError); return; }
    // Un critère vide, un statut inconnu ou une date blanche ne sont pas des critères.
    const criteria: Record<string, string> = {};
    if (input.number) criteria.number = input.number;
    if (input.applicant) criteria.applicant = input.applicant;
    if (Object.hasOwn(STATUS_LABELS, input.status)) criteria.status = input.status;
    const from = parseScreenDate(input.filedFrom);
    const to = parseScreenDate(input.filedTo);
    if (from) criteria.filedFrom = from.iso;
    if (to) criteria.filedTo = to.iso;
    try {
      res.json({ results: (await legacy.search(criteria)).map(toRow) });
    } catch (e) { failure(res, e); }
  });

  // Écran 2 et 3 : lecture.
  api.get('/dossiers/:number', async (req, res) => {
    const number = withNumber(req, res);
    if (number === null) return;
    try {
      res.json(toView(await legacy.read(number), req.user!));
    } catch (e) { failure(res, e); }
  });

  // Écran 2 : enregistrement.
  api.put('/dossiers/:number', express.json({ limit: '64kb' }), async (req, res) => {
    const number = withNumber(req, res);
    if (number === null) return;
    const { applicant, subject } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof applicant !== 'string' || typeof subject !== 'string') {
      res.status(400).json({ errors: ['Requête invalide.'] } satisfies ApiError);
      return;
    }
    const user = req.user!;
    try {
      const errors = validateDossier({ applicant, subject });
      if (errors.length > 0) {
        // Comme l'écran actuel : la saisie reste, seul le statut est relu.
        res.status(422).json({ errors, dossier: toView(await legacy.read(number), user) } satisfies ApiError);
        return;
      }
      res.json(toView(await legacy.update(number, applicant, subject), user));
    } catch (e) {
      if (e instanceof LegacyError && e.status === 409) {
        try {
          res.status(409).json({ errors: [messages.locked], dossier: toView(await legacy.read(number), user) } satisfies ApiError);
          return;
        } catch { /* repli ci-dessous */ }
      }
      failure(res, e);
    }
  });

  // Écran 3 : remise. L'API interne ignore l'identité : le rôle se contrôle ici.
  api.post('/dossiers/:number/remise', async (req, res) => {
    const number = withNumber(req, res);
    if (number === null) return;
    if (req.user!.role !== 'instructeur') {
      res.status(403).json({ errors: [messages.instructorsOnly] } satisfies ApiError);
      return;
    }
    try {
      res.json(toView(await legacy.submit(number), req.user!));
    } catch (e) { failure(res, e, { user: req.user!, number }); }
  });

  api.use((_req, res) => { res.status(404).json({ errors: [messages.notFound] } satisfies ApiError); });
  app.use('/api', api);

  // Accusé de remise : le jeton du service d'archivage reste côté serveur.
  app.get('/accuse-de-remise', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const number = param(req, 'numero');
    if (!config.archiveUrl || !config.archiveToken) { res.status(503).type('text/plain').send(messages.unavailable); return; }
    if (!NUMBER.test(number)) { res.status(404).type('text/plain').send(messages.notFound); return; }
    try {
      if ((await legacy.read(number)).status !== 'REMIS') { res.status(404).type('text/plain').send(messages.notFound); return; }
      const upstream = await fetch(`${config.archiveUrl}/accuse-de-remise?${new URLSearchParams({ jeton: config.archiveToken, numero: number })}`, {
        redirect: 'manual', signal: AbortSignal.timeout(15_000),
      });
      if (!upstream.ok || !upstream.body) {
        res.status(upstream.status === 404 ? 404 : 502).type('text/plain').send(upstream.status === 404 ? messages.notFound : messages.unavailable);
        return;
      }
      for (const h of ['content-type', 'content-disposition', 'content-length']) {
        const v = upstream.headers.get(h);
        if (v) res.set(h, v);
      }
      Readable.fromWeb(upstream.body as never).on('error', () => res.destroy()).pipe(res);
    } catch (e) {
      if (e instanceof LegacyError && e.status === 404) { res.status(404).type('text/plain').send(messages.notFound); return; }
      console.error(e instanceof Error ? e.message : e);
      res.status(502).type('text/plain').send(messages.unavailable);
    }
  });

  // Le front : mêmes adresses que les écrans actuels, pour les favoris.
  const index = join(config.clientDir, 'index.html');
  app.get(PAGES, (_req, res) => { res.set('Cache-Control', 'no-cache').sendFile(index); });
  app.use(express.static(config.clientDir, { index: false, maxAge: '1h' }));
  app.use((_req, res) => { res.status(404).type('text/plain').send('Introuvable'); });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof err === 'object' && err && 'status' in err && typeof err.status === 'number' ? err.status : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ errors: ['Requête invalide.'] } satisfies ApiError);
  });
  return app;
}
