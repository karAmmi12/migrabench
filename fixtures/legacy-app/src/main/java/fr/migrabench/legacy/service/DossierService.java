package fr.migrabench.legacy.service;

import fr.migrabench.legacy.model.Dossier;
import fr.migrabench.legacy.model.SearchCriteria;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Service métier des dossiers : seul endroit où vivent les règles métier.
 * Les écrans et l'API interne passent par lui. Aucun contrôle de rôle ici.
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
