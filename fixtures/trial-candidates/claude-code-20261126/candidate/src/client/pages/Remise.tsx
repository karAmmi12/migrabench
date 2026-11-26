import { useEffect, useState } from 'react';
import type { DossierView } from '../../server/contract';
import { readDossier, submitDossier } from '../api';
import { Errors, Layout } from '../Layout';
import { useNav } from '../router';

export function Remise({ number }: { number: string }) {
  const { go } = useNav();
  const [view, setView] = useState<DossierView | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    readDossier(number).then(r => {
      if (!current) return;
      if (r.ok) setView(r.data); else setErrors(r.errors);
    });
    return () => { current = false; };
  }, [number]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await submitDossier(number);
    if (r.ok) { go(`/remise.do?number=${encodeURIComponent(number)}`); return; }
    setBusy(false);
    setErrors(r.errors);
  };

  return (
    <Layout title="Remise du dossier">
      <tr>
        <td>
          <Errors errors={errors} />
          {view && (
            <table border={0} cellPadding={2} cellSpacing={0}>
              <tbody>
                <tr><td>Numéro</td><td>{view.number}</td></tr>
                <tr><td>Demandeur</td><td>{view.applicant}</td></tr>
                <tr><td>Objet</td><td>{view.subject}</td></tr>
                <tr><td>Statut</td><td>{view.statusLabel}</td></tr>
                <tr><td>Déposé le</td><td>{view.filedOn}</td></tr>
              </tbody>
            </table>
          )}
        </td>
      </tr>
      {view && (
        <tr>
          <td>
            {view.status === 'EN_INSTRUCTION' && (view.canSubmit ? (
              <form action="/remettre.do" method="post" onSubmit={submit}>
                <input type="hidden" name="number" value={view.number} />
                <input type="submit" value="Remettre" />
              </form>
            ) : (
              <p>Remise réservée aux instructeurs</p>
            ))}
            {view.status === 'REMIS' && (
              <>
                <p>Dossier remis le {view.submittedOn}</p>
                <p><a href={`/accuse-de-remise?numero=${encodeURIComponent(view.number)}`}>Accusé de remise</a></p>
              </>
            )}
            {view.status === 'BROUILLON' && <p>Ce dossier ne peut pas être remis</p>}
          </td>
        </tr>
      )}
    </Layout>
  );
}
