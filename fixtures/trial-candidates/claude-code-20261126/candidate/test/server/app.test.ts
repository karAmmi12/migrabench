import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error module JS sans types
import { createFakeLegacy } from '../../scripts/fake-legacy.mjs';
import { createApp } from '../../src/server/app';

const dataset = JSON.parse(readFileSync(new URL('../../../legacy-app/src/main/resources/dossiers.json', import.meta.url), 'utf8')).dossiers;
const auth = (u: string, p: string) => ({ Authorization: `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}` });
const alice = auth('alice', 'pw-a'), bob = auth('bob', 'pw-b');
const mut = { 'Content-Type': 'application/json', 'X-Requested-With': 'dossiers' };

let base = '';
const servers: Server[] = [];
const listen = (s: Server) => new Promise<number>(r => { servers.push(s.listen(0, () => r((s.address() as { port: number }).port))); });
let archiveCalls: string[] = [];

beforeAll(async () => {
  const legacyPort = await listen(createFakeLegacy(dataset));
  const archivePort = await listen(createServer((req, res) => {
    archiveCalls.push(req.url!);
    res.writeHead(200, { 'Content-Type': 'application/pdf' }).end('PDF');
  }));
  const dir = mkdtempSync(join(tmpdir(), 'dossiers-'));
  const usersFile = join(dir, 'users.json');
  writeFileSync(usersFile, JSON.stringify([
    { username: 'alice', password: 'pw-a', role: 'agent' },
    { username: 'bob', password: 'pw-b', role: 'instructeur' },
  ]));
  writeFileSync(join(dir, 'index.html'), '<html>spa</html>');
  const app = createApp({
    port: 0, legacyApiUrl: `http://127.0.0.1:${legacyPort}`, archiveUrl: `http://127.0.0.1:${archivePort}`,
    archiveToken: 'SECRET', usersFile, clientDir: dir,
  });
  base = `http://127.0.0.1:${await listen(createServer(app))}`;
});
afterAll(() => servers.forEach(s => s.close()));

const get = (path: string, headers = alice) => fetch(base + path, { headers });
const json = async (r: Response) => r.json() as Promise<any>;

describe('identification', () => {
  it('exige BASIC partout', async () => {
    const r = await fetch(`${base}/api/dossiers`);
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toMatch(/^Basic realm="dossiers"/);
    expect((await fetch(`${base}/recherche.do`)).status).toBe(401);
    expect((await get('/api/dossiers', auth('alice', 'faux'))).status).toBe(401);
  });
  it('sert le front sous les adresses actuelles', async () => {
    for (const p of ['/', '/recherche.do', '/rechercher.do?number=D-0001', '/fiche.do?number=D-0001', '/remise.do?number=D-0001'])
      expect(await (await get(p)).text()).toContain('spa');
  });
});

describe('recherche', () => {
  it('liste tout, triée, dates en jj/mm/aaaa', async () => {
    const body = await json(await get('/api/dossiers?number=&applicant=&status=&filedFrom=&filedTo='));
    expect(body.results).toHaveLength(30);
    expect(body.results[0]).toEqual({ number: 'D-0001', applicant: 'Élodie Marchand', subject: "Permis de construire d'une véranda", statusLabel: 'Remis', filedOn: '06/05/2024' });
  });
  it('filtre par demandeur sans casse, sensible aux accents', async () => {
    expect((await json(await get('/api/dossiers?applicant=elodie'))).results.map((r: any) => r.number)).toEqual(['D-0004']);
    expect((await json(await get('/api/dossiers?applicant=%C3%A9LODIE'))).results.map((r: any) => r.number)).toEqual(['D-0001']);
  });
  it('filtre par dates, bornes incluses, et par statut', async () => {
    const r = await json(await get('/api/dossiers?filedFrom=01/06/2024&filedTo=03/06/2024&status=EN_INSTRUCTION'));
    expect(r.results.map((x: any) => x.number)).toEqual(['D-0003']);
  });
  it('refuse les saisies comme validation.xml', async () => {
    const r = await get('/api/dossiers?number=D-1&filedFrom=31/02/2024&filedTo=2024-01-01');
    expect(r.status).toBe(422);
    expect((await json(r)).errors).toEqual([
      'Le numéro doit être au format D- suivi de 4 chiffres, par exemple D-0001.',
      'La date « Déposé du » doit être au format jj/mm/aaaa.',
      'La date « Déposé au » doit être au format jj/mm/aaaa.',
    ]);
    const order = await json(await get('/api/dossiers?filedFrom=02/01/2024&filedTo=01/01/2024'));
    expect(order.errors).toEqual(['La date « Déposé au » doit être postérieure ou égale à la date « Déposé du ».']);
    expect((await get('/api/dossiers?number=d-0001')).status).toBe(422);
    expect((await get('/api/dossiers?filedFrom=29/02/2024&filedTo=29/02/2024')).status).toBe(200);
    expect((await get('/api/dossiers?filedFrom=29/02/2023')).status).toBe(422);
  });
  it('ignore un statut inconnu', async () => {
    expect((await json(await get('/api/dossiers?status=constructor'))).results).toHaveLength(30);
  });
});

