// Messages de la recherche (spec de l'étape 2, R12 à R16) et de la fiche (F7 à
// F10) : texte exact de ApplicationResources.properties du legacy, vérifié par
// tests/oracle/messages.test.ts.
export const SEARCH_MESSAGES = {
  numberMask: "Le numéro doit être au format D- suivi de 4 chiffres, par exemple D-0001.",
  filedFromDate: "La date « Déposé du » doit être au format jj/mm/aaaa.",
  filedToDate: "La date « Déposé au » doit être au format jj/mm/aaaa.",
  filedRangeOrder: "La date « Déposé au » doit être postérieure ou égale à la date « Déposé du ».",
} as const;

export const SHEET_MESSAGES = {
  applicantRequired: "Le demandeur est obligatoire.",
  applicantMaxlength: "Le demandeur doit faire 80 caractères au plus.",
  subjectRequired: "L'objet est obligatoire.",
  subjectMaxlength: "L'objet doit faire 200 caractères au plus.",
} as const;
