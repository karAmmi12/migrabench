// Messages de la fiche (spec de l'étape 2, F7 à F10) : texte exact de
// ApplicationResources.properties du legacy, vérifié par tests/oracle/messages.test.ts.
export const SHEET_MESSAGES = {
  applicantRequired: "Le demandeur est obligatoire.",
  applicantMaxlength: "Le demandeur doit faire 80 caractères au plus.",
  subjectRequired: "L'objet est obligatoire.",
  subjectMaxlength: "L'objet doit faire 200 caractères au plus.",
} as const;
