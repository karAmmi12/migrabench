package fr.migrabench.legacy.model;

import java.time.LocalDate;

/** Demande administrative identifiée par un numéro (GLOSSARY.md). */
public class Dossier {

    private final String number;
    private final String applicant;
    private final String subject;
    private final Status status;
    private final LocalDate filedOn;
    private final LocalDate submittedOn;

    public Dossier(String number, String applicant, String subject, Status status,
                   LocalDate filedOn, LocalDate submittedOn) {
        this.number = number;
        this.applicant = applicant;
        this.subject = subject;
        this.status = status;
        this.filedOn = filedOn;
        this.submittedOn = submittedOn;
    }

    public String getNumber() {
        return number;
    }

    public String getApplicant() {
        return applicant;
    }

    public String getSubject() {
        return subject;
    }

    public Status getStatus() {
        return status;
    }

    public LocalDate getFiledOn() {
        return filedOn;
    }

    /** Date de remise, présente seulement sur un dossier {@code REMIS}. */
    public LocalDate getSubmittedOn() {
        return submittedOn;
    }

    /** Copie du dossier avec un autre demandeur et un autre objet. */
    public Dossier withApplicantAndSubject(String newApplicant, String newSubject) {
        return new Dossier(number, newApplicant, newSubject, status, filedOn, submittedOn);
    }

    /** Copie du dossier passé à {@code REMIS} à cette date. */
    public Dossier withSubmission(LocalDate date) {
        return new Dossier(number, applicant, subject, Status.REMIS, filedOn, date);
    }
}
