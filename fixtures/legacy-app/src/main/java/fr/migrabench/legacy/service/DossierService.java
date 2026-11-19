package fr.migrabench.legacy.service;

import fr.migrabench.legacy.model.Dossier;
import fr.migrabench.legacy.model.SearchCriteria;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Service métier des dossiers : seul endroit où vivent les règles métier.
 * Les écrans et l'API interne passent par lui. Aucun contrôle de rôle ici,
 * ni aucune règle de {@code validation.xml}.
 */
public class DossierService {

    private final List<Dossier> dossiers;

    public DossierService(List<Dossier> dossiers) {
        this.dossiers = new ArrayList<Dossier>(dossiers);
    }

    /** Dossiers qui satisfont tous les critères, triés par numéro, sans pagination. */
    public synchronized List<Dossier> search(SearchCriteria criteria) {
        List<Dossier> results = new ArrayList<Dossier>();
        for (Dossier dossier : dossiers) {
            if (matches(dossier, criteria)) {
                results.add(dossier);
            }
        }
        results.sort(Comparator.comparing(Dossier::getNumber));
        return results;
    }

    /** Le dossier qui porte ce numéro. */
    public synchronized Dossier read(String number) {
        return dossiers.get(indexOf(number));
    }

    /**
     * Remplace le demandeur et l'objet. Le verrou du statut est appliqué ici,
     * pour les écrans comme pour l'API interne : un champ verrouillé ne peut
     * pas changer, même si la requête est forgée. Le renvoyer à l'identique
     * n'est pas une modification. Les valeurs ne sont pas validées : les
     * règles de saisie vivent seulement dans {@code validation.xml}.
     *
     * @throws UnknownDossierException si aucun dossier ne porte ce numéro
     * @throws LockedFieldException si un champ verrouillé change
     */
    public synchronized Dossier update(String number, String applicant, String subject) {
        int index = indexOf(number);
        Dossier current = dossiers.get(index);
        if (current.getStatus().isApplicantLocked() && !current.getApplicant().equals(applicant)) {
            throw new LockedFieldException(number, "applicant");
        }
        if (current.getStatus().isSubjectLocked() && !current.getSubject().equals(subject)) {
            throw new LockedFieldException(number, "subject");
        }
        Dossier updated = current.withApplicantAndSubject(applicant, subject);
        dossiers.set(index, updated);
        return updated;
    }

    private int indexOf(String number) {
        for (int i = 0; i < dossiers.size(); i++) {
            if (dossiers.get(i).getNumber().equals(number)) {
                return i;
            }
        }
        throw new UnknownDossierException(number);
    }

    private static boolean matches(Dossier dossier, SearchCriteria criteria) {
        if (criteria.getNumber() != null && !criteria.getNumber().equals(dossier.getNumber())) {
            return false;
        }
        if (criteria.getApplicant() != null
                && !dossier.getApplicant().toLowerCase(Locale.ROOT)
                        .contains(criteria.getApplicant().toLowerCase(Locale.ROOT))) {
            return false;
        }
        if (criteria.getStatus() != null && criteria.getStatus() != dossier.getStatus()) {
            return false;
        }
        if (criteria.getFiledFrom() != null && dossier.getFiledOn().isBefore(criteria.getFiledFrom())) {
            return false;
        }
        if (criteria.getFiledTo() != null && dossier.getFiledOn().isAfter(criteria.getFiledTo())) {
            return false;
        }
        return true;
    }
}
