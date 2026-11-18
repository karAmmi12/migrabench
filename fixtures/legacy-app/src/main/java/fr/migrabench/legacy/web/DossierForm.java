package fr.migrabench.legacy.web;

import org.apache.struts.validator.ValidatorForm;

/**
 * Formulaire de l'écran 2. Pas de {@code validate()} propre : les règles sont
 * seulement dans {@code validation.xml} (piège à préserver, TRAPS.md).
 */
public class DossierForm extends ValidatorForm {

    private String number;
    private String applicant;
    private String subject;

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

    public String getSubject() {
        return subject;
    }

    public void setSubject(String subject) {
        this.subject = subject;
    }
}
