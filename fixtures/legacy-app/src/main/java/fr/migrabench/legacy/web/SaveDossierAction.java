package fr.migrabench.legacy.web;

import fr.migrabench.legacy.service.LockedFieldException;
import fr.migrabench.legacy.service.UnknownDossierException;
import org.apache.struts.action.Action;
import org.apache.struts.action.ActionForm;
import org.apache.struts.action.ActionForward;
import org.apache.struts.action.ActionMapping;
import org.apache.struts.action.ActionRedirect;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * Écran 2 : enregistre le demandeur et l'objet, puis revient sur la fiche.
 * La saisie arrive ici déjà acceptée par {@code validation.xml}. Le verrou du
 * statut est appliqué par le service métier : une requête forgée qui change
 * un champ verrouillé reçoit 409 et rien n'est enregistré.
 */
public class SaveDossierAction extends Action {

    @Override
    public ActionForward execute(ActionMapping mapping, ActionForm actionForm,
                                 HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        DossierForm form = (DossierForm) actionForm;
        try {
            DossierServiceListener.serviceOf(servlet.getServletContext())
                    .update(form.getNumber(), form.getApplicant(), form.getSubject());
        } catch (UnknownDossierException e) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return null;
        } catch (LockedFieldException e) {
            response.sendError(HttpServletResponse.SC_CONFLICT, e.getMessage());
            return null;
        }
        ActionRedirect redirect = new ActionRedirect(mapping.findForward("saved"));
        redirect.addParameter("number", form.getNumber());
        return redirect;
    }
}
