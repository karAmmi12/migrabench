package fr.migrabench.legacy.web;

import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;

/** Format des dates saisies et affichées sur les écrans : jj/mm/aaaa. */
final class ScreenDate {

    static final DateTimeFormatter FORMAT =
            DateTimeFormatter.ofPattern("dd/MM/uuuu").withResolverStyle(ResolverStyle.STRICT);

    private ScreenDate() {
    }
}
