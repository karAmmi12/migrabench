# #8 · Étape 1 · 7. API interne isolée sur le port 8081

## Objectif

La couche serveur du candidat doit rechercher, lire, modifier et remettre un
dossier sans analyser le HTML des JSP (ADR 0003). Ce ticket ajoute au legacy
l'**API interne** JSON qui fait ces quatre opérations en passant par le
service métier. Elle est servie par un second port Tomcat, `8081`, qui n'est
pas publié sur l'hôte. Un **filtre par port** refuse l'API interne sur `8080`,
pour que le front d'un candidat ne puisse pas contourner sa propre couche
serveur. Comme #7 était déjà fusionné, ce ticket clôt aussi le critère de fin
de l'étape 1.

## Notions à connaître

- **Connecteur HTTP de Tomcat** : chaque élément `<Connector>` de
  `conf/server.xml` ouvre un port d'écoute. Deux connecteurs donnent deux
  ports pour la même application. Sans attribut `address`, Tomcat écoute sur
  toutes les interfaces du conteneur. —
  [Apache Tomcat 9 : The HTTP Connector](https://tomcat.apache.org/tomcat-9.0-doc/config/http.html)
- **Filtre de servlet** : un objet appelé avant la servlet pour les URL de
  son `filter-mapping`. Il peut répondre lui-même et arrêter la chaîne : c'est
  ce que fait le filtre par port. —
  [The Java EE 5 Tutorial : Filtering Requests and Responses](https://docs.oracle.com/javaee/5/tutorial/doc/bnagb.html)
- **`ServletRequest.getLocalPort()`** : le port de la connexion sur lequel la
  requête est arrivée côté serveur. Le filtre le compare à `8081`. —
  [Java EE 5 API : ServletRequest](https://docs.oracle.com/javaee/5/api/javax/servlet/ServletRequest.html)
- **`HttpServlet` et `doGet`/`doPut`/`doPost`** : une servlet sans framework,
  une méthode par verbe HTTP. L'API interne en est une, en Servlet 2.5 comme
  le reste du legacy. —
  [Java EE 5 API : HttpServlet](https://docs.oracle.com/javaee/5/api/javax/servlet/http/HttpServlet.html)
- **`security-constraint` sans `auth-constraint`** : dans `web.xml`, une
  contrainte qui ne nomme aucun rôle n'exige pas d'authentification, et le
  motif d'URL le plus précis l'emporte. `/api/*` échappe donc au `BASIC` posé
  sur `/*`. —
  [The Java EE 5 Tutorial : Defining Security Requirements for Web Applications](https://docs.oracle.com/javaee/5/tutorial/doc/bncbe.html)
- **Jackson `ObjectMapper`** : lit et écrit du JSON en Java. La dépendance
  était déjà dans `pom.xml` pour le jeu de données. —
  [FasterXML/jackson-databind](https://github.com/FasterXML/jackson-databind)
  (dépôt du projet).

  > À vérifier : lien vers la javadoc de `ObjectMapper` en 2.18, introuvable
  > à l'adresse essayée (`fasterxml.github.io/jackson-databind/javadoc/2.18/…`, 404).
- **Un service Compose sur deux réseaux** : un conteneur branché sur deux
  réseaux est joignable par son nom de service sur chacun. Un réseau
  `internal: true` ne permet pas de publier un port vers l'hôte, d'où la
  présence du legacy aussi sur `default`. —
  [Compose : networks](https://docs.docker.com/reference/compose-file/networks/)
- **Statut HTTP 409** : la requête entre en conflit avec l'état de la
  ressource. L'API le rend pour un champ verrouillé et pour une remise
  refusée. —
  [MDN : 409 Conflict](https://developer.mozilla.org/fr/docs/Web/HTTP/Reference/Status/409)

## Ce qui a été construit

- `fixtures/legacy-app/src/main/java/fr/migrabench/legacy/api/InternalApiServlet.java` :
  l'API interne, mappée sur `/api/*`. Elle a quatre endpoints, qui délèguent
  tous à `DossierService` :

  | Endpoint | Réponse |
  |---|---|
  | `GET /api/dossiers?number=&applicant=&status=&filedFrom=&filedTo=` | `200 {"dossiers": [...]}` |
  | `GET /api/dossiers/{numéro}` | `200` ou `404` |
  | `PUT /api/dossiers/{numéro}` | `200`, `409` (verrou), `404` ou `400` (corps mal formé) |
  | `POST /api/dossiers/{numéro}/remise` | `200`, `409` (pas `EN_INSTRUCTION`) ou `404` |

  Un dossier est rendu ainsi : `{"number", "applicant", "subject", "status",
  "filedOn", "submittedOn"}`. Une erreur s'écrit `{"error": "…"}`.
- `.../api/InternalApiPortFilter.java` : le filtre par port. Il rend `403` si
  la requête vers `/api/*` n'arrive pas par le port de son paramètre `port`.
- `web.xml` :
  - le filtre et la servlet sur `/api/*` ;
  - une `security-constraint` sans authentification sur `/api/*`, car l'API
    ignore l'identité de l'appelant.
- `fixtures/legacy-app/Dockerfile` : un `sed` ajoute le connecteur `8081`
  dans le `server.xml` de l'image Tomcat. Un `grep` fait échouer le build si
  l'insertion rate.
- `docker-compose.yml` : `legacy` rejoint `default` et `mb-internal`. Seul
  `8080` est publié.
- `dossiers.json` : trois dossiers réservés, `D-0113` (`BROUILLON`),
  `D-0114` (`EN_INSTRUCTION`) et `D-0115` (`REMIS`), au propriétaire
  `test:internal-api`.
- Tests du seam A :
  - `tests/seam-a/internal-api-client.ts` : envoie la requête depuis le
    conteneur du service d'archivage, qui est sur `mb-internal`, par
    `docker compose exec archive node -e …` ;
  - `tests/seam-a/internal-api-isolation.test.ts` : l'API répond sur `8081`
    depuis `mb-internal`. Elle est refusée (`403`) sur `8080`, depuis
    `mb-internal` et depuis l'hôte, même avec identifiants. `8081` n'est pas
    joignable depuis l'hôte ;
  - `tests/seam-a/internal-api.test.ts` : la sémantique de la recherche, le
    verrou du statut, le `400` d'un corps mal formé, le refus de la remise
    d'un `BROUILLON`, et l'absence de règles de `validation.xml` et de
    contrôle d'identité.
- Documentation :
  - `README.md` : le format JSON et l'état « étape 1 livrée » ;
  - `docs/specs/01-legacy-app.md` : la note « Tranché par #8 » ;
  - ADR 0003 et `GLOSSARY.md` : le propriétaire `test:` d'un dossier réservé ;
  - ADR 0004 : ce que garantit l'isolation et sa limite.

## Les choix faits et pourquoi

- **Une `HttpServlet` et Jackson, sans framework.** Ce sont l'API servlet du
  legacy et une dépendance déjà présente : rien n'est ajouté au `pom.xml`, et
  les versions restent figées.
- **Le connecteur `8081` est inséré par `sed` dans le `server.xml` de
  l'image**, plutôt que de copier un `server.xml` complet. Le reste de la
  configuration de Tomcat 9.0.124 reste celle de l'image, dont le
  `LockOutRealm` que `tests/seam-a/legacy-client.ts` dit « laissé en place ».
- **`403` sur `8080`, pas `404`.** Avec un `404`, le test négatif passerait
  aussi si l'API n'existait pas du tout. Le `403` montre que c'est le filtre
  qui refuse.
- **Pas d'authentification sur `/api/*`.** L'API ignore l'identité de
  l'appelant (ADR 0003). Le premier test rouge montrait un `401` sur `8080`
  depuis `mb-internal` : sans la contrainte dédiée, le `BASIC` de `/*`
  s'appliquait.
- **Dates de recherche en ISO `aaaa-mm-jj`, statut en nom d'énumération.**
  C'est le format attendu par un client JSON. Un statut inconnu ou une date
  mal formée est ignoré, comme dans `SearchAction` : refuser la date
  reviendrait à appliquer la règle `date` de `validation.xml`, que l'API ne
  doit pas appliquer.
- **`400` pour un corps de `PUT` mal formé.** Cela couvre un corps qui n'est
  pas du JSON, ou un champ absent ou qui n'est pas une chaîne. C'est le
  contrat de l'API, pas une règle de saisie : une chaîne vide ou trop longue
  est acceptée.
- **La recherche est comparée à l'écran 1.** Pour chaque jeu de critères, le
  test compare les numéros rendus par l'API à ceux de l'écran 1 en
  `jj/mm/aaaa`. Il les compare aussi à une liste écrite à la main d'après le
  jeu de données : sans elle, deux résultats vides seraient égaux sans rien
  prouver.
- **Requêtes envoyées depuis le conteneur du service d'archivage**
  (`docker compose exec`), plutôt qu'avec un conteneur jetable lancé par
  `docker run` comme dans #7. C'est plus rapide et il n'y a rien à nettoyer.
  La relecture « spec » en a relevé la limite : ce conteneur est aussi sur
  `default`, donc les tests ne prouvent pas que la requête passe par
  `mb-internal`.
- **Écritures sur des dossiers réservés, puis remise des valeurs initiales.**
  Les tests de modification remettent les valeurs initiales dans un
  `finally`, ce qui permet de les relancer sans redémarrer le legacy. Un
  refus (`409`) n'enregistre rien : ces cas utilisent les dossiers partagés
  `D-0001`, `D-0002` et `D-0003`. Renvoyer les valeurs actuelles, en
  revanche, passe par un enregistrement, même sans changement. La relecture
  de la PR #17 l'a relevé sur `D-0001` et `D-0003` : ces cas ont été
  déplacés sur `D-0114` (`EN_INSTRUCTION`) et `D-0115` (`REMIS`, ajouté pour
  cela).
- **La remise réussie n'a pas de test automatique.** Elle ne peut pas être
  annulée, et un test qui remet un dossier échouerait à la relance sans
  redémarrage. Elle a été vérifiée à la main sur `D-0114`, puis le legacy a
  été redémarré (voir « Vérifier soi-même »).
- **`8081` reste joignable depuis le réseau `default` de Docker.** C'est une
  décision humaine prise après la relecture. La menace visée est l'accès
  direct depuis le navigateur, et `8081` n'est pas publié sur l'hôte, ce que
  vérifie un test. L'option écartée est de fixer un sous-réseau et une IP au
  legacy pour lier le connecteur à son adresse sur `mb-internal` : elle fige
  des adresses qui peuvent entrer en conflit avec un réseau local. La limite
  est écrite dans l'ADR 0004.
- **Propriétaire `test:` pour un dossier réservé.** C'est aussi une décision
  humaine prise après la relecture « standards ». Celle-ci notait que l'ADR
  0003 et le glossaire ne prévoyaient que des scénarios et des portes. Les
  tests du banc qui écrivent deviennent le troisième propriétaire possible.
- **Relecture en deux axes**, standards et spec. Corrigé dans `6ade9ce` :
  - le nom `run` du helper de test, un mot réservé du vocabulaire du
    protocole, devient `execFileAsync` ;
  - le test d'identité recopiait à la main la remise des valeurs initiales,
    sans vérifier son statut. Il passe maintenant par `updateThenRestore`,
    qui accepte des en-têtes.

  Laissé tel quel :
  - les petites duplications de `InternalApiServlet` (traduction du `404`,
    « Unknown endpoint ») ;
  - les JSP servies aussi sur `8081`, que la spec n'interdit pas.

## Difficultés rencontrées

- **La comparaison avec l'écran 1 ne trouvait aucun dossier.**
  - Symptôme : une fois la recherche de l'API en place, 10 tests sur 13
    échouaient avec `expected [ 'D-0007' ] to deeply equal []`. Les numéros
    venaient bien de l'API ; c'était la lecture de l'écran 1 qui rendait `[]`.
  - Cause : les liens de l'écran 1 s'écrivent
    `/fiche.do;jsessionid=…?number=D-0007`. Tomcat réécrit l'URL avec
    l'identifiant de session tant que le client n'a pas de cookie, et le
    motif du test attendait `fiche.do?number=`.
  - Résolution : le motif accepte `;jsessionid=…` en option. Les 13 tests
    passent.
- **Un cas de test qui ne prouvait rien.**
  - Symptôme : le cas « numéro qui n'est pas un préfixe » (`D-000`) attendait
    `[]` des deux côtés.
  - Cause : sur l'écran 1, `D-000` est refusé par la règle `mask` de
    `validation.xml`. L'écran n'affiche alors aucun résultat, et l'égalité
    `[] = []` ne mesurait pas la recherche.
  - Résolution : remplacé par un numéro bien formé et inconnu (`D-0099`),
    après le premier passage rouge (tous les tests en `404`, la recherche
    n'existait pas encore) et avant d'écrire la recherche.
  - À la même relecture, la liste attendue de la borne « du 27/10/2025 » a
    été complétée : il manquait `D-0108`, déposé le 29/10/2025.

## Vérifier soi-même

Sorties observées au commit `31e29db`, avec Docker Engine 29.1.3 et Compose
2.40.3-desktop.1, sur la pile reconstruite
(`docker compose up -d --build --force-recreate --wait`).

Seul `8080` est publié, et `8081` n'est pas joignable depuis l'hôte :

```sh
docker port migrabench-legacy-1
# 8080/tcp -> 127.0.0.1:8080

curl -sS -m 5 http://localhost:8081/api/dossiers/D-0001
# curl: (7) Failed to connect to localhost port 8081 after 2 ms: Couldn't connect to server

curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8080/api/dossiers/D-0001
# HTTP 403
```

Depuis `mb-internal`, à partir du conteneur du service d'archivage :

```sh
P='const [u,m,b]=process.argv.slice(1);fetch(u,{method:m,body:b||undefined,headers:{"Content-Type":"application/json"}}).then(async r=>console.log(r.status,await r.text()))'

docker compose exec -T archive node -e "$P" http://legacy:8081/api/dossiers/D-0001 GET
# 200 {"number":"D-0001","applicant":"Élodie Marchand","subject":"Permis de construire d'une véranda","status":"REMIS","filedOn":"2024-05-06","submittedOn":"2024-07-15"}

docker compose exec -T archive node -e "$P" 'http://legacy:8081/api/dossiers?applicant=%C3%A9lodie' GET
# 200 {"dossiers":[{"number":"D-0001", …}]}       ← « Elodie Fontaine » (D-0004) n'y est pas

docker compose exec -T archive node -e "$P" http://legacy:8080/api/dossiers/D-0001 GET
# 403 <!doctype html><html lang="en"><head><title>HTTP Status …

docker compose exec -T archive node -e "$P" http://legacy:8081/api/dossiers/D-0003 PUT '{"applicant":"Autre","subject":"Demande de subvention pour la fête du quartier"}'
# 409 {"error":"Field applicant is locked on dossier D-0003"}

docker compose exec -T archive node -e "$P" http://legacy:8081/api/dossiers/D-0002/remise POST
# 409 {"error":"Dossier D-0002 cannot be submitted from status BROUILLON"}
```

La remise réussie a été observée pendant la session, au-dessus de `b83b2a0`,
sur l'arbre de travail du code commité ensuite dans `6495976`. Elle modifie
`D-0114` jusqu'au redémarrage :

```sh
docker compose exec -T archive node -e "$P" http://legacy:8081/api/dossiers/D-0114/remise POST
# 200 {"number":"D-0114", …,"status":"REMIS","filedOn":"2025-07-21","submittedOn":"2025-11-15"}
docker compose exec -T archive node -e "$P" http://legacy:8081/api/dossiers/D-0114/remise POST
# 409 {"error":"Dossier D-0114 cannot be submitted from status REMIS"}
docker compose exec -T archive node -e "$P" http://legacy:8081/api/dossiers/D-0113 PUT 'pas du json'
# 400 {"error":"Body is not JSON"}
docker compose restart legacy
docker compose exec -T archive node -e "$P" http://legacy:8081/api/dossiers/D-0114 GET
# 200 {"number":"D-0114", …,"status":"EN_INSTRUCTION", …,"submittedOn":null}
```

La date `2025-11-15` est celle de l'horloge figée (`FROZEN_DATE` dans
`.env`).

Les tests du banc, au commit `31e29db` :

```sh
npm run typecheck   # aucune erreur
npm test
# Test Files  8 passed (8)
#      Tests  59 passed (59)
```

## Pour aller plus loin

- **Clôture de l'étape 1** : `/cloture-etape 1`, lancé par l'humain une fois
  les PR fusionnées, contrôle les fiches et propose le tag `etape-1`.
- **ADR 0004** : sa section « Conséquences » écrit ce que garantit
  l'isolation de `8081` (pas d'accès depuis l'hôte) et sa limite connue
  (joignable depuis le réseau `default`).
- **Porte de rôle** (étape 4, ADR 0003) : elle vérifiera par l'API interne
  que le statut de `D-0112` n'a pas changé après le rejeu de « Remettre » avec
  les identifiants de l'agent.
- **Couche serveur du candidat** (étape 3) : elle recevra `LEGACY_API_URL`
  (`http://legacy:8081`) et devra remonter le contrôle de rôle et les règles
  de saisie, que l'API interne n'applique pas.
