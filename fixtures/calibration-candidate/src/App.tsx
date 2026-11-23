import { type FormEvent, useState } from "react";

interface Dossier {
  number: string;
  applicant: string;
  subject: string;
  status: string;
}

// Recherche de dossiers par la couche serveur, qui appelle l'API interne.
export function App() {
  const [applicant, setApplicant] = useState("");
  const [dossiers, setDossiers] = useState<Dossier[] | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function search(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    const response = await fetch(`/api/dossiers?${new URLSearchParams({ applicant })}`);
    if (!response.ok) {
      setError(`Erreur ${response.status}`);
      return;
    }
    setDossiers((await response.json()) as Dossier[]);
  }

  return (
    <main>
      <h1>Recherche de dossiers</h1>
      <form onSubmit={search}>
        <label>
          Demandeur
          <input value={applicant} onChange={(event) => setApplicant(event.target.value)} />
        </label>
        <button type="submit">Rechercher</button>
      </form>
      {error !== undefined && <p role="alert">{error}</p>}
      {dossiers !== undefined && (
        <table>
          <thead>
            <tr>
              <th>Numéro</th>
              <th>Demandeur</th>
              <th>Objet</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {dossiers.map((dossier) => (
              <tr key={dossier.number}>
                <td>{dossier.number}</td>
                <td>{dossier.applicant}</td>
                <td>{dossier.subject}</td>
                <td>{dossier.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
