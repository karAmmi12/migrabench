// Écrit, une par ligne, les variables qui posent au build le label de chaque
// image de la pile : l'empreinte de son contexte de construction sur cette
// copie du dépôt (#102). Pour un `docker compose build` hors outils du banc,
// en CI : `node scripts/stack-context-env.ts >> "$GITHUB_ENV"`.
import { contextDigestEnv, stackContextDigests } from "../oracle/stack-images.ts";

for (const [name, value] of Object.entries(contextDigestEnv(await stackContextDigests()))) console.log(`${name}=${value}`);
