package fr.migrabench.legacy.web;

import fr.migrabench.legacy.model.Dossier;
import fr.migrabench.legacy.model.SearchCriteria;
import fr.migrabench.legacy.model.Status;
import org.apache.struts.action.Action;
import org.apache.struts.action.ActionForm;
import org.apache.struts.action.ActionForward;
import org.apache.struts.action.ActionMapping;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.List;

/** Écran 1 : lance la recherche et place les résultats dans la requête. */
public class SearchAction extends Action {

    public static final String RESULTS = "results";

    private static final DateTimeFormatter INPUT_DATE =
            DateTimeFormatter.ofPattern("dd/MM/uuuu").withResolverStyle(ResolverStyle.STRICT);

    @Override
    public ActionForward execute(ActionMapping mapping, ActionForm actionForm,
                                 HttpServletRequest request, HttpServletResponse response) {
        SearchForm form = (SearchForm) actionForm;
        SearchCriteria criteria = new SearchCriteria(
                blankToNull(form.getNumber()),
                blankToNull(form.getApplicant()),
                parseStatus(form.getStatus()),
                parseDate(form.getFiledFrom()),
                parseDate(form.getFiledTo()));

        List<SearchResultRow> rows = new ArrayList<SearchResultRow>();
        for (Dossier dossier : DossierServiceListener.serviceOf(servlet.getServletContext()).search(criteria)) {
            rows.add(new SearchResultRow(dossier));
        }
        request.setAttribute(RESULTS, rows);
        return mapping.findForward("success");
    }

    private static String blankToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }

    /** « Tous » (valeur vide) ou inconnu : pas de critère de statut. */
    private static Status parseStatus(String value) {
        if (blankToNull(value) == null) {
            return null;
        }
        try {
            return Status.valueOf(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * Une date mal formée est ignorée ici : c'est {@code validation.xml} qui
     * la refuse avant l'action (ticket de validation de l'écran 1).
     */
    private static LocalDate parseDate(String value) {
        if (blankToNull(value) == null) {
            return null;
        }
        try {
            return LocalDate.parse(value, INPUT_DATE);
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
