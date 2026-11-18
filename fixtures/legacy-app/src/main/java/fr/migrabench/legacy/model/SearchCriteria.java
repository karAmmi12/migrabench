package fr.migrabench.legacy.model;

import java.time.LocalDate;

/**
 * Critères de la recherche de dossiers, combinés en ET. Un critère
 * {@code null} est absent.
 */
public class SearchCriteria {

    private final String number;
    private final String applicant;
    private final Status status;
    private final LocalDate filedFrom;
    private final LocalDate filedTo;

    public SearchCriteria(String number, String applicant, Status status,
                          LocalDate filedFrom, LocalDate filedTo) {
        this.number = number;
        this.applicant = applicant;
        this.status = status;
        this.filedFrom = filedFrom;
        this.filedTo = filedTo;
    }

    /** Égalité exacte. */
    public String getNumber() {
        return number;
    }

    /** « Contient », sans tenir compte de la casse, sensible aux accents. */
    public String getApplicant() {
        return applicant;
    }

    public Status getStatus() {
        return status;
    }

    /** Borne incluse. */
    public LocalDate getFiledFrom() {
        return filedFrom;
    }

    /** Borne incluse. */
    public LocalDate getFiledTo() {
        return filedTo;
    }
}
