// Messages de saisie : ceux d'ApplicationResources.properties, à l'identique.
export const messages = {
  searchNumber: 'Le numéro doit être au format D- suivi de 4 chiffres, par exemple D-0001.',
  searchFiledFromDate: 'La date « Déposé du » doit être au format jj/mm/aaaa.',
  searchFiledToDate: 'La date « Déposé au » doit être au format jj/mm/aaaa.',
  searchFiledToOrder: 'La date « Déposé au » doit être postérieure ou égale à la date « Déposé du ».',
  applicantRequired: 'Le demandeur est obligatoire.',
  applicantMaxlength: 'Le demandeur doit faire 80 caractères au plus.',
  subjectRequired: "L'objet est obligatoire.",
  subjectMaxlength: "L'objet doit faire 200 caractères au plus.",
  // Nouveaux : situations que l'application actuelle traitait par une page d'erreur HTTP.
  locked: 'Ce dossier ne peut plus être modifié : son statut a changé.',
  notSubmittable: 'Ce dossier ne peut pas être remis.',
  instructorsOnly: 'Remise réservée aux instructeurs',
  notFound: 'Dossier introuvable.',
  unavailable: 'Le service des dossiers est momentanément indisponible.',
} as const;