describe('fiche', () => {
  it('verrous par statut', async () => {
    const draft = await json(await get('/api/dossiers/D-0002'));
    expect(draft).toMatchObject({ applicantLocked: false, subjectLocked: false, editable: true, submissionLinked: false, canSubmit: false });
    const inst = await json(await get('/api/dossiers/D-0003'));
    expect(inst).toMatchObject({ applicantLocked: true, subjectLocked: false, editable: true, submissionLinked: true, canSubmit: false });
    const bobInst = await json(await get('/api/dossiers/D-0003', bob));
    expect(bobInst.canSubmit).toBe(true);
    const done = await json(await get('/api/dossiers/D-0001'));
    expect(done).toMatchObject({ editable: false, submittedOn: '15/07/2024', submissionLinked: true });
  });
  it('404 sur un dossier inconnu ou un numéro tordu', async () => {
    expect((await get('/api/dossiers/D-9999')).status).toBe(404);
    expect((await get('/api/dossiers/..%2Fx')).status).toBe(404);
  });
  it('valide avant d’enregistrer, et garde la saisie', async () => {
    const put = (n: string, body: unknown) => fetch(`${base}/api/dossiers/${n}`, { method: 'PUT', headers: { ...alice, ...mut }, body: JSON.stringify(body) });
    let r = await put('D-0002', { applicant: ' \t', subject: 'x'.repeat(201) });
    expect(r.status).toBe(422);
    const b = await json(r);
    expect(b.errors).toEqual(['Le demandeur est obligatoire.', "L'objet doit faire 200 caractères au plus."]);
    expect(b.dossier.status).toBe('BROUILLON');
    expect((await json(await get('/api/dossiers/D-0002'))).subject).toBe('Déclaration préalable pour une clôture');
    r = await put('D-0002', { applicant: 'Jean', subject: 'Nouvel objet' });
    expect(r.status).toBe(200);
    expect((await json(await get('/api/dossiers/D-0002'))).subject).toBe('Nouvel objet');
    expect((await put('D-0002', { applicant: 'J' })).status).toBe(400);
  });
  it('refuse de changer un champ verrouillé, accepte le renvoi à l’identique', async () => {
    const put = (body: unknown) => fetch(`${base}/api/dossiers/D-0003`, { method: 'PUT', headers: { ...alice, ...mut }, body: JSON.stringify(body) });
    const cur = await json(await get('/api/dossiers/D-0003'));
    expect((await put({ applicant: 'Autre', subject: cur.subject })).status).toBe(409);
    expect((await put({ applicant: cur.applicant, subject: 'Objet modifié' })).status).toBe(200);
  });
  it('protège contre le CSRF', async () => {
    const r = await fetch(`${base}/api/dossiers/D-0002`, { method: 'PUT', headers: { ...alice, 'Content-Type': 'text/plain' }, body: '{}' });
    expect(r.status).toBe(403);
  });
});

describe('remise', () => {
  const post = (n: string, h = bob) => fetch(`${base}/api/dossiers/${n}/remise`, { method: 'POST', headers: { ...h, ...mut } });
  it('réservée aux instructeurs, côté serveur', async () => {
    expect((await post('D-0006', alice)).status).toBe(403);
    expect((await json(await get('/api/dossiers/D-0006'))).status).toBe('EN_INSTRUCTION');
  });
  it('remet une fois, puis refuse', async () => {
    const r = await post('D-0006');
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ status: 'REMIS', submittedOn: '01/11/2025' });
    expect((await post('D-0006')).status).toBe(409);
    expect((await post('D-0002')).status).toBe(409);
    expect((await post('D-9999')).status).toBe(404);
  });
  it('GET sur la remise ne remet rien', async () => {
    expect((await get('/api/dossiers/D-0009/remise')).status).toBe(404);
    expect((await json(await get('/api/dossiers/D-0009'))).status).toBe('EN_INSTRUCTION');
  });
});

describe('accusé de remise', () => {
  it('relaie le document sans exposer le jeton', async () => {
    archiveCalls = [];
    const r = await get('/accuse-de-remise?numero=D-0001');
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('PDF');
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(archiveCalls).toEqual(['/accuse-de-remise?jeton=SECRET&numero=D-0001']);
    expect(JSON.stringify([...r.headers])).not.toContain('SECRET');
  });
  it('seulement pour un dossier remis', async () => {
    expect((await get('/accuse-de-remise?numero=D-0002')).status).toBe(404);
    expect((await fetch(`${base}/accuse-de-remise?numero=D-0001`)).status).toBe(401);
  });
});
