package fr.migrabench.legacy.web;

import org.apache.struts.action.ActionForm;

/** Formulaire de l'écran 1. Pas de {@code validate()} : voir TRAPS.md. */
public class SearchForm extends ActionForm {

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
}
