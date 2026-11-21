# migrabench

Banc de mesure pour comparer des migrations de front legacy (Struts 1 / JSP vers
React + TypeScript) réalisées par des agents IA.

On lui donne une application legacy et une version migrée. Il rend un rapport
chiffré : fidélité aux usages, sécurité, accessibilité, performance, coût.

- Protocole expérimental : [PROTOCOL.md](PROTOCOL.md)
- Plan de construction : [docs/PLAN.md](docs/PLAN.md)
- Règles de travail avec l'agent : [CLAUDE.md](CLAUDE.md)

État : étape 1 livrée (application legacy de test) ; étape 2 (oracle) en cours.

## Lancer le legacy

Prérequis : Docker (avec Compose v2).

```sh
docker compose up -d --build --wait
```

Le legacy (Java 8, Struts 1.3.10, Tomcat 9) répond sur
<http://localhost:8080>, derrière une authentification `BASIC` de Tomcat.
Les deux utilisateurs fixes, un agent et un instructeur, sont décrits dans
[`fixtures/users.json`](fixtures/users.json). Ce fichier génère
`tomcat-users.xml` pendant le build de l'image (ADR 0003).

L'horloge du legacy est figée par la variable `FROZEN_DATE` (aaaa-mm-jj),
fixée dans [`.env`](.env) : toute date de remise en provient. `docker compose`
passe ce fichier tel quel au legacy (`env_file`), et les tests le lisent
aussi ; une variable `FROZEN_DATE` du shell ne change donc ni l'un ni
l'autre. Sans elle, le legacy ne démarre pas. Le jeu de données est rechargé à chaque
démarrage : `docker compose restart legacy` annule les remises et les
modifications.

Le service d'archivage simulé répond sur <http://localhost:8090>. Il
délivre l'accusé de remise que l'écran 3 lie à un dossier `REMIS`, si le
jeton présenté est la valeur témoin `ARCHIVE_TOKEN` de [`.env`](.env). Le
legacy et lui la reçoivent tous deux de ce fichier.

L'API interne JSON du legacy (rechercher, lire, modifier, remettre) répond
sur le port `8081`, à l'adresse `http://legacy:8081` depuis le réseau Docker
`mb-internal`. Ce port n'est pas publié sur l'hôte : l'API interne n'est
donc pas joignable depuis le navigateur, et seule la couche serveur du
candidat est censée l'appeler. Un filtre par port la refuse sur le port
`8080` (403). Limite connue : un conteneur du réseau `default` de Docker
joint aussi `legacy:8081` (ADR 0004). Elle ignore l'identité de l'appelant
et n'applique aucune règle de `validation.xml` (ADR 0003). Ses quatre
endpoints :

| Endpoint | Réponse |
|---|---|
| `GET /api/dossiers?number=&applicant=&status=&filedFrom=&filedTo=` | `200 {"dossiers": [dossier, …]}`, triés par numéro |
| `GET /api/dossiers/{numéro}` | `200 dossier` ; `404` numéro inconnu |
| `PUT /api/dossiers/{numéro}`, corps `{"applicant": "…", "subject": "…"}` | `200 dossier` ; `409` champ verrouillé modifié, rien n'est enregistré ; `404` ; `400` corps mal formé |
| `POST /api/dossiers/{numéro}/remise`, sans corps | `200 dossier` ; `409` dossier pas `EN_INSTRUCTION` ; `404` |

