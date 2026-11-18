package fr.migrabench.legacy.model;

/** Statut d'un dossier (GLOSSARY.md). */
public enum Status {
    BROUILLON("Brouillon"),
    EN_INSTRUCTION("En instruction"),
    REMIS("Remis");

    private final String label;

    Status(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
