package fr.migrabench.legacy.web;

import fr.migrabench.legacy.model.Dossier;

import java.time.format.DateTimeFormatter;

/** Ligne du tableau de résultats de l'écran 1, prête à afficher. */
public class SearchResultRow {

    private static final DateTimeFormatter DISPLAY_DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

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
        return DISPLAY_DATE.format(dossier.getFiledOn());
    }
}
