// Types partagés entre la couche serveur et le front (types seulement).

export type Status = 'BROUILLON' | 'EN_INSTRUCTION' | 'REMIS';

/** Ligne du tableau de résultats, prête à afficher. */
export interface ResultRow {
  number: string;
  applicant: string;
  subject: string;
  statusLabel: string;
  filedOn: string; // jj/mm/aaaa
}

/** Dossier prêt à afficher (fiche et remise). */
export interface DossierView {
  number: string;
  applicant: string;
  subject: string;
  status: Status;
  statusLabel: string;
  filedOn: string; // jj/mm/aaaa
  submittedOn: string | null; // jj/mm/aaaa
  applicantLocked: boolean;
  subjectLocked: boolean;
  /** Bouton « Enregistrer » et Ctrl+S présents. */
  editable: boolean;
  /** Lien « Remise » présent sur la fiche. */
  submissionLinked: boolean;
  /** L'utilisateur courant peut remettre ce dossier (instructeur, dossier en instruction). */
  canSubmit: boolean;
}

/** Réponse d'une erreur applicative : saisie refusée (422), verrou (409), etc. */
export interface ApiError {
  errors: string[];
  dossier?: DossierView;
}
