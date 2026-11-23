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
npm run stack:up    # tire un sel de développement, démarre la pile avec (--build --wait)
npm test            # Vitest ; les tests du seam A exigent la pile Docker lancée
npm run typecheck   # tsc --noEmit
```

Les tests de la référence d'archivage calculent la référence attendue avec le
sel de la pile : `ARCHIVE_SALT` du shell s'il est défini (c'est le cas en
CI), sinon le sel de développement que `npm run stack:up` écrit dans
`.dev-archive-salt`, fichier ignoré par Git. Sans l'un ni l'autre, ces tests
échouent avec un message explicite, sans être sautés. La pile et `npm test`
doivent voir le même sel : après un `npm run oracle`, qui recrée la pile avec
son propre sel, relancer `npm run stack:up` avant `npm test`. Les tests
comparent d'abord leur sel à celui du service d'archivage : s'ils diffèrent,
ils échouent avec un message qui demande de relancer `npm run stack:up`,
sans citer aucun des deux sels.

**Le sel de développement ne sert jamais à une exécution mesurée.** Il est
écrit en clair sur le disque, lisible par tout ce qui tourne sur la machine,
y compris un candidat en cours de migration. Une exécution mesurée tire
toujours son propre sel (`npm run oracle`, sans `ORACLE_SALT`) ; ne jamais
passer le contenu de `.dev-archive-salt` à `ORACLE_SALT`. Un sel imposé se
voit dans le résultat : `saltImposed: true` dans ses métadonnées.

Le sel vient toujours du shell, jamais de `.env`, que lit aussi le legacy.

### Verrou du banc

Deux outils du banc ne partagent jamais la pile. `migrabench measure`,
`npm run oracle` et `npm run stack:up` prennent le verrou du banc
(`.bench-lock`, à la racine, ignoré par Git) pour toute leur durée et le
libèrent à la fin, y compris sur erreur. Le fichier nomme l'outil, son
processus (PID, heure de démarrage, ligne de commande), la machine,
l'identifiant de la mesure s'il y en a un et l'heure de prise. Pendant qu'il
est tenu, ces trois outils refusent avec le code `4` (`refused-lock`) et un
message qui nomme le détenteur. `npm test` refuse aussi (script `pretest`),
sans prendre le verrou du banc.

Un verrou du banc orphelin, laissé par un processus mort, est repris par le
prochain outil du banc : sur la même machine seulement, et seulement si aucun
processus ne porte le PID enregistré, ou si celui qui le porte a une autre
heure de démarrage ou une autre ligne de commande. Une mesure enregistre la
prise et la reprise dans `environment.lock` de `measure.json`. Sur une autre
machine, le verrou du banc n'est jamais repris : le supprimer à la main une
fois l'outil arrêté.
Sans `ARCHIVE_SALT`, `docker compose up` démarre quand même la pile : le
service d'archivage tire son propre sel et ne le révèle pas. Un test le
vérifie sur une seconde pile, sans port publié, à partir des images déjà
construites (`tests/seam-a/archive-no-salt.test.ts`).

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

Pour économiser les minutes de CI (#76) :

- chaque workflow a un groupe de concurrence par PR : un nouveau commit annule
  l'exécution en cours sur la même PR. Hors PR, aucune exécution n'est annulée ;
- les jobs lourds (`tests`, `oracle`, `proof`) passent d'abord par un job
  `changes` (`scripts/write-ci-scope.ts`, règle dans `scripts/ci-scope.ts`).
  Sur une PR, un job lourd est ignoré si la PR ne touche que `docs/**` (#83) :
  le code du commit de fusion est alors celui de la base. Il l'est aussi si
  seul `docs/**` a changé depuis le dernier commit de la PR où ce même job a
  réussi, commit ancêtre de la tête.
  Une exécution annulée, en échec ou ignorée ne sert jamais de référence ;
  sans référence, le job tourne. « Fiche de formation » tourne toujours.

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
seulement, jamais pour une mesure ; le résultat l'enregistre
(`saltImposed: true`). Le format du résultat est décrit dans la
spec de l'étape 2 (`docs/specs/02-oracle.md`, « Résultat JSON »).

Le workflow « Oracle » (`.github/workflows/oracle.yml`) lance l'oracle en
deux jobs : `oracle`, une exécution complète, et `proof`, le critère de fin de
l'étape 2 : images construites une seule fois, puis 5 exécutions complètes
consécutives sur ces images. Les deux tournent sur chaque push vers `main` et
en `workflow_dispatch`. Sur une PR, `proof` ne tourne que si la PR touche
`oracle/`, `fixtures/legacy-app/`, `docker-compose.yml` ou `results/oracle/`,
et les deux suivent la règle `docs/**` ci-dessus. En CI, le résultat
enregistre `ciRun` (identifiant et tentative de l'exécution de CI, rang de
l'exécution complète dans le job, lu dans `ORACLE_CI_RANK`), repris dans le
nom du fichier : `<horodatage>-<commit>-ci<identifiant>.<tentative>-<rang>.json`.
Les résultats et les bruts sont publiés en artefacts, gardés 7 jours.

```sh
npm run oracle:proof -- results/oracle/*-ci<identifiant>.<tentative>-*.json
```

vérifie que 5 résultats font la preuve : rangs 1 à 5 d'une même exécution de
CI, `worktree: clean`, `saltImposed: false`, 38 scénarios réussis sur 38,
mêmes commit, Node, Chromium, `@playwright/test`, horloge figée et images
`legacy` et `archive`, 5 sels différents. Le job `proof` la lance avant de
publier.
