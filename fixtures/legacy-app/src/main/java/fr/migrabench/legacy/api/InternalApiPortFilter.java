package fr.migrabench.legacy.api;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * Filtre par port : refuse (403) toute requête vers l'API interne qui
 * n'arrive pas par le port de l'API interne (paramètre {@code port}, 8081).
 *
 * <p>Pièce du banc (ADR 0004), ni piège ni comportement du legacy à migrer :
 * un candidat n'a pas à la reproduire.
 */
public class InternalApiPortFilter implements Filter {

    private int port;

    public void init(FilterConfig config) throws ServletException {
        String value = config.getInitParameter("port");
        try {
            port = Integer.parseInt(value);
        } catch (NumberFormatException e) {
            throw new ServletException("Internal API port is not a number: " + value, e);
        }
    }

    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (request.getLocalPort() != port) {
            ((HttpServletResponse) response).sendError(HttpServletResponse.SC_FORBIDDEN);
            return;
        }
        chain.doFilter(request, response);
    }

    public void destroy() {
    }
}
