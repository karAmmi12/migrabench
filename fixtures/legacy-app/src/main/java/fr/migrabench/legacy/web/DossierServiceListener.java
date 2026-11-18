package fr.migrabench.legacy.web;

import fr.migrabench.legacy.data.DatasetLoader;
import fr.migrabench.legacy.service.DossierService;

import javax.servlet.ServletContext;
import javax.servlet.ServletContextEvent;
import javax.servlet.ServletContextListener;
import java.io.IOException;

/** Charge le jeu de données au démarrage et publie le service métier. */
public class DossierServiceListener implements ServletContextListener {

    private static final String ATTRIBUTE = DossierService.class.getName();

    public void contextInitialized(ServletContextEvent event) {
        try {
            event.getServletContext().setAttribute(ATTRIBUTE, new DossierService(DatasetLoader.load()));
        } catch (IOException e) {
            throw new IllegalStateException("Cannot load the dataset", e);
        }
    }

    public void contextDestroyed(ServletContextEvent event) {
        event.getServletContext().removeAttribute(ATTRIBUTE);
    }

    public static DossierService serviceOf(ServletContext context) {
        return (DossierService) context.getAttribute(ATTRIBUTE);
    }
}
