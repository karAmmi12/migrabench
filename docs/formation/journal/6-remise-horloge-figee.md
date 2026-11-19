# #6 · Étape 1 · 5. Remise et horloge figée

## Objectif

La fiche dossier existait, mais un dossier ne pouvait pas encore être
**remis**. Ce ticket construit l'écran 3 : un récapitulatif en lecture seule,
puis un affichage qui dépend du statut et du rôle. La date de remise vient
d'une **horloge figée** transmise par le banc, pour que deux runs donnent la
même date. L'écran plante le piège **à corriger** du contrôle de rôle fait
seulement dans la vue : l'agent ne voit pas le bouton « Remettre », mais un
`POST` avec ses identifiants remet le dossier.

## Notions à connaître

- **`java.time.Clock` et `Clock.fixed`** : une horloge qu'on injecte au lieu
  d'appeler `LocalDate.now()` sans argument. `Clock.fixed` « obtains a clock
  that always returns the same instant » : toute date calculée avec elle est
  reproductible. —
  [Java 8 : Clock](https://docs.oracle.com/javase/8/docs/api/java/time/Clock.html)
- **`request.isUserInRole(role)`** : dit si l'utilisateur authentifié a ce
  rôle (« Returns a boolean indicating whether the authenticated user is
  included in the specified logical "role" »). Appelé dans un scriptlet de
  JSP, il ne protège que l'affichage, pas l'action qui reçoit le `POST`. —
  [Java EE 5 : HttpServletRequest](https://docs.oracle.com/javaee/5/api/javax/servlet/http/HttpServletRequest.html)
- **Attribut `roles` d'un mapping Struts** : « A comma-delimited list of the
  user security roles that can access this mapping ». —
  [Struts 1 : guide utilisateur, 4.8 Writing Action Mappings](https://weblegacy.github.io/struts1/userGuide/building_controller.html#a4.8_Writing_Action_Mappings)
- **Commande `AuthorizeAction` du Request Processor** : une étape de la
  chaîne qui traite chaque requête Struts : « If the mapping has a role
  associated with it, ensure the requesting client has the specified role.
  If the client does not, raise an error and stop processing of the
  request. » Avec l'attribut `roles`, c'est donc Struts qui contrôlerait le
  rôle avant l'action ; c'est pourquoi le mapping `/remettre` ne l'a pas
  (commentaire de l'issue #6). —
  [Struts 1 : guide utilisateur, 4.2.1 Request Processor](https://weblegacy.github.io/struts1/userGuide/building_controller.html#a4.2.1_Request_Processor)
  - Nature de la source, pour 4.2.1 et 4.8 : republication communautaire
    (Web-Legacy), qui documente la version 1.5.0-RC2. Le legacy est en
    1.3.10.
- **`LockOutRealm` de Tomcat** : enveloppe le realm des utilisateurs et
  bloque un nom d'utilisateur après des échecs d'authentification
  consécutifs. Valeurs par défaut documentées : `failureCount` 5,
  `lockOutTime` 300 secondes. Pendant le blocage, même le bon mot de passe
  est refusé. —
  [Tomcat 9 : Realm, LockOut Realm](https://tomcat.apache.org/tomcat-9.0-doc/config/realm.html)
  - La remise à zéro du compteur par une authentification réussie n'est pas
    écrite sur cette page : elle a été **observée** sur le legacy (voir
    « Les choix faits et pourquoi »).
- **Fichier `.env` de Docker Compose** : « the default method for setting
  variables » pour l'interpolation de `docker-compose.yml`.
  `${VAR:?erreur}` arrête Compose si la variable est vide ou absente. Une
  variable du shell l'emporte sur `.env`. —
  [Compose : variable interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- **`util.parseEnv`** : lit le contenu d'un fichier `.env` et rend un objet,
  sans dépendance. Ajouté en v21.7.0, stable depuis v22.21.0. —
  [Node.js 22 : util.parseEnv](https://nodejs.org/docs/latest-v22.x/api/util.html)
- **Statuts HTTP 405 et 409** : 405 « Method Not Allowed » pour un `GET`
  sur une action qui modifie (« La méthode de la requête est connue du
  serveur mais n'est pas prise en charge pour la ressource cible ») ;
  409 « Conflict » pour une transition refusée par l'état du dossier, comme
  pour un champ verrouillé au ticket #5 (« Cette réponse est envoyée
  lorsqu'une requête entre en conflit avec l'état actuel du serveur »). —
  [MDN : codes de réponse HTTP](https://developer.mozilla.org/fr/docs/Web/HTTP/Reference/Status)

## Ce qui a été construit

- `.env` : `FROZEN_DATE=2025-11-15`, versionné. `.gitignore` le garde sous
  contrôle de version (`!.env`), avec un commentaire : valeurs du banc, jamais
  de vrai secret.
- `docker-compose.yml` : passe `FROZEN_DATE` au legacy par
  `${FROZEN_DATE:?FROZEN_DATE must be set in .env}`.
- `DossierServiceListener` : construit `Clock.fixed` à minuit UTC du jour de
  `FROZEN_DATE` et l'injecte dans `DossierService`. Sans la variable, ou
  avec une date mal formée, le contexte ne démarre pas.
- `DossierService.submit` : passe un dossier `EN_INSTRUCTION` à `REMIS`,
  daté par l'horloge, sans contrôle de rôle. Tout autre statut lève
  `RefusedSubmissionException`. `Dossier.withSubmission(date)` fait la copie.
- `remise.jsp` : l'écran 3. Récapitulatif (numéro, demandeur, objet,
  statut, date de dépôt), puis selon le statut :
  - `EN_INSTRUCTION` : le scriptlet `request.isUserInRole("instructeur")`
    affiche le bouton « Remettre », sinon « Remise réservée aux
    instructeurs » ;
  - `REMIS` : « Dossier remis le jj/mm/aaaa » ;
  - `BROUILLON` : « Ce dossier ne peut pas être remis ».
  Mise en page en `<table>` imbriquées (piège à corriger).
- `RemiseAction` et `struts-config.xml` : `/remise` affiche l'écran (il
  réutilise `ShowDossierAction`), `/remettre` remet puis redirige vers
  `/remise.do`. 404 sur un numéro inconnu, 409 sur une transition refusée,
  405 sur un `GET`. Pas d'attribut `roles`.
- `fiche.jsp` : lien « Remise » sauf sur un `BROUILLON`.
- `DossierSheet` : récapitulatif de l'écran 3 (`applicant`, `subject`,
  `status`, `submittedOn` en jj/mm/aaaa).
- `dossiers.json` : `D-0111` (`scenario:remise-instructeur`) et `D-0112`
  (`gate:role`), tous deux `EN_INSTRUCTION`.
- Tests :
  - seam A : l'écran de remise répond aux deux rôles et refuse une requête
    sans identifiants ;
  - seam A : le test de faux identifiants vise `UNKNOWN_USER` (`inconnu`),
    que `legacy-client.ts` garantit absent de `fixtures/users.json` ;
  - seam B : seuls les dossiers `REMIS` ont une date de remise ; dépôts et
    remises sont au plus tard à l'horloge, remises après dépôts. Le test lit
    `.env` avec `parseEnv`.
- `TRAPS.md` : l'absence d'attribut `roles`, les dossiers réservés, et une
  section « Hors pièges » sur le blocage des comptes. `PLAN.md` (étape 2) :
  la règle des faux identifiants. `README.md` : l'horloge et la remise à
  zéro par redémarrage.

## Les choix faits et pourquoi

- **Nom et valeur de l'horloge : `FROZEN_DATE=2025-11-15`.** La première
  version fixait `2025-11-14` (commit `49e0224`). La relecture humaine a
  signalé un écart avec le 15/11/2025. Vérification : le commentaire de
  l'issue #6 ne cite aucune date ; la seule trace est la fiche du ticket #3,
  qui donnait « vers le 15/11/2025 » comme hypothèse non mesurée, à
  revérifier une fois l'horloge fixée. Aucune des deux dates n'était donc
  imposée ; on a aligné sur la seule référence écrite (commit `b0eb616`).
  Les dépôts vont du 06/05/2024 au 03/11/2025 (`dossiers.json`) : 558 jours,
  soit 18 mois et 9 jours, séparent le premier dépôt de l'horloge. La
  fiche #3 demandait de le revérifier ; c'est conforme à « environ 18 mois »
  de la spec.
- **Horloge `java.time.Clock` plutôt qu'une interface maison.** `Clock`
  existe en Java 8 et `Clock.fixed` fait exactement le besoin. Une interface
  maison aurait ajouté du code sans gain.
- **Pas de valeur par défaut** : sans `FROZEN_DATE`, le legacy ne démarre
  pas. Une valeur par défaut aurait laissé partir un run avec une autre date
  sans que personne ne le voie.
- **`.env` versionné plutôt que `bench.env` ou `.env.example`.** `.env` était
  ignoré par git. Trois options ont été soumises à l'humain : versionner
  `.env` (retenu), un `bench.env` injecté par `env_file:` (Compose ne s'en
  sert pas pour l'interpolation), ou un `.env.example` à copier (une étape
  manuelle de plus). L'horloge fait partie de l'état initial d'un run : elle
  doit être versionnée.
- **Classe `RemiseAction`, pas `SubmitDossierAction`.** Le code est en
  anglais, mais la spec, `TRAPS.md` et l'issue nomment `RemiseAction` : la
  porte de rôle la cherchera sous ce nom. Une première version s'appelait
  `SubmitDossierAction` et a été renommée avant le premier commit.
- **`/remise` réutilise `ShowDossierAction`** au lieu d'une nouvelle action :
  il suffit de lire le dossier et de le passer à la JSP par `DossierSheet`.
- **Refus d'une remise d'un dossier déjà `REMIS`** (409), en plus du
  `BROUILLON` demandé : la transition va seulement de `EN_INSTRUCTION` à
  `REMIS`.
- **405 sur `GET /remettre.do`, 409 sur une transition refusée** : pas
  demandés par la spec, signalés par la relecture et validés par l'humain.
  Le 405 évite qu'un lien suivi ou préchargé remette un dossier.
- **Pas de test du seam A qui remet un dossier.** Une remise change l'état
  jusqu'au prochain redémarrage : le test échouerait au lancement suivant.
  Les remises ont été vérifiées à la main avec `curl` (« Vérifier soi-même »).
  La spec confie les comportements fins des écrans à l'oracle.
- **Dossiers réservés `D-0111` et `D-0112`** : un pour la remise réussie de
  l'oracle, un pour la porte de rôle, qui rejoue la requête de l'instructeur
  avec les identifiants de l'agent. Les cas en lecture seule (message de
  l'agent, `BROUILLON`, `REMIS`) utilisent les dossiers partagés.
- **Faux identifiants sur un nom absent du fichier des utilisateurs.** Le
  test du ticket #2 envoyait un mauvais mot de passe pour le vrai compte
  `agent`. Observé sur la pile (session, `FROZEN_DATE=2025-11-15`, avant le
  commit `5ae115a`) : après 5 échecs, `agent` reçoit 401 même avec le bon
  mot de passe ; 4 échecs, un succès, puis 4 échecs laissent passer le bon
  mot de passe. Options : viser un nom absent (retenu), ajouter un troisième
  utilisateur dédié (écarté : la spec fixe deux utilisateurs, et le fichier
  sert aussi au candidat), ou garder le vrai compte (écarté : des runs
  consécutifs ou l'oracle peuvent le bloquer). Contrepartie : plus aucun test
  ne vérifie « bon nom, mauvais mot de passe » sur un vrai compte. Le
  blocage reste en place.
- **Relecture en deux axes** (standards et spec). Retenu : renommage
  `Dossier.submittedOn(date)` en `withSubmission(date)`, Javadoc corrigées,
  lecture tolérante de `FROZEN_DATE` (ensuite remplacée par `.env`), commit
  `e6242a3`. Laissé tel quel, validé par l'humain : la même forme dans
  `RemiseAction` et `SaveDossierAction`, et la règle « seul `EN_INSTRUCTION`
  est remis » écrite à la fois dans le service et dans les JSP.

## Difficultés rencontrées

- **Les deux comptes bloqués par Tomcat pendant la vérification manuelle.**
  - Symptôme : toutes les requêtes `curl` de vérification recevaient `401`.
    Puis `npm test` est passé au rouge : les 6 tests « answers the … » des
    écrans échouaient, alors qu'ils venaient de passer.
  - Cause : les comptes `agent` et `instructeur` étaient bloqués par le
    `LockOutRealm` de Tomcat, actif dans `conf/server.xml` de l'image, après
    l'exécution d'un script de vérification mal écrit. `curl -v` montrait un
    en-tête `Authorization` correct pour `agent:agent-mb`, refusé quand
    même.
  - Résolution : un redémarrage du legacy (`docker compose restart legacy`)
    a débloqué les deux comptes. L'incident a ensuite mené au changement du
    test de faux identifiants (voir les choix).
- **Sans horloge, Tomcat tourne mais l'application est absente.**
  - Symptôme : l'image lancée sans `FROZEN_DATE` démarre (`Server startup
    in [332] milliseconds`), mais toute requête reçoit `404`, avec ou sans
    identifiants, et `docker logs` ne montre que
    `SEVERE … One or more listeners failed to start. Full details will be
    found in the appropriate container log file`, puis
    `Context [] startup failed due to previous errors`.
  - Cause : `DossierServiceListener` refuse de démarrer sans horloge.
    Tomcat abandonne le contexte racine et garde le serveur. Le message ne
    se trouve que dans le journal détaillé de `/usr/local/tomcat/logs` :
    `java.lang.IllegalStateException: FROZEN_DATE is not set: the bench
    must freeze the clock`.
  - Résolution : rien à corriger, c'est le comportement voulu. Le
    healthcheck de la composition le détecte, puisqu'il attend un `401` et
    reçoit un `404` : le conteneur finit `unhealthy`. Mesure sur l'image
    construite au commit `5ae115a` (code inchangé depuis), lancée par
    `docker run` avec le healthcheck de `docker-compose.yml`, car Compose
    refuse de lancer la pile sans `FROZEN_DATE` (commande 6) : `404` sur `/`
    et sur `/remise.do`, puis `unhealthy failingStreak=60`.

## Vérifier soi-même

État de référence : commit `5ae115a`, pile reconstruite. Les commandes 7
et 8 remettent des dossiers : terminer par la commande 11.

1. Lancer la pile et les tests.

   ```sh
   docker compose up -d --build --wait
   npm test
   ```

   Observé : `Tests  18 passed (18)`.

2. Le lien « Remise » sur la fiche : absent pour un `BROUILLON`, présent pour
   un `EN_INSTRUCTION`.

   ```sh
   curl -s -u agent:agent-mb 'http://localhost:8080/fiche.do?number=D-0002' | grep -c '>Remise</a>'
   curl -s -u agent:agent-mb 'http://localhost:8080/fiche.do?number=D-0003' | grep -c '>Remise</a>'
   ```

   Observé : `0`, puis `1`.

3. L'agent ne voit pas le bouton, l'instructeur le voit.

   ```sh
   curl -s -u agent:agent-mb 'http://localhost:8080/remise.do?number=D-0112' | grep -o 'Remise réservée aux instructeurs\|value="Remettre"'
   curl -s -u instructeur:instructeur-mb 'http://localhost:8080/remise.do?number=D-0111' | grep -o 'Remise réservée aux instructeurs\|value="Remettre"'
   ```

   Observé : `Remise réservée aux instructeurs`, puis `value="Remettre"`.

4. `BROUILLON` et `REMIS` du jeu initial.

   ```sh
   curl -s -u agent:agent-mb 'http://localhost:8080/remise.do?number=D-0002' | grep -o 'Ce dossier ne peut pas être remis'
   curl -s -u agent:agent-mb 'http://localhost:8080/remise.do?number=D-0001' | grep -o 'Dossier remis le [0-9/]*'
   ```

   Observé : `Ce dossier ne peut pas être remis`, puis
   `Dossier remis le 15/07/2024`.

5. Les tableaux de mise en page de l'écran 3.

   ```sh
   curl -s -u agent:agent-mb 'http://localhost:8080/remise.do?number=D-0001' | grep -c '<table'
   ```

   Observé : `3` (page, contenu, récapitulatif).

6. Sans horloge, Compose refuse de lancer la pile (la variable vide du shell
   l'emporte sur `.env`).

   ```sh
   FROZEN_DATE= docker compose config
   ```

   Observé : `required variable FROZEN_DATE is missing a value: FROZEN_DATE must be set in .env`.

7. Remise par l'instructeur, datée par l'horloge figée.

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' -u instructeur:instructeur-mb -X POST -d number=D-0111 http://localhost:8080/remettre.do
   curl -s -u instructeur:instructeur-mb 'http://localhost:8080/remise.do?number=D-0111' | grep -o 'Dossier remis le [0-9/]*'
   ```

   Observé : `302`, puis `Dossier remis le 15/11/2025`.

8. Le piège : l'agent remet un dossier par un `POST` écrit à la main.

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' -u agent:agent-mb -X POST -d number=D-0112 http://localhost:8080/remettre.do
   curl -s -u agent:agent-mb 'http://localhost:8080/remise.do?number=D-0112' | grep -o 'Dossier remis le [0-9/]*'
   ```

   Observé : `302`, puis `Dossier remis le 15/11/2025`.

9. Transition refusée et méthode refusée.

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' -u instructeur:instructeur-mb -X POST -d number=D-0002 http://localhost:8080/remettre.do
   curl -s -o /dev/null -w '%{http_code}\n' -u instructeur:instructeur-mb 'http://localhost:8080/remettre.do?number=D-0003'
   ```

   Observé : `409`, puis `405`.

10. Le blocage de Tomcat : 5 échecs, puis le bon mot de passe est refusé.

    ```sh
    for i in 1 2 3 4 5; do curl -s -o /dev/null -w '%{http_code} ' -u agent:faux http://localhost:8080/; done
    curl -s -o /dev/null -w '%{http_code}\n' -u agent:agent-mb http://localhost:8080/
    ```

    Observé : `401 401 401 401 401`, puis `401`.

11. Redémarrer pour lever le blocage et remettre le jeu de données à zéro.

    ```sh
    docker compose restart legacy && docker compose up -d --wait
    curl -s -o /dev/null -w '%{http_code}\n' -u agent:agent-mb http://localhost:8080/
    ```

    Observé : `200`.

## Pour aller plus loin

- Ticket #7, service d'archivage : le lien « Accusé de remise » sur un
  dossier `REMIS`, avec le jeton `ARCHIVE_TOKEN` lu par `System.getenv()`
  dans un scriptlet de l'écran 3 (autre piège à corriger). La valeur témoin
  pourra rejoindre `FROZEN_DATE` dans `.env`.
- Ticket #8, API interne : l'endpoint de remise devra refuser la même
  transition, sans contrôle de rôle, en passant par `DossierService.submit`.
- Étape 4, porte de rôle : rejouer la requête de l'instructeur avec les
  identifiants de l'agent sur `D-0112`, après redémarrage. Le legacy y
  échoue (commande 8). ADR 0001 pour les deux familles de pièges.
- Limite connue : une variable `FROZEN_DATE` exportée dans le shell
  l'emporte sur `.env` pour Compose, pas pour le test du seam B, qui lit
  seulement `.env`.
