package fr.migrabench.legacy.web;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;

/** Format des dates saisies et affichées sur les écrans : jj/mm/aaaa. */
final class ScreenDate {

    static final DateTimeFormatter FORMAT =
            DateTimeFormatter.ofPattern("dd/MM/uuuu").withResolverStyle(ResolverStyle.STRICT);

    private ScreenDate() {
    }

    /** Date saisie, ou {@code null} si elle est vide ou mal formée. */
    static LocalDate parseOrNull(String value) {
        if (value == null || value.isEmpty()) {
            return null;
        }
        try {
            return LocalDate.parse(value, FORMAT);
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
