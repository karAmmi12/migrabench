package fr.migrabench.legacy.web;

import fr.migrabench.legacy.data.DatasetLoader;
import fr.migrabench.legacy.service.DossierService;

import javax.servlet.ServletContext;
import javax.servlet.ServletContextEvent;
import javax.servlet.ServletContextListener;
import java.io.IOException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;

/**
 * Charge le jeu de données au démarrage et publie le service métier, avec
 * l'horloge figée par le banc dans {@value #FROZEN_DATE} (aaaa-mm-jj).
 */
public class DossierServiceListener implements ServletContextListener {

    static final String FROZEN_DATE = "FROZEN_DATE";

    private static final String ATTRIBUTE = DossierService.class.getName();

    public void contextInitialized(ServletContextEvent event) {
        try {
            event.getServletContext().setAttribute(ATTRIBUTE,
                    new DossierService(DatasetLoader.load(), frozenClock(System.getenv(FROZEN_DATE))));
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

    /** Horloge arrêtée à minuit UTC du jour donné. Sans ce jour, le legacy ne démarre pas. */
    private static Clock frozenClock(String date) {
        if (date == null || date.isEmpty()) {
            throw new IllegalStateException(FROZEN_DATE + " is not set: the bench must freeze the clock");
        }
        try {
            return Clock.fixed(LocalDate.parse(date).atStartOfDay(ZoneOffset.UTC).toInstant(), ZoneOffset.UTC);
        } catch (DateTimeParseException e) {
            throw new IllegalStateException(FROZEN_DATE + " is not an ISO date (yyyy-mm-dd): " + date, e);
        }
    }
}
