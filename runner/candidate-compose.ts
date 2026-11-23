// Composition complémentaire du service `candidate` (spec de l'étape 3,
// « Exécution du candidat » ; ADR 0007), générée pour chaque mesure dans le
// dossier de ses bruts et citée par empreinte (`environment.composeOverride`).
// Écrite en JSON, que Docker Compose lit comme du YAML : aucune dépendance.
// Les limites et le durcissement de l'isolation viennent avec leurs tickets.
import { type ContainerUser, dockerUser } from "./container-user.ts";

export interface CandidateComposeInput {
  // Image d'exécution du banc, par son nom local : construite par le banc, jamais tirée.
  image: string;
  // Utilisateur du conteneur (container-user.ts), jamais root.
  user: ContainerUser;
  port: number;
  // Chemins absolus sur l'hôte : copie du candidat et fichier des utilisateurs.
  copyDir: string;
  usersFile: string;
  // Commande de démarrage déclarée dans candidate.json.
  start: string;
  // Valeur témoin de .env, transmise comme au legacy (ADR 0004).
  archiveToken: string;
}

const WORKDIR = "/candidate";
const USERS_FILE = "/run/migrabench/users.json";

export function candidateCompose({ image, user, port, copyDir, usersFile, start, archiveToken }: CandidateComposeInput) {
  return {
    services: {
      candidate: {
        image,
        pull_policy: "never",
        user: dockerUser(user),
        working_dir: WORKDIR,
        command: ["sh", "-c", start],
        environment: {
          PORT: String(port),
          LEGACY_API_URL: "http://legacy:8081",
          ARCHIVE_URL: "http://archive:8090",
          ARCHIVE_TOKEN: archiveToken,
          USERS_FILE,
        },
        volumes: [`${copyDir}:${WORKDIR}:ro`, `${usersFile}:${USERS_FILE}:ro`],
        tmpfs: ["/tmp"],
        ports: [`127.0.0.1:${port}:${port}`],
        networks: ["default", "mb-internal"],
      },
    },
  };
}
