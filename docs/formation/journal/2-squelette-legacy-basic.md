# #2 · Étape 1 · 1. Squelette du legacy servi en BASIC

## Objectif

Le banc n'avait encore rien à migrer. Ce ticket pose le squelette du legacy :
`docker compose up` construit puis démarre une application Struts 1.3.10
(Java 8, Maven, Tomcat 9). Elle sert une page minimale sur le port `8080`,
protégée par l'authentification `BASIC` de Tomcat, pour deux utilisateurs
fixes : un agent et un instructeur. Le ticket installe aussi l'outillage des
tests du banc (Node 22, TypeScript strict, Vitest) et le premier test du
seam A, qui appelle le legacy par HTTP (seam A et seam B sont définis dans
[`GLOSSARY.md`](../../../GLOSSARY.md)).

## Notions à connaître

- **Authentification HTTP `BASIC`** : le serveur répond `401` avec un en-tête
  `WWW-Authenticate: Basic realm="…"`, puis le client renvoie la requête avec
  l'en-tête `Authorization: Basic <base64(utilisateur:mot de passe)>`. Il n'y a
  pas d'écran de connexion. —
  [MDN : authentification HTTP](https://developer.mozilla.org/fr/docs/Web/HTTP/Guides/Authentication)
- **Realm Tomcat et `tomcat-users.xml`** : un realm est la base d'utilisateurs
  que Tomcat consulte. Par défaut, il lit les utilisateurs et leurs rôles dans
  `conf/tomcat-users.xml`. —
  [Tomcat 9 : Realm Configuration How-To](https://tomcat.apache.org/tomcat-9.0-doc/realm-howto.html)
- **Sécurité déclarative dans `web.xml`** : `<security-constraint>` dit quelles
  URL sont protégées et quels rôles y ont accès, et `<login-config>` choisit le
  mode (`BASIC`). Le code Java n'intervient pas. Le `web.xml` du legacy
  déclare la version 2.5 de la spécification Servlet, celle de Java EE 5. —
  [Java EE 5 Tutorial : Defining Security Requirements for Web Applications](https://docs.oracle.com/javaee/5/tutorial/doc/bncbe.html)
- **Struts 1 et `struts-config.xml`** : l'`ActionServlet` reçoit les URL
  `*.do` et les associe à des `<action>`. L'attribut `forward` d'une action
  renvoie directement vers une ressource, une JSP par exemple, sans classe
  Java. —
  [DTD struts-config 1.3](https://struts.apache.org/dtds/struts-config_1_3.dtd)
- **Fin de vie de Struts 1** : Apache ne maintient plus Struts 1. C'est ce
  qui fait de l'application un legacy réaliste. —
  [annonce de fin de vie de Struts 1](https://struts.apache.org/struts1eol-announcement.html)
- **Packaging `war` avec Maven** : `mvn package` produit une archive web
  (`.war`). Nommée `ROOT.war`, elle est servie à la racine `/` de Tomcat. —
  [Maven WAR Plugin](https://maven.apache.org/plugins/maven-war-plugin/)
- **Build Docker multi-étapes** : plusieurs `FROM` dans un même `Dockerfile`.
  Chaque étape produit un artefact, et seul le nécessaire est copié dans
  l'image finale. —
  [Docker : multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- **Healthcheck Compose et `--wait`** : un `healthcheck` dit quand un service
  est prêt, et `docker compose up --wait` attend cet état avant de rendre la
  main. —
  [Compose : healthcheck](https://docs.docker.com/reference/compose-file/services/#healthcheck)
- **Effacement des types TypeScript par Node 22** : avec
  `--experimental-strip-types`, Node exécute un fichier `.ts` en retirant les
  annotations de type. Seule la syntaxe effaçable est permise, d'où
  `erasableSyntaxOnly` dans `tsconfig.json`. —
  [Node.js 22 : modules TypeScript](https://nodejs.org/docs/latest-v22.x/api/typescript.html)
- **TypeScript strict** : `strict` active l'ensemble des vérifications
  strictes du compilateur. —
  [TSConfig : strict](https://www.typescriptlang.org/tsconfig/#strict)
- **Vitest et `it.each`** : `it.each` lance le même test sur une liste de
  valeurs, ici les deux rôles. —
  [Vitest : test.each](https://vitest.dev/api/#test-each)
- **`fetch`** : l'API HTTP standard, intégrée à Node 22, avec laquelle le test
  appelle le legacy. —
  [MDN : Fetch API](https://developer.mozilla.org/fr/docs/Web/API/Fetch_API)

## Ce qui a été construit

- `package.json`, `tsconfig.json`, `vitest.config.ts`, `.nvmrc` : l'outillage
  des tests du banc. `npm test` lance Vitest, `npm run typecheck` lance
  `tsc --noEmit`.
- `fixtures/users.json` : le fichier des utilisateurs, versionné, avec un
  agent et un instructeur. C'est la source unique des identités (ADR 0003).
  Il servira aussi plus tard de `USERS_FILE` à la couche serveur du candidat.
- `scripts/generate-tomcat-users.ts` : valide le fichier des utilisateurs (un
  rôle doit être `agent` ou `instructeur`) et écrit `tomcat-users.xml`. Le
  test réutilise son analyseur, `parseUsers`.
- `fixtures/legacy-app/` : le projet Maven du legacy.
  - `pom.xml` : Java 8, `struts-core` et `struts-taglib` 1.3.10.
  - `web.xml` : `ActionServlet` sur `*.do`, contrainte `BASIC` sur `/*` pour
    les rôles `agent` et `instructeur`.
  - `struts-config.xml` : l'action `/recherche`.
  - `index.jsp` : renvoie vers `/recherche.do`.
  - `WEB-INF/jsp/recherche.jsp` : la page minimale « Recherche de dossiers ».
- `fixtures/legacy-app/Dockerfile` : trois étapes. Node génère
  `tomcat-users.xml`, Maven construit `ROOT.war`, puis Tomcat 9 sur JDK 8
  reçoit les deux fichiers.
- `docker-compose.yml` : le service `legacy`, le port `8080` publié, un
  healthcheck. `.dockerignore` exclut `node_modules`, `target` et `.git` du
  contexte de build.
- `tests/seam-a/legacy-basic-auth.test.ts` : le test du seam A, en quatre cas.
  La page répond `200` à l'agent et à l'instructeur ; une requête sans
  identifiants reçoit `401` avec `WWW-Authenticate: Basic realm="migrabench"`
  (preuve qu'il n'y a pas d'écran de connexion) ; un mauvais mot de passe
  reçoit `401`.
- `README.md` : comment lancer le legacy et les tests du banc.

## Les choix faits et pourquoi

- **Générer `tomcat-users.xml` pendant le build de l'image**, dans une étape
  Node du `Dockerfile`. Le critère d'acceptation impose
  « `docker compose up` sans étape manuelle ». Une génération lancée à la main
  avant `docker compose up` a été écartée. Contrepartie : après une
  modification de `fixtures/users.json`, il faut relancer avec `--build`, ce
  que dit le README.
- **Écrire le générateur en TypeScript, exécuté par Node 22 sans compilation**
  (`--experimental-strip-types`). La stack du banc est en TypeScript, et cette
  option évite d'ajouter un outil de compilation. Dans l'image, le fichier est
  copié avec l'extension `.mts`, pour être lu comme un module ES sans
  `package.json` à côté. C'était une précaution. Un essai fait pendant la
  rédaction de cette fiche montre que Node 22.23.5 exécute aussi le fichier
  sous son nom `.ts` (`exit=0`, deux utilisateurs générés) : le renommage
  n'est pas nécessaire.
- **Pas de test unitaire du générateur.** La spec ne fixe que deux seams pour
  l'étape 1 (HTTP et lecture du jeu de données). Le seam A couvre le
  générateur de bout en bout : les identifiants lus dans
  `fixtures/users.json` doivent passer l'authentification de Tomcat.
- **Attribut `forward` de `<action>` plutôt que `ForwardAction`.** En
  Struts 1.3, `ForwardAction` est dans l'artefact `struts-extras`, que le
  projet n'inclut pas (voir Difficultés). Ajouter une dépendance demande une
  justification (`CLAUDE.md`), alors que l'attribut `forward` fait le même
  travail sans rien ajouter.
- **Le war s'appelle `ROOT`**, pour que le legacy soit servi à
  `http://localhost:8080/` sans chemin de contexte.
- **Images Docker figées au correctif près** : `node:22.23.5-alpine`,
  `maven:3.9.16-eclipse-temurin-8`, `tomcat:9.0.124-jdk8-temurin`. Les tags
  flottants comme `tomcat:9.0-jdk8-temurin` ont été écartés : la règle 1 de
  `PROTOCOL.md` exige le même état initial à chaque run.
- **Un healthcheck qui attend un `401`**, au lieu de tester seulement que le
  port est ouvert. Le premier healthcheck vérifiait le port, et il a été
  remplacé par crainte que Tomcat ouvre le port avant d'avoir déployé le war.
  Une observation faite pendant la rédaction de cette fiche montre l'inverse
  avec Tomcat 9.0.124 : le journal annonce
  `Deployment of web application archive … has finished`, puis
  `Starting ProtocolHandler ["http-nio-8080"]`, et le port s'ouvre au moment
  où l'application répond déjà `401`. Le healthcheck sur le port aurait donc
  suffi. Celui qui attend `401` vérifie en plus que l'application déployée
  exige l'authentification.
- **La page porte le titre « Recherche de dossiers »**, l'écran 1. Ce titre
  anticipe le ticket #3, qui construira l'écran. La relecture l'a relevé et le
  choix a été gardé : le test en dépend, et le ticket #3 devra le reprendre.
- **Contrainte `BASIC` sur `/*`.** Tout le legacy est protégé. La relecture a
  noté que le ticket #8 devra la restreindre, parce que l'API interne ignore
  l'identité de l'appelant (ADR 0003).
- **Corrections après relecture** (commit `refactor`) :
  - un seul type `User` / `Role`, exporté par le générateur et réutilisé par
    le test, qui en avait une copie ;
  - les rôles validés par le générateur ;
  - le paramètre `candidate` renommé, parce que « candidat » est un mot
    réservé du banc (`PROTOCOL.md`) ;
  - `engines` fixé à Node 22 (`^22`).
- **Versions de l'outillage** : `vitest` 5.1.0, `typescript` 7.0.2 et
  `@types/node` 22.20.5, soit les versions publiées le jour du ticket
  (`npm view`), avec `@types/node` aligné sur Node 22.

## Difficultés rencontrées

- **Docker n'était pas démarré.**
  - Symptôme : `Cannot connect to the Docker daemon at
    unix:///…/.docker/run/docker.sock. Is the docker daemon running?`
  - Cause : Docker Desktop était arrêté.
  - Résolution : `open -a Docker`, puis reprise une fois le démon prêt.
- **Erreur 500 au premier démarrage.**
  - Symptôme : avec les bons identifiants, le test reçoit `500` au lieu de
    `200`, et le journal Tomcat affiche
    `java.lang.ClassNotFoundException: org.apache.struts.actions.ForwardAction`.
    L'authentification marchait déjà : l'erreur arrivait après elle.
  - Cause : en Struts 1.3, `ForwardAction` n'est pas dans `struts-core` mais
    dans `struts-extras`. On l'a vérifié en listant le contenu des deux jars
    1.3.10 de Maven Central.
  - Résolution : `<action path="/recherche" forward="…"/>`, sans classe
    d'action.
- **Deux tests jamais passés par le rouge.**
  - Symptôme : les tests « sans identifiants » et « mauvais mot de passe »
    ont réussi dès leur premier lancement.
  - Cause : la contrainte de sécurité existait déjà, puisqu'elle avait été
    écrite avec le premier test.
  - Résolution : pour prouver qu'ils mesurent quelque chose, on a retiré la
    contrainte `BASIC` de `web.xml` et reconstruit. État de la mesure : dans
    la session, avant le premier commit, avec les quatre tests du seam A
    écrits. Résultat : les deux tests échouent
    (`Tests  2 failed | 2 passed (4)`). La contrainte a ensuite été restaurée.
    Le test négatif de `parseUsers`, ajouté après la relecture, a suivi le même
    chemin : il est vert d'emblée, et rouge (`Tests  1 failed (1)`) quand on
    retire le contrôle du rôle de `scripts/users.ts`, sur l'état du commit
    `f9492e3`.
- **La preuve du rouge ne correspondait pas à l'historique.**
  - Symptôme : la PR annonçait le rouge du premier test (`Tests  2 failed (2)`,
    `ECONNREFUSED 127.0.0.1:8080`) comme s'il sortait du commit de test
    `d1dd4cc`. La relecture a montré que ce commit ne le reproduit pas.
    Relancé sur `d1dd4cc`, pile démarrée, il échoue au chargement :
    `Error: ENOENT: no such file or directory, open '…/fixtures/users.json'`,
    `Tests  no tests`.
  - Cause : la mesure a été prise dans la session, sur un état non commité.
    `fixtures/users.json` existait déjà, seul le premier test
    (`answers the %s`, deux cas) était écrit, et le legacy n'existait pas
    encore. Les commits ont été découpés après coup : le commit de test
    contient les quatre tests, et `fixtures/users.json` n'arrive qu'au commit
    suivant.
  - Résolution : le texte de la PR et celui de cette fiche citent désormais
    l'état de la session. L'historique est gardé tel quel, puisque la fusion
    se fait en squash. `CLAUDE.md` gagne la règle « une preuve cite l'état
    exact où elle a été obtenue ».

## Vérifier soi-même

Prérequis : Docker démarré, Node 22, `npm install`.

```sh
docker compose up -d --build --wait
```

Attendu : `Container migrabench-legacy-1  Healthy`

```sh
npm test
```

Attendu : `Tests  4 passed (4)`

```sh
npm run typecheck
```

Attendu : aucune erreur après la ligne `> tsc --noEmit`.

```sh
curl -s -i http://localhost:8080/ | grep -iE '^HTTP|^WWW-Authenticate'
```

Attendu : `401` et le défi `BASIC`. Il n'y a pas de redirection vers un écran
de connexion.

```text
HTTP/1.1 401
WWW-Authenticate: Basic realm="migrabench"
```

```sh
curl -s -o /dev/null -w '%{http_code}\n' -u agent:agent-mb http://localhost:8080/
curl -s -u instructeur:instructeur-mb http://localhost:8080/ | grep -o '<h1>.*</h1>'
```

Attendu : `200`, puis `<h1>Recherche de dossiers</h1>`

```sh
docker compose exec legacy grep '<user' conf/tomcat-users.xml
```

Attendu : les deux entrées générées depuis `fixtures/users.json`.

```text
<user username="agent" password="agent-mb" roles="agent"/>
<user username="instructeur" password="instructeur-mb" roles="instructeur"/>
```

```sh
docker compose exec legacy sh -c 'java -version 2>&1 | head -1; bin/version.sh | grep "Server number"; ls webapps/ROOT/WEB-INF/lib | grep struts'
```

Attendu : Java 8, Tomcat 9, Struts 1.3.10.

```text
openjdk version "1.8.0_512"
Server number:  9.0.124.0
struts-core-1.3.10.jar
struts-taglib-1.3.10.jar
```

Exercice : retirer le bloc qui va de `<security-constraint>` à
`</login-config>` dans `fixtures/legacy-app/src/main/webapp/WEB-INF/web.xml`,
puis relancer `docker compose up -d --build --wait` et `npm test`.

Attendu : `Tests  2 failed | 2 passed (4)`. Restaurer le fichier ensuite
(`git checkout -- fixtures/legacy-app`).

## Pour aller plus loin

- **Ticket #3** (jeu de données et recherche de dossiers) : il remplace la
  page minimale par l'écran 1 et ajoute le seam B, la lecture statique du jeu
  de données.
- **Ticket #8** (API interne isolée sur le port `8081`) : la contrainte
  `BASIC` posée sur `/*` devra exclure l'API interne, qui ignore l'identité de
  l'appelant (ADR 0003 et ADR 0004).
- **ADR 0003** : pourquoi un même fichier des utilisateurs sert le legacy et
  la couche serveur du candidat.
- **Limite connue** : `tomcat-users.xml` n'est régénéré qu'au build. Un
  `docker compose up` sans `--build` après une modification de
  `fixtures/users.json` sert les anciens utilisateurs.