Un dossier s'écrit `{"number", "applicant", "subject", "status", "filedOn",
"submittedOn"}`, statut en majuscules (`BROUILLON`, `EN_INSTRUCTION`,
`REMIS`), dates en `aaaa-mm-jj`, `submittedOn` à `null` hors `REMIS`. Les
critères de recherche ont la sémantique de l'écran 1 : vides ou absents, ils
ne filtrent pas ; comme l'action de l'écran 1, un statut inconnu ou une date
mal formée est ignoré.

Pour modifier, renvoyer un champ verrouillé à l'identique n'est pas une
modification. Le `400` ne vise que le contrat de l'API : un corps qui n'est
pas du JSON, ou un champ absent ou qui n'est pas une chaîne. Une chaîne vide
ou trop longue est acceptée, faute de règle de `validation.xml`.

Une erreur rendue par l'API interne s'écrit `{"error": "…"}`. Les refus de
Tomcat, avant l'API, restent ses pages HTML : le `403` du filtre par port,
et le `405` d'une méthode que l'API ne traite pas (`DELETE`, par exemple).

**Toute modification de `fixtures/users.json` demande
`docker compose up --build`** : sans `--build`, le legacy garde les anciens
utilisateurs alors que les tests lisent le nouveau fichier.

## Tests du banc

Prérequis : la version exacte de Node fixée dans `.nvmrc` (la même que la
CI), puis `npm install`. `npm test` refuse de tourner sous une autre version
de Node et demande `nvm use` (script `pretest`) ; `engine-strict` ne garde
que `npm install`.

```sh
export ARCHIVE_SALT="$(openssl rand -hex 32)"
docker compose up -d --build --wait   # la pile reçoit le sel du shell
npm test            # Vitest ; les tests du seam A exigent la pile Docker lancée
npm run typecheck   # tsc --noEmit
```

Les tests de la référence d'archivage calculent la référence attendue avec
`ARCHIVE_SALT` : la pile et `npm test` doivent voir le même sel, sinon ces
tests échouent. Le sel vient toujours du shell, jamais de `.env`, que lit
aussi le legacy. Sans `ARCHIVE_SALT`, la pile démarre quand même : le service
d'archivage tire son propre sel et ne le révèle pas.

Les tests du seam A appellent le legacy par HTTP sur `LEGACY_URL`
(par défaut `http://localhost:8080`) et le service d'archivage sur
`ARCHIVE_URL` (par défaut `http://localhost:8090`). Ceux de l'API interne
partent de `mb-internal` : ils lancent leurs requêtes dans le conteneur du
service d'archivage (`docker compose exec`). Ils écrivent sur les dossiers
réservés `D-0113`, `D-0114` et `D-0115` (`test:internal-api`) et remettent
les valeurs initiales : ils peuvent tourner sans redémarrer le legacy. Les
dossiers partagés ne leur servent qu'à des lectures et à des refus, qui
n'enregistrent rien.

Sur chaque PR, le workflow « Tests du banc » (`.github/workflows/tests.yml`)
construit la pile, attend ses healthchecks (`--wait`), puis lance `npm test`
sous le Node de `.nvmrc`. Il publie en artefact le rapport JUnit de Vitest et
les journaux de la pile (nom et durée de conservation : voir le workflow).
Le typecheck tourne dans un workflow à part, sans Docker (« Vérification des types »).

## Lancer l'oracle

Prérequis : les images de la pile construites (`docker compose build`), et
Chromium pour Playwright (`npx playwright install chromium`).

```sh
npm run oracle                               # contre le legacy
BASE_URL=http://localhost:3000 npm run oracle  # contre un autre front
```

Une exécution complète tire un sel, recrée les conteneurs `legacy` et
`archive` à partir des images existantes (ce qui remet le jeu de données à
zéro), lance les scénarios de `oracle/scenarios` sous Chromium, en parallèle
et sans relance, puis écrit un résultat JSON versionné dans
`results/oracle/`. Traces et HAR sont écrits dans
`.oracle-artifacts/<identifiant de l'exécution>/`, ignoré par Git ; le
résultat donne ce dossier (`artifacts`), y cite chaque fichier par un chemin
relatif, et par son SHA-256 (ADR 0005). La
commande rend un code non nul si un scénario n'a pas réussi.
`ORACLE_SALT` impose le sel, pour rejouer une exécution en diagnostic
seulement, jamais pour une mesure. Le format du résultat est décrit dans la
spec de l'étape 2 (`docs/specs/02-oracle.md`, « Résultat JSON »).
