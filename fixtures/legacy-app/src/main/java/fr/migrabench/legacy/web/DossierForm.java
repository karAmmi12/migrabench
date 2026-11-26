package fr.migrabench.legacy.web;

import org.apache.struts.validator.ValidatorForm;

/* [banc] Pas de validate() propre : les règles sont seulement dans
 * validation.xml (piège à préserver, TRAPS.md). */
/** Formulaire de l'écran 2. */
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
