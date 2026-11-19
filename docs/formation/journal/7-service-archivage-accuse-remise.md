# #7 · Étape 1 · 6. Service d'archivage et accusé de remise

## Objectif

L'écran 3 savait remettre un dossier, mais le lien « Accusé de remise »
promis à l'instructeur (spec, story 40) ne menait nulle part. Ce ticket ajoute
le **service d'archivage simulé** à la composition Docker et le lien sur un
dossier `REMIS`. Il plante le piège du **secret lu par `System.getenv()` dans
un scriptlet** : la valeur témoin `ARCHIVE_TOKEN` part en clair dans le HTML
et dans l'URL. C'est un piège à corriger (la porte du secret mesurera la
fuite) avec une face à préserver (l'oracle vérifiera que l'accusé s'obtient
toujours).

## Notions à connaître

- **Scriptlet JSP `<% … %>`** : un bloc de code Java placé dans la page et
  exécuté côté serveur à chaque requête. —
  [The Java EE 5 Tutorial : JSP Scriptlets](https://docs.oracle.com/javaee/5/tutorial/doc/bnaou.html)
- **Expression JSP `<%= … %>`** : la syntaxe est
  `<%= scripting-language-expression %>`. La valeur de l'expression est
  convertie en chaîne et écrite telle quelle dans la page, sans échappement.
  Tout ce qu'elle produit arrive donc au navigateur. —
  [The Java EE 5 Tutorial : JSP Expressions](https://docs.oracle.com/javaee/5/tutorial/doc/bnaov.html)
  - L'exemple du tutoriel fait lui-même ce que fait le piège. Un scriptlet
    calcule `resp = hello.sayHello(request.getParameter("username"))`, une
    valeur issue d'un paramètre de requête. Puis `<%= resp %>` l'écrit dans
    `<h2>` sans échappement. C'est la documentation officielle qui montre ce
    schéma, ce qui explique qu'il soit si courant dans les legacy JSP.
- **`System.getenv(name)`** : « Gets the value of the specified environment
  variable ». Le legacy lit ainsi `ARCHIVE_TOKEN`, que le banc lui passe par
  `env_file`. Sans la variable, la méthode rend `null`. —
  [Java 8 : System](https://docs.oracle.com/javase/8/docs/api/java/lang/System.html)
- **Secret dans une URL** : une valeur placée dans la chaîne de requête se
  retrouve dans l'historique du navigateur, les journaux des serveurs et les
  en-têtes `Referer`. C'est ce que la porte du secret cherchera dans le HTML
  et le HAR. —
  [OWASP : Information exposure through query strings in URL](https://owasp.org/www-community/vulnerabilities/Information_exposure_through_query_strings_in_url)
- **`node:http` et `createServer`** : le serveur HTTP de la bibliothèque
  standard de Node, sans framework ni dépendance. Le service d'archivage
  tient en un fichier avec lui. —
  [Node.js 22 : HTTP](https://nodejs.org/docs/latest-v22.x/api/http.html)
- **`--experimental-strip-types`** : Node 22 exécute un fichier `.ts` en
  retirant les annotations de type, sans étape de compilation. Le Dockerfile
  du legacy s'en sert déjà pour générer `tomcat-users.xml`. —
  [Node.js 22 : Modules, TypeScript](https://nodejs.org/docs/latest-v22.x/api/typescript.html)
- **Réseau Compose `internal: true`** : Compose donne par défaut un accès
  extérieur aux réseaux ; `internal: true` « lets you create an externally
  isolated network ». C'est `mb-internal` de l'ADR 0004. —
  [Compose : networks](https://docs.docker.com/reference/compose-file/networks/)
- **Ports publiés et `healthcheck` d'un service Compose** :
  `"127.0.0.1:8090:8090"` publie le port sur la seule boucle locale de
  l'hôte (règle de l'ADR 0004) ; `healthcheck` dit à
  `docker compose up --wait` quand le service est prêt. —
  [Compose : services](https://docs.docker.com/reference/compose-file/services/)
- **Statut HTTP 403** : le serveur a compris la requête mais refuse de
  l'autoriser. Le service le rend pour un jeton faux, vide ou absent. —
  [MDN : 403 Forbidden](https://developer.mozilla.org/fr/docs/Web/HTTP/Reference/Status/403)

## Ce qui a été construit

- `fixtures/archive-service/server.ts` : le service d'archivage, un fichier,
  une route, `GET /accuse-de-remise?jeton=…&numero=…`. Il rend l'accusé
  (`200`, « Accusé de remise du dossier D-xxxx ») si `jeton` est égal à
  `ARCHIVE_TOKEN`, et `403` « Jeton refusé » sinon. Toute autre route : `404`.
  Le numéro est échappé avant d'être écrit dans le HTML. Sans
  `ARCHIVE_TOKEN`, le service refuse de démarrer.
- `fixtures/archive-service/Dockerfile` : image `node:22.23.5-alpine` (la
  même base que la génération des utilisateurs du legacy), utilisateur
  `node`, port `8090`.
- `docker-compose.yml` : service `archive`, sur le réseau par défaut et sur
  `mb-internal` (déclaré `internal: true`), port publié
  `127.0.0.1:8090:8090`, `env_file: .env`, et un `healthcheck` qui attend un
  `403` sans jeton, sur le modèle du `401` du legacy.
- `.env` : `ARCHIVE_TOKEN=mbtemoin-7c41e9a2b58d306f`, à côté de
  `FROZEN_DATE`. Le legacy et le service d'archivage le lisent tous deux.
- `remise.jsp` : sur un dossier `REMIS`, sous « Dossier remis le … », le lien
  `http://localhost:8090/accuse-de-remise?jeton=<%= System.getenv("ARCHIVE_TOKEN") %>&amp;numero=…`,
  avec un commentaire « Ne pas corriger ».
- Tests du seam A :
  - `tests/seam-a/archive-client.ts` : adresse du service (`ARCHIVE_URL`,
    par défaut `http://localhost:8090`), valeur témoin lue dans `.env` avec
    `parseEnv`, construction de l'URL de l'accusé ;
  - `tests/seam-a/archive-service.test.ts` : accusé délivré avec le bon
    jeton ; refusé avec un jeton faux, le jeton en majuscules, un jeton vide,
    sans jeton ;
  - `tests/seam-a/receipt-link.test.ts` : sur `D-0001` (`REMIS`, partagé en
    lecture), le lien de l'écran 3 porte la valeur témoin, et le suivre donne
    l'accusé.
- Documentation : `TRAPS.md` (route, réponses, port, valeur témoin),
  `docs/specs/01-legacy-app.md` (décisions tranchées par #7), `README.md`
  (service d'archivage, `ARCHIVE_URL`), commentaire de `.gitignore`.

## Les choix faits et pourquoi

- **TypeScript lancé par Node 22, sans dépendance.** La stack du banc est
  Node 22 et TypeScript, et `node:http` suffit pour une route. Un service en
  Java aurait demandé une seconde image Maven ; un framework (Express…) une
  dépendance à justifier pour rien.
- **Port `8090` publié sur `127.0.0.1`.** Proche des `8080`/`8081` du legacy
  et libre ; lié à la boucle locale comme tout port publié (ADR 0004).
- **Valeur témoin `mbtemoin-7c41e9a2b58d306f`.** Fixe, unique, reconnaissable
  (préfixe `mbtemoin`). Seulement des minuscules, des chiffres et un tiret :
  son encodage pour une URL est elle-même, ce qui simplifie la recherche de la
  porte (en clair, en base64, encodée pour une URL).
- **Comparaison stricte du jeton, casse comprise.** Un test vérifie que le
  jeton en majuscules est refusé : seule la valeur témoin exacte ouvre
  l'accusé.
- **Le service ne connaît pas les dossiers.** Il ne vérifie pas le numéro :
  la spec demande « un fichier, une route » et une décision sur le jeton
  seulement. L'accusé reprend le numéro reçu.
- **Adresse du service écrite en dur dans la JSP** (`http://localhost:8090`)
  plutôt qu'une seconde variable d'environnement : c'est ainsi qu'un vrai
  legacy l'écrirait, et une seconde lecture de `System.getenv()` aurait
  brouillé le piège. Contrepartie : changer le port publié oblige à modifier
  la JSP ; le test du lien le détecterait.
- **`archive` sur deux réseaux.** Il est sur `mb-internal` pour la future
  couche serveur du candidat, et sur le réseau par défaut pour publier le port
  vers le navigateur. Un service branché seulement sur un réseau
  `internal: true` ne publie pas son port. Mesuré avec un service jetable dans
  une composition temporaire (voir « Vérifier soi-même »).
- **Le legacy n'est pas encore sur `mb-internal`.** Son port `8081` et le
  filtre par port arrivent avec #8 ; ce ticket ne fait que déclarer le réseau.
- **`healthcheck` sur un `403` sans jeton**, pour garder « une route » sans
  ajouter de route de santé.
- **Test du lien en plus des tests demandés.** Le ticket demande les tests
  du service ; le test du lien vérifie ce que le banc suppose du legacy : la
  porte du secret doit y échouer, le scénario de l'accusé doit y réussir.
- **Relecture en deux axes** (standards et spec). Retenu (commit `880a2a2`) :
  correction de « à la casse près » dans `TRAPS.md`, deux commentaires de
  `docker-compose.yml` mis à jour, `TOKEN` renommé `ARCHIVE_TOKEN` dans
  `server.ts`. Laissé tel quel : `.env` lu par deux helpers de test (seam A
  et seam B), et les paramètres `jeton`/`numero` de `receiptUrl`, qui
  reprennent les noms de l'URL.

## Difficultés rencontrées

- **Un test rouge qui ne lance aucun test.** Symptôme : au premier lancement
  de `archive-service.test.ts`, `Test Files 1 failed`, `Tests no tests`.
  Cause : `archive-client.ts` lit `ARCHIVE_TOKEN` au chargement du module et
  lève « ARCHIVE_TOKEN is missing from .env ». Résolution : ajout de la valeur
  témoin à `.env` ; le test échoue alors pour la bonne raison
  (`ECONNREFUSED 127.0.0.1:8090`, le service n'existe pas encore).
- **« À la casse près » disait le contraire.** Symptôme : `TRAPS.md` écrivait
  que le jeton devait être égal à `ARCHIVE_TOKEN` « à la casse près ».
  Cause : en français, l'expression veut dire « sans tenir compte de la
  casse », alors que le code et le test refusent le jeton en majuscules.
  Relevé par la relecture « standards ». Résolution : « en respectant la
  casse » (commit `880a2a2`).
- **Commentaires de la composition devenus faux.** Le commentaire
  `env_file` du legacy ne citait que `FROZEN_DATE`, et celui de
  `mb-internal` y plaçait le port `8081` du legacy, qui n'y est pas encore.
  Relevé par la même relecture, corrigé dans `880a2a2`.

## Vérifier soi-même

Sorties observées sur la pile au commit `880a2a2`, Node v22.23.5.

```sh
docker compose up -d --build --wait
# … Container migrabench-archive-1  Healthy
# … Container migrabench-legacy-1  Healthy

docker port migrabench-archive-1
# 8090/tcp -> 127.0.0.1:8090

curl -s -w '\nHTTP %{http_code}\n' 'http://localhost:8090/accuse-de-remise?jeton=mbtemoin-7c41e9a2b58d306f&numero=D-0001'
# … <h1>Accusé de remise du dossier D-0001</h1> …
# HTTP 200

curl -s -w 'HTTP %{http_code}\n' 'http://localhost:8090/accuse-de-remise?jeton=faux&numero=D-0001'
# Jeton refusé
# HTTP 403

curl -s -w 'HTTP %{http_code}\n' 'http://localhost:8090/accuse-de-remise?numero=D-0001'
# Jeton refusé
# HTTP 403
```

Le piège, sur l'écran 3 de `D-0001` (identifiants de l'instructeur dans
`fixtures/users.json`) :

```sh
curl -s -u '<instructeur>:<mot de passe>' 'http://localhost:8080/remise.do?number=D-0001' \
  | grep -o '<a href="[^"]*">Accusé de remise</a>'
# <a href="http://localhost:8090/accuse-de-remise?jeton=mbtemoin-7c41e9a2b58d306f&amp;numero=D-0001">Accusé de remise</a>
```

Les deux sorties suivantes ont été observées pendant la session, avant le
premier commit, sur l'arbre de travail au-dessus de `dbcaa0d` dont le code est
celui de `580dbff`. Depuis, le service n'a changé que par le renommage de
`TOKEN` en `ARCHIVE_TOKEN`.

Le service est joignable par `mb-internal`, sans passer par l'hôte :

```sh
docker network ls --filter name=mb-internal --format '{{.Name}} internal={{.Internal}}'
# migrabench_mb-internal internal=true
docker run --rm --network migrabench_mb-internal node:22.23.5-alpine node -e "fetch('http://archive:8090/accuse-de-remise?jeton=mbtemoin-7c41e9a2b58d306f&numero=D-0001').then(async r=>console.log(r.status,(await r.text()).match(/<h1>(.*)<\/h1>/)[1]))"
# 200 Accusé de remise du dossier D-0001
```

Sans valeur témoin, le service ne démarre pas :

```sh
docker run --rm migrabench-archive; echo "exit=$?"
# ARCHIVE_TOKEN is not set: the archive service cannot start
# exit=1
```

Un port publié ne sort pas d'un réseau `internal: true`. Mesure faite avec
Docker Engine 29.1.3 et Compose 2.40.3-desktop.1, avec un service jetable
dans une composition temporaire hors du dépôt. Le service est branché
seulement sur un réseau `internal: true`, avec
`ports: ["127.0.0.1:18099:8099"]`. Fichier `compose.yml` :

```yaml
name: mbprobe-internal
services:
  probe:
    image: node:22.23.5-alpine
    command: ["node", "-e", "require('node:http').createServer((q, r) => r.end('probe ok\\n')).listen(8099)"]
    ports:
      - "127.0.0.1:18099:8099"
    networks:
      - only-internal
networks:
  only-internal:
    internal: true
```

```sh
docker compose up -d
docker compose ps --format '{{.Name}} {{.State}} {{.Ports}}'
# mbprobe-internal-probe-1 running 8099/tcp        ← aucune liaison vers l'hôte
docker port mbprobe-internal-probe-1
# (aucune sortie)
curl -sS -m 5 http://127.0.0.1:18099/
# curl: (7) Failed to connect to 127.0.0.1 port 18099 after 1 ms: Couldn't connect to server
docker compose exec -T probe wget -qO- http://127.0.0.1:8099/
# probe ok                                         ← le service tourne bien
docker compose down
```

Le conteneur, le réseau et le fichier ont été supprimés après la mesure.

Les tests du banc :

```sh
npm run typecheck   # aucune erreur
npm test
# Test Files  6 passed (6)
#      Tests  24 passed (24)
```

Vérification humaine dans le navigateur, sur `D-0001` : la valeur témoin est
dans le code source de la page, l'accusé est délivré au clic, et un jeton
modifié dans l'URL est refusé.

## Pour aller plus loin

- **Ticket #8** : l'API interne sur le port `8081`, sur `mb-internal`. Le
  dernier des deux tickets fusionné vérifie le critère de fin de l'étape 1
  et met à jour l'état du README.
- **ADR 0004** (topologie Docker) : pourquoi deux réseaux et trois ports
  publiés seulement.
- **ADR 0001** (pièges à corriger et à préserver) : ce piège a les deux
  faces. Un candidat devra garder l'accès à l'accusé sans exposer la valeur
  témoin au navigateur, par exemple en passant par sa couche serveur, qui
  recevra `ARCHIVE_URL` et `ARCHIVE_TOKEN` (étape 3).
- **Porte du secret** (étape 4) : chercher la valeur témoin en clair, en
  base64 et encodée pour une URL, dans le bundle, le HTML et le HAR.
