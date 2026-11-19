package fr.migrabench.legacy.service;

import fr.migrabench.legacy.model.Status;

/** Remise refusée : seul un dossier {@code EN_INSTRUCTION} peut être remis. */
public class RefusedSubmissionException extends RuntimeException {

    public RefusedSubmissionException(String number, Status status) {
        super("Dossier " + number + " cannot be submitted from status " + status);
    }
}
