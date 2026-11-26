package fr.migrabench.legacy.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fr.migrabench.legacy.model.Dossier;
import fr.migrabench.legacy.model.SearchCriteria;
import fr.migrabench.legacy.model.Status;
import fr.migrabench.legacy.service.DossierService;
import fr.migrabench.legacy.service.LockedFieldException;
import fr.migrabench.legacy.service.RefusedSubmissionException;
import fr.migrabench.legacy.service.UnknownDossierException;
import fr.migrabench.legacy.web.DossierServiceListener;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/* [banc] Comme les JSP, elle ignore l'identité de l'appelant et ne contrôle
 * aucun rôle (ADR 0003). Elle n'applique aucune règle de validation.xml. */
/**
 * API interne JSON du legacy, servie sous {@code /api} par le port 8081
 * seulement (voir {@link InternalApiPortFilter}). Elle délègue au service
 * métier, qui applique les règles métier.
 */
public class InternalApiServlet extends HttpServlet {

    private static final String DOSSIERS = "/dossiers";
    private static final Pattern DOSSIER = Pattern.compile("^/dossiers/([^/]+)$");
    private static final Pattern SUBMISSION = Pattern.compile("^/dossiers/([^/]+)/remise$");

    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
        if (DOSSIERS.equals(pathOf(request))) {
            List<Map<String, Object>> dossiers = new ArrayList<Map<String, Object>>();
            for (Dossier found : service().search(criteriaOf(request))) {
                dossiers.add(toJson(found));
            }
            Map<String, Object> json = new LinkedHashMap<String, Object>();
            json.put("dossiers", dossiers);
            writeJson(response, HttpServletResponse.SC_OK, json);
            return;
        }
        Matcher dossier = DOSSIER.matcher(pathOf(request));
        if (dossier.matches()) {
            try {
                writeJson(response, HttpServletResponse.SC_OK, toJson(service().read(dossier.group(1))));
            } catch (UnknownDossierException e) {
                writeError(response, HttpServletResponse.SC_NOT_FOUND, e.getMessage());
            }
            return;
        }
        writeError(response, HttpServletResponse.SC_NOT_FOUND, "Unknown endpoint");
    }

    /**
     * Modifier : corps {@code {"applicant": "…", "subject": "…"}}, les deux
     * champs en chaînes, vides acceptées. Le service métier applique le
     * verrou du statut : un champ verrouillé qui change reçoit 409 et rien
     * n'est enregistré.
     */
    @Override
    protected void doPut(HttpServletRequest request, HttpServletResponse response) throws IOException {
        Matcher dossier = DOSSIER.matcher(pathOf(request));
        if (!dossier.matches()) {
            writeError(response, HttpServletResponse.SC_NOT_FOUND, "Unknown endpoint");
            return;
        }
        JsonNode body;
        try {
            body = JSON.readTree(request.getInputStream());
        } catch (JsonProcessingException e) {
            writeError(response, HttpServletResponse.SC_BAD_REQUEST, "Body is not JSON");
            return;
        }
        if (body == null || !body.path("applicant").isTextual() || !body.path("subject").isTextual()) {
            writeError(response, HttpServletResponse.SC_BAD_REQUEST,
                    "Body must be an object with string fields applicant and subject");
            return;
        }
        try {
            Dossier updated = service().update(dossier.group(1),
                    body.get("applicant").textValue(), body.get("subject").textValue());
            writeJson(response, HttpServletResponse.SC_OK, toJson(updated));
        } catch (UnknownDossierException e) {
            writeError(response, HttpServletResponse.SC_NOT_FOUND, e.getMessage());
        } catch (LockedFieldException e) {
            writeError(response, HttpServletResponse.SC_CONFLICT, e.getMessage());
        }
    }

    // [banc] Aucun contrôle de rôle (TRAPS.md).
    /**
     * Remettre : sans corps. Le service métier refuse (409) tout dossier qui
     * n'est pas {@code EN_INSTRUCTION}.
     */
    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws IOException {
        Matcher submission = SUBMISSION.matcher(pathOf(request));
        if (!submission.matches()) {
            writeError(response, HttpServletResponse.SC_NOT_FOUND, "Unknown endpoint");
            return;
        }
        try {
            writeJson(response, HttpServletResponse.SC_OK, toJson(service().submit(submission.group(1))));
        } catch (UnknownDossierException e) {
            writeError(response, HttpServletResponse.SC_NOT_FOUND, e.getMessage());
        } catch (RefusedSubmissionException e) {
            writeError(response, HttpServletResponse.SC_CONFLICT, e.getMessage());
        }
    }

    private DossierService service() {
        return DossierServiceListener.serviceOf(getServletContext());
    }

    /**
     * Mêmes critères que l'écran 1, sans les règles de {@code validation.xml} :
     * un paramètre vide ou absent n'est pas un critère, et, comme dans
     * {@code SearchAction}, un statut inconnu ou une date mal formée
     * (aaaa-mm-jj attendu) est ignoré au lieu d'être refusé.
     */
    private static SearchCriteria criteriaOf(HttpServletRequest request) {
        return new SearchCriteria(
                blankToNull(request.getParameter("number")),
                blankToNull(request.getParameter("applicant")),
                statusOrNull(request.getParameter("status")),
                dateOrNull(request.getParameter("filedFrom")),
                dateOrNull(request.getParameter("filedTo")));
    }

    private static String blankToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }

    private static Status statusOrNull(String value) {
        if (blankToNull(value) == null) {
            return null;
        }
        try {
            return Status.valueOf(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static LocalDate dateOrNull(String value) {
        if (blankToNull(value) == null) {
            return null;
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static String pathOf(HttpServletRequest request) {
        return request.getPathInfo() == null ? "" : request.getPathInfo();
    }

    private static Map<String, Object> toJson(Dossier dossier) {
        Map<String, Object> json = new LinkedHashMap<String, Object>();
        json.put("number", dossier.getNumber());
        json.put("applicant", dossier.getApplicant());
        json.put("subject", dossier.getSubject());
        json.put("status", dossier.getStatus().name());
        json.put("filedOn", dossier.getFiledOn().toString());
        json.put("submittedOn", dossier.getSubmittedOn() == null ? null : dossier.getSubmittedOn().toString());
        return json;
    }

    private static void writeError(HttpServletResponse response, int status, String message) throws IOException {
        Map<String, Object> json = new LinkedHashMap<String, Object>();
        json.put("error", message);
        writeJson(response, status, json);
    }

    private static void writeJson(HttpServletResponse response, int status, Object json) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        JSON.writeValue(response.getOutputStream(), json);
    }
}
