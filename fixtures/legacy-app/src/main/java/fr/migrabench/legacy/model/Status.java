package fr.migrabench.legacy.model;

// [banc] Terme défini dans GLOSSARY.md.
/**
 * Statut d'un dossier, avec le verrou qu'il pose sur les champs modifiables
 * de la fiche.
 */
public enum Status {
    BROUILLON("Brouillon", false, false),
    EN_INSTRUCTION("En instruction", true, false),
    REMIS("Remis", true, true);

    private final String label;
    private final boolean applicantLocked;
    private final boolean subjectLocked;

    Status(String label, boolean applicantLocked, boolean subjectLocked) {
        this.label = label;
        this.applicantLocked = applicantLocked;
        this.subjectLocked = subjectLocked;
    }

    public boolean isApplicantLocked() {
        return applicantLocked;
    }

    public boolean isSubjectLocked() {
        return subjectLocked;
    }

    /** Vrai si au moins un champ reste modifiable : la fiche peut être enregistrée. */
    public boolean isEditable() {
        return !applicantLocked || !subjectLocked;
    }

    public String getLabel() {
        return label;
    }
}
