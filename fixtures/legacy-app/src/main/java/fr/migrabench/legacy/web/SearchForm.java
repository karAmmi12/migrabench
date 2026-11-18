package fr.migrabench.legacy.web;

import org.apache.struts.validator.ValidatorForm;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;

/**
 * Formulaire de l'écran 1. Pas de {@code validate()} propre : les règles sont
 * seulement dans {@code validation.xml} (piège à préserver, TRAPS.md).
 */
public class SearchForm extends ValidatorForm {

    private String number;
    private String applicant;
    private String status;
    private String filedFrom;
    private String filedTo;

    public String getNumber() {
        return number;
    }

    public void setNumber(String number) {
        this.number = number;
    }

    public String getApplicant() {
        return applicant;
    }

    public void setApplicant(String applicant) {
        this.applicant = applicant;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getFiledFrom() {
        return filedFrom;
    }

    public void setFiledFrom(String filedFrom) {
        this.filedFrom = filedFrom;
    }

    public String getFiledTo() {
        return filedTo;
    }

    public void setFiledTo(String filedTo) {
        this.filedTo = filedTo;
    }

    /**
     * Clé aaaammjj de « Déposé du », lue par la règle {@code validwhen} de
     * {@code validation.xml}, qui compare les entiers mais pas les dates.
     */
    public String getFiledFromKey() {
        return sortableKey(filedFrom);
    }

    /** Clé aaaammjj de « Déposé au » : voir {@link #getFiledFromKey()}. */
    public String getFiledToKey() {
        return sortableKey(filedTo);
    }

    /** {@code null} si la date est vide ou mal formée. */
    private static String sortableKey(String value) {
        if (value == null || value.isEmpty()) {
            return null;
        }
        try {
            LocalDate date = LocalDate.parse(value, ScreenDate.FORMAT);
            return String.format("%04d%02d%02d", date.getYear(), date.getMonthValue(), date.getDayOfMonth());
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
