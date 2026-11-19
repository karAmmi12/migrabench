package fr.migrabench.legacy.service;

/** Aucun dossier ne porte ce numéro. */
public class UnknownDossierException extends RuntimeException {

    public UnknownDossierException(String number) {
        super("Unknown dossier " + number);
    }
}
