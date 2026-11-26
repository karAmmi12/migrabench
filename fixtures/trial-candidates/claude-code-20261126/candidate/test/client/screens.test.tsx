// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/client/App';
import type { DossierView } from '../../src/server/contract';

const view = (o: Partial<DossierView> = {}): DossierView => ({
  number: 'D-0002', applicant: 'Jean', subject: 'Clôture', status: 'BROUILLON', statusLabel: 'Brouillon', filedOn: '21/05/2024',
  submittedOn: null, applicantLocked: false, subjectLocked: false, editable: true, submissionLinked: false, canSubmit: false, ...o,
});

let calls: { method: string; url: string; body?: string }[];
let respond: (method: string, url: string) => { status: number; body: unknown };

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ method: init.method ?? 'GET', url, body: init.body as string | undefined });
    const r = respond(init.method ?? 'GET', url);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }));
  window.scrollTo = () => {};
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const open = (url: string) => { history.replaceState(null, '', url); return render(<App />); };

describe('recherche', () => {
  it('focus sur Numéro, pas de résultats à l’ouverture, puis tableau', async () => {
    respond = () => ({ status: 200, body: { results: [{ number: 'D-0001', applicant: '<b>Élodie</b>', subject: 'S', statusLabel: 'Remis', filedOn: '06/05/2024' }] } });
    open('/recherche.do');
    expect(document.activeElement).toBe(screen.getByLabelText('Numéro'));
    expect(screen.queryByText('Aucun dossier ne correspond à vos critères.')).toBeNull();
    await userEvent.type(screen.getByLabelText('Demandeur'), 'lod{Enter}');
    await screen.findByRole('link', { name: 'D-0001' });
    expect(location.pathname + location.search).toBe('/rechercher.do?number=&applicant=lod&status=&filedFrom=&filedTo=');
    expect(screen.getByText('<b>Élodie</b>')).toBeTruthy(); // échappé
    expect(screen.getByLabelText('Demandeur')).toHaveProperty('value', 'lod');
  });
  it('affiche les messages de validation et garde la saisie', async () => {
    respond = () => ({ status: 422, body: { errors: ['Le numéro doit être au format D- suivi de 4 chiffres, par exemple D-0001.'] } });
    open('/rechercher.do?number=XX&applicant=&status=REMIS&filedFrom=&filedTo=');
    await screen.findByText(/Le numéro doit être au format/);
    expect(screen.getByLabelText('Numéro')).toHaveProperty('value', 'XX');
    expect(screen.getByLabelText('Statut')).toHaveProperty('value', 'REMIS');
    expect(document.querySelector('th')).toBeNull();
  });
  it('aucun résultat', async () => {
    respond = () => ({ status: 200, body: { results: [] } });
    open('/rechercher.do?number=D-0099');
    await screen.findByText('Aucun dossier ne correspond à vos critères.');
  });
});

describe('fiche', () => {
  it('focus sur Objet, ordre de tabulation Objet > Demandeur > Enregistrer', async () => {
    respond = () => ({ status: 200, body: view() });
    open('/fiche.do?number=D-0002');
    const subject = await screen.findByLabelText('Objet');
    expect(document.activeElement).toBe(subject);
    expect(screen.getByLabelText('Demandeur').tabIndex).toBe(2);
    expect(subject.tabIndex).toBe(1);
    expect(screen.getByRole('button', { name: 'Enregistrer' }).tabIndex).toBe(3);
  });
  it('Ctrl+S enregistre, puis recharge la fiche', async () => {
    respond = (m) => ({ status: 200, body: view() });
    open('/fiche.do?number=D-0002');
    const subject = await screen.findByLabelText('Objet');
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Nouveau');
    const ev = new KeyboardEvent('keydown', { ctrlKey: true, keyCode: 83, bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    await waitFor(() => expect(calls.some(c => c.method === 'PUT')).toBe(true));
    expect(JSON.parse(calls.find(c => c.method === 'PUT')!.body!)).toEqual({ applicant: 'Jean', subject: 'Nouveau' });
    await waitFor(() => expect(calls.filter(c => c.method === 'GET')).toHaveLength(2));
  });
  it('saisie refusée : messages, saisie conservée, statut relu', async () => {
    respond = (m) => m === 'PUT'
      ? { status: 422, body: { errors: ['Le demandeur est obligatoire.'], dossier: view() } }
      : { status: 200, body: view() };
    open('/fiche.do?number=D-0002');
    const applicant = await screen.findByLabelText('Demandeur');
    await userEvent.clear(applicant);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Le demandeur est obligatoire.');
    expect(screen.getByLabelText('Demandeur')).toHaveProperty('value', '');
  });
  it('dossier remis : champs en lecture seule, ni bouton ni Ctrl+S, mais Ctrl+S reste intercepté', async () => {
    respond = () => ({ status: 200, body: view({ status: 'REMIS', statusLabel: 'Remis', applicantLocked: true, subjectLocked: true, editable: false, submissionLinked: true, submittedOn: '15/07/2024' }) });
    open('/fiche.do?number=D-0001');
    const subject = await screen.findByLabelText('Objet') as HTMLInputElement;
    expect(subject.readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Remise' }).getAttribute('href')).toBe('/remise.do?number=D-0002');
    const ev = new KeyboardEvent('keydown', { ctrlKey: true, keyCode: 83, bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(calls.some(c => c.method === 'PUT')).toBe(false);
  });
});

describe('remise', () => {
  const instr = (o: Partial<DossierView>) => view({ status: 'EN_INSTRUCTION', statusLabel: 'En instruction', ...o });
  it('instructeur : bouton Remettre, sans confirmation', async () => {
    let done = false;
    respond = (m) => m === 'POST' ? ((done = true), { status: 200, body: view({ status: 'REMIS' }) })
      : { status: 200, body: done ? view({ status: 'REMIS', statusLabel: 'Remis', submittedOn: '01/11/2025' }) : instr({ canSubmit: true }) };
    open('/remise.do?number=D-0002');
    await userEvent.click(await screen.findByRole('button', { name: 'Remettre' }));
    await screen.findByText('Dossier remis le 01/11/2025');
    expect(screen.getByRole('link', { name: 'Accusé de remise' }).getAttribute('href')).toBe('/accuse-de-remise?numero=D-0002');
    expect(document.body.innerHTML).not.toContain('jeton');
  });
  it('agent : message, pas de bouton', async () => {
    respond = () => ({ status: 200, body: instr({ canSubmit: false }) });
    open('/remise.do?number=D-0002');
    await screen.findByText('Remise réservée aux instructeurs');
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('brouillon', async () => {
    respond = () => ({ status: 200, body: view() });
    open('/remise.do?number=D-0002');
    await screen.findByText('Ce dossier ne peut pas être remis');
  });
});
