package fr.migrabench.legacy.service;

/** Aucun dossier n'a ce numéro. */
public class UnknownDossierException extends RuntimeException {

    public UnknownDossierException(String number) {
        super("Unknown dossier " + number);
    }
}
