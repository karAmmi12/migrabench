import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { DossierView } from '../../server/contract';
import { readDossier, saveDossier } from '../api';
import { Errors, Layout } from '../Layout';
import { Link, useNav } from '../router';

export function Fiche({ number }: { number: string }) {
  const { go } = useNav();
  const [view, setView] = useState<DossierView | null>(null);
  const [applicant, setApplicant] = useState('');
  const [subject, setSubject] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const subjectField = useRef<HTMLInputElement>(null);
  const saving = useRef(false);

  useEffect(() => {
    let current = true;
    readDossier(number).then(r => {
      if (!current) return;
      if (r.ok) { setView(r.data); setApplicant(r.data.applicant); setSubject(r.data.subject); } else setErrors(r.errors);
    });
    return () => { current = false; };
  }, [number]);

  // Focus initial sur « Objet », une fois la fiche affichée.
  const loaded = view !== null;
  useEffect(() => { if (loaded) subjectField.current?.focus(); }, [loaded]);

  const save = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      const r = await saveDossier(number, applicant, subject);
      if (r.ok) { go(`/fiche.do?number=${encodeURIComponent(number)}`); return; }
      // Saisie refusée : la fiche garde les valeurs saisies, seul le statut est relu.
      setErrors(r.errors);
      if (r.dossier) setView(r.dossier);
    } finally {
      saving.current = false;
    }
  }, [number, applicant, subject, go]);

  // Ctrl+S enregistre, comme le bouton ; le navigateur n'enregistre jamais la page.
  const latest = useRef({ save, editable: view?.editable ?? false });
  latest.current = { save, editable: view?.editable ?? false };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.keyCode === 83) {
        e.preventDefault();
        if (latest.current.editable) void latest.current.save();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void save(); };

  return (
    <Layout title="Fiche dossier">
      <tr>
        <td>
          <Errors errors={errors} />
          {view && (
            <>
              <form action="/enregistrer.do" method="post" onSubmit={onSubmit}>
                <input type="hidden" name="number" value={view.number} />
                <table border={0} cellPadding={2} cellSpacing={0}>
                  <tbody>
                    <tr><td>Numéro</td><td>{view.number}</td></tr>
                    <tr><td>Statut</td><td>{view.statusLabel}</td></tr>
                    <tr><td>Déposé le</td><td>{view.filedOn}</td></tr>
                    <tr>
                      <td><label htmlFor="applicant">Demandeur</label></td>
                      <td><input type="text" name="applicant" id="applicant" size={50} tabIndex={2}
                                 value={applicant} readOnly={view.applicantLocked} onChange={e => setApplicant(e.target.value)} /></td>
                    </tr>
                    <tr>
                      <td><label htmlFor="subject">Objet</label></td>
                      <td><input type="text" name="subject" id="subject" size={80} tabIndex={1} ref={subjectField}
                                 value={subject} readOnly={view.subjectLocked} onChange={e => setSubject(e.target.value)} /></td>
                    </tr>
                    {view.editable && (
                      <tr>
                        <td>&nbsp;</td>
                        <td><input type="submit" value="Enregistrer" tabIndex={3} /></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </form>
              {view.submissionLinked && (
                <p><Link href={`/remise.do?number=${encodeURIComponent(view.number)}`}>Remise</Link></p>
              )}
            </>
          )}
        </td>
      </tr>
    </Layout>
  );
}
