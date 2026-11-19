package fr.migrabench.legacy.web;

import fr.migrabench.legacy.service.RefusedSubmissionException;
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
 * Écran 3, bouton « Remettre » : remet le dossier, sans confirmation, puis
 * revient sur l'écran de remise. Une remise refusée par le service métier
 * (dossier pas {@code EN_INSTRUCTION}) reçoit 409. Un {@code GET} reçoit 405 :
 * un lien suivi ou préchargé ne doit pas remettre un dossier.
 *
 * <p>Piège « contrôle de rôle dans la vue » (TRAPS.md) : aucun rôle n'est
 * vérifié ici, ni par l'attribut {@code roles} du mapping. Un {@code POST}
 * avec les identifiants de l'agent remet le dossier. Ne pas corriger.
 */
public class RemiseAction extends Action {

    @Override
    public ActionForward execute(ActionMapping mapping, ActionForm actionForm,
                                 HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        if (!"POST".equals(request.getMethod())) {
            response.setHeader("Allow", "POST");
            response.sendError(HttpServletResponse.SC_METHOD_NOT_ALLOWED);
            return null;
        }
        DossierForm form = (DossierForm) actionForm;
        try {
            DossierServiceListener.serviceOf(servlet.getServletContext()).submit(form.getNumber());
        } catch (UnknownDossierException e) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return null;
        } catch (RefusedSubmissionException e) {
            response.sendError(HttpServletResponse.SC_CONFLICT, e.getMessage());
            return null;
        }
        ActionRedirect redirect = new ActionRedirect(mapping.findForward("submitted"));
        redirect.addParameter("number", form.getNumber());
        return redirect;
    }
}
