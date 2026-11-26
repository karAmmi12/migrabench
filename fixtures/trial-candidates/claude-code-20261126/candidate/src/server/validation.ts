import { messages } from './messages.js';

// Règles de validation.xml (Struts Validator), appliquées ici car l'API
// interne ne valide rien.

/** Équivalent de GenericValidator.isBlankOrNull : String.trim() de Java retire les caractères <= U+0020. */
const isBlank = (v: string): boolean => /^[\u0000- ]*$/.test(v);

/** Date jj/mm/aaaa stricte, ou null. */
export function parseScreenDate(value: string): { iso: string; key: number } | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!m) return null;
  const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const max = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > max) return null;
  return { iso: `${m[3]}-${m[2]}-${m[1]}`, key: year * 10000 + month * 100 + day };
}

export interface SearchInput {
  number: string;
  applicant: string;
  status: string;
  filedFrom: string;
  filedTo: string;
}

export function validateSearch(input: SearchInput): string[] {
  const errors: string[] = [];
  if (!isBlank(input.number) && !/^D-[0-9]{4}$/.test(input.number)) errors.push(messages.searchNumber);
  const from = isBlank(input.filedFrom) ? null : parseScreenDate(input.filedFrom);
  if (!isBlank(input.filedFrom) && !from) errors.push(messages.searchFiledFromDate);
  const to = isBlank(input.filedTo) ? null : parseScreenDate(input.filedTo);
  if (!isBlank(input.filedTo) && !to) errors.push(messages.searchFiledToDate);
  else if (from && to && to.key < from.key) errors.push(messages.searchFiledToOrder);
  return errors;
}

export function validateDossier(input: { applicant: string; subject: string }): string[] {
  const errors: string[] = [];
  if (isBlank(input.applicant)) errors.push(messages.applicantRequired);
  else if (input.applicant.length > 80) errors.push(messages.applicantMaxlength);
  if (isBlank(input.subject)) errors.push(messages.subjectRequired);
  else if (input.subject.length > 200) errors.push(messages.subjectMaxlength);
  return errors;
}
