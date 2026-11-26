import { useEffect, type ReactNode } from 'react';

/** Cadre commun des trois écrans : bandeau bleu, titre, contenu. */
export function Layout({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => { document.title = title; }, [title]);
  return (
    <table width="100%" border={0} cellPadding={4} cellSpacing={0}>
      <tbody>
        <tr>
          <td style={{ backgroundColor: '#336699', color: '#ffffff' }}><h1>{title}</h1></td>
        </tr>
        <tr>
          <td>
            <table width="100%" border={0} cellPadding={2} cellSpacing={0}>
              <tbody>{children}</tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Équivalent de <html:errors/> : liste à puces en tête de formulaire. */
export function Errors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>;
}
