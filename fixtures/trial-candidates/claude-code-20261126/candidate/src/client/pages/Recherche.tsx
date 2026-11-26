import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ResultRow } from '../../server/contract';
import { search } from '../api';
import { Errors, Layout } from '../Layout';
import { Link, useNav } from '../router';

const FIELDS = ['number', 'applicant', 'status', 'filedFrom', 'filedTo'] as const;

/** query : chaîne de requête d'une recherche soumise, null pour le formulaire seul. */
export function Recherche({ query }: { query: string | null }) {
  const { go, path } = useNav();
  const params = new URLSearchParams(query ?? '');
  const [values, setValues] = useState(() => Object.fromEntries(FIELDS.map(f => [f, params.get(f) ?? ''])));
  const [errors, setErrors] = useState<string[]>([]);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const number = useRef<HTMLInputElement>(null);

  useEffect(() => { number.current?.focus(); }, []);
  useEffect(() => {
    if (query === null) return;
    let current = true;
    search(query).then(r => {
      if (!current) return;
      if (r.ok) setResults(r.data.results); else setErrors(r.errors);
    });
    return () => { current = false; };
  }, [query]);

  const set = (name: string) => (e: { target: { value: string } }) => setValues(v => ({ ...v, [name]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = `/rechercher.do?${new URLSearchParams(values)}`;
    go(url, path === '/rechercher.do' && url === `${location.pathname}${location.search}`);
  };

  return (
    <Layout title="Recherche de dossiers">
      <tr>
        <td>
          <Errors errors={errors} />
          <form action="/rechercher.do" method="get" onSubmit={submit}>
            <table border={0} cellPadding={2} cellSpacing={0}>
              <tbody>
                <tr>
                  <td><label htmlFor="number">Numéro</label></td>
                  <td><input type="text" name="number" id="number" size={10} ref={number} value={values.number} onChange={set('number')} /></td>
                </tr>
                <tr>
                  <td><label htmlFor="applicant">Demandeur</label></td>
                  <td><input type="text" name="applicant" id="applicant" size={30} value={values.applicant} onChange={set('applicant')} /></td>
                </tr>
                <tr>
                  <td><label htmlFor="status">Statut</label></td>
                  <td>
                    <select name="status" id="status" value={values.status} onChange={set('status')}>
                      <option value="">Tous</option>
                      <option value="BROUILLON">Brouillon</option>
                      <option value="EN_INSTRUCTION">En instruction</option>
                      <option value="REMIS">Remis</option>
                    </select>
                  </td>
                </tr>
                <tr>
                  <td><label htmlFor="filedFrom">Déposé du</label></td>
                  <td><input type="text" name="filedFrom" id="filedFrom" size={10} value={values.filedFrom} onChange={set('filedFrom')} /></td>
                </tr>
                <tr>
                  <td><label htmlFor="filedTo">Déposé au</label></td>
                  <td><input type="text" name="filedTo" id="filedTo" size={10} value={values.filedTo} onChange={set('filedTo')} /></td>
                </tr>
                <tr>
                  <td>&nbsp;</td>
                  <td><input type="submit" value="Rechercher" /></td>
                </tr>
              </tbody>
            </table>
          </form>
        </td>
      </tr>
      {results !== null && (
        <tr>
          <td>
            {results.length === 0 ? (
              <p>Aucun dossier ne correspond à vos critères.</p>
            ) : (
              <table border={1} cellPadding={3} cellSpacing={0}>
                <tbody>
                  <tr>
                    <th>Numéro</th>
                    <th>Demandeur</th>
                    <th>Objet</th>
                    <th>Statut</th>
                    <th>Déposé le</th>
                  </tr>
                  {results.map(row => (
                    <tr key={row.number}>
                      <td><Link href={`/fiche.do?number=${encodeURIComponent(row.number)}`}>{row.number}</Link></td>
                      <td>{row.applicant}</td>
                      <td>{row.subject}</td>
                      <td>{row.statusLabel}</td>
                      <td>{row.filedOn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </Layout>
  );
}
