package fr.migrabench.legacy.web;

import fr.migrabench.legacy.model.Dossier;

/** Partie en lecture seule de l'écran 2 et verrou du statut, prêts à afficher. */
public class DossierSheet {

    private final Dossier dossier;

    public DossierSheet(Dossier dossier) {
        this.dossier = dossier;
    }

    public String getNumber() {
        return dossier.getNumber();
    }

    public String getStatusLabel() {
        return dossier.getStatus().getLabel();
    }

    public String getFiledOn() {
        return ScreenDate.FORMAT.format(dossier.getFiledOn());
    }

    public boolean isApplicantLocked() {
        return dossier.getStatus().isApplicantLocked();
    }

    public boolean isSubjectLocked() {
        return dossier.getStatus().isSubjectLocked();
    }

    /** Bouton « Enregistrer » et {@code Ctrl+S} présents. */
    public boolean isEditable() {
        return dossier.getStatus().isEditable();
    }
}
