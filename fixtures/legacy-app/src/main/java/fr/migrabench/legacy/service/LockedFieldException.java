package fr.migrabench.legacy.service;

/** Modification d'un champ verrouillé par le statut du dossier. */
public class LockedFieldException extends RuntimeException {

    /** @param field {@code applicant} ou {@code subject} */
    public LockedFieldException(String number, String field) {
        super("Field " + field + " is locked on dossier " + number);
    }
}
