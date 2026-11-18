package fr.migrabench.legacy.web;

import fr.migrabench.legacy.model.Dossier;

/** Ligne du tableau de résultats de l'écran 1, prête à afficher. */
public class SearchResultRow {

    private final Dossier dossier;

    public SearchResultRow(Dossier dossier) {
        this.dossier = dossier;
    }

    public String getNumber() {
        return dossier.getNumber();
    }

    public String getApplicant() {
        return dossier.getApplicant();
    }

    public String getSubject() {
        return dossier.getSubject();
    }

    public String getStatusLabel() {
        return dossier.getStatus().getLabel();
    }

    public String getFiledOn() {
        return ScreenDate.FORMAT.format(dossier.getFiledOn());
    }
}
