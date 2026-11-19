package fr.migrabench.legacy.web;

import fr.migrabench.legacy.model.Dossier;

/**
 * Dossier prêt à afficher par les JSP des écrans 2 et 3 : valeurs en lecture
 * seule (dates en jj/mm/aaaa), statut et verrou des champs de la fiche.
 */
public class DossierView {

    private final Dossier dossier;

    public DossierView(Dossier dossier) {
        this.dossier = dossier;
    }

    public String getNumber() {
        return dossier.getNumber();
    }

    /** Récapitulatif de l'écran 3. */
    public String getApplicant() {
        return dossier.getApplicant();
    }

    /** Récapitulatif de l'écran 3. */
    public String getSubject() {
        return dossier.getSubject();
    }

    /**
     * Nom du statut ({@code BROUILLON}, {@code EN_INSTRUCTION}, {@code REMIS}),
     * comparé par {@code <logic:equal>} dans les JSP.
     */
    public String getStatus() {
        return dossier.getStatus().name();
    }

    public String getStatusLabel() {
        return dossier.getStatus().getLabel();
    }

    public String getFiledOn() {
        return ScreenDate.FORMAT.format(dossier.getFiledOn());
    }

    /** Date de remise en jj/mm/aaaa, {@code null} si le dossier n'est pas remis. */
    public String getSubmittedOn() {
        return dossier.getSubmittedOn() == null ? null : ScreenDate.FORMAT.format(dossier.getSubmittedOn());
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
