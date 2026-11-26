package fr.migrabench.legacy.data;

import com.fasterxml.jackson.databind.ObjectMapper;
import fr.migrabench.legacy.model.Dossier;
import fr.migrabench.legacy.model.Status;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Lit le jeu de données fixe ({@code dossiers.json}, dans le classpath) au
 * démarrage. Rien n'est persisté : un redémarrage remet le jeu à zéro.
 */
public final class DatasetLoader {

    private static final String RESOURCE = "/dossiers.json";

    private DatasetLoader() {
    }

    public static List<Dossier> load() throws IOException {
        InputStream input = DatasetLoader.class.getResourceAsStream(RESOURCE);
        if (input == null) {
            throw new IOException("Dataset not found in classpath: " + RESOURCE);
        }
        try {
            DatasetFile file = new ObjectMapper().readValue(input, DatasetFile.class);
            List<Dossier> dossiers = new ArrayList<Dossier>();
            for (DossierRecord record : file.dossiers) {
                dossiers.add(new Dossier(
                        record.number,
                        record.applicant,
                        record.subject,
                        Status.valueOf(record.status),
                        LocalDate.parse(record.filedOn),
                        record.submittedOn == null ? null : LocalDate.parse(record.submittedOn)));
            }
            return dossiers;
        } finally {
            input.close();
        }
    }

    /* [banc] Le legacy ignore les réservations, qui ne servent qu'au banc
     * (seam B) ; le champ existe pour que Jackson accepte la clé. */
    /** Forme du fichier. */
    static class DatasetFile {
        public List<DossierRecord> dossiers;
        public Map<String, List<String>> reservations;
    }

    static class DossierRecord {
        public String number;
        public String applicant;
        public String subject;
        public String status;
        public String filedOn;
        public String submittedOn;
    }
}
