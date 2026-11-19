package fr.migrabench.legacy.web;

import fr.migrabench.legacy.model.Dossier;
import fr.migrabench.legacy.service.UnknownDossierException;
import org.apache.struts.action.Action;
import org.apache.struts.action.ActionForm;
import org.apache.struts.action.ActionForward;
import org.apache.struts.action.ActionMapping;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * Écrans 2 et 3 : affiche le dossier {@code number}. Trois mappings
 * l'utilisent. {@code /fiche} remplit le formulaire avec le dossier.
 * {@code /ficheSaisie} (paramètre {@value #KEEP_INPUT}) garde la saisie
 * refusée par {@code validation.xml} et ne recharge que le statut.
 * {@code /remise} affiche l'écran de remise, qui n'utilise que
 * {@link DossierView}.
 */
public class ShowDossierAction extends Action {

    public static final String DOSSIER = "dossier";
    static final String KEEP_INPUT = "keepInput";

    @Override
    public ActionForward execute(ActionMapping mapping, ActionForm actionForm,
                                 HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        DossierForm form = (DossierForm) actionForm;
        Dossier dossier;
        try {
            dossier = DossierServiceListener.serviceOf(servlet.getServletContext()).read(form.getNumber());
        } catch (UnknownDossierException e) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return null;
        }
        if (!KEEP_INPUT.equals(mapping.getParameter())) {
            form.setApplicant(dossier.getApplicant());
            form.setSubject(dossier.getSubject());
        }
        request.setAttribute(DOSSIER, new DossierView(dossier));
        return mapping.findForward("success");
    }
}
