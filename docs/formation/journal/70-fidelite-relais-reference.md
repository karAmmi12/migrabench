# #70 · Étape 3 · Fidélité du relais de référence

## Objectif

Le candidat de référence est le legacy derrière un relais sans logique. Il
doit obtenir 100 % à l'oracle (règle 6 de `PROTOCOL.md`), mais ce 100 % ne
vaut celui du legacy que si le relais ne modifie rien. Ce ticket apporte la
preuve : un test du Seam A compare les réponses reçues à travers le relais et
directement du legacy. Il ajoute aussi le candidat défectueux 6, un relais
qui change un libellé de champ, pour montrer que l'oracle voit un relais qui
altère une page.

## Notions à connaître

- **En-têtes hop-by-hop** : certains en-têtes HTTP ne valent que pour une
  connexion (`Connection`, `Keep-Alive`, `Transfer-Encoding`…). Un
  intermédiaire peut donc les changer sans rien modifier de la réponse.
  C'est pourquoi la spec les exclut de la comparaison. —
  [RFC 9110, § 7.6.1 Connection](https://www.rfc-editor.org/rfc/rfc9110#section-7.6.1)
- **`rawHeaders` de Node** : la liste plate des en-têtes reçus, noms et
  valeurs en alternance, avec la casse d'origine et les doublons. `fetch`, à
  l'inverse, fusionne les doublons et décompresse le corps : il ne convient
  pas pour une comparaison octet par octet. —
  [Node.js 22 : message.rawHeaders](https://nodejs.org/docs/latest-v22.x/api/http.html#messagerawheaders)
- **Réécriture d'URL par la session** : à un client qui n'a pas encore
  renvoyé de cookie de session, Tomcat ajoute `;jsessionid=<valeur>` aux
  liens que l'application encode, ce que font les balises Struts
  `html:link` et `html:form`. Les fiches #3, #5 et #8 l'ont déjà rencontré.
  — [Tomcat 9 : SessionIdGenerator](https://tomcat.apache.org/tomcat-9.0-doc/config/sessionidgenerator.html)
  > À vérifier : le format réel de la valeur dans une réponse du legacy.
  Le test suppose 32 caractères hexadécimaux en majuscules, le format par
  défaut de Tomcat 9, et échoue si une vraie réponse en sort.
- **Redirections relatives de Tomcat** : l'attribut `useRelativeRedirects`
  du `Context` décide si un `Location` est absolu ou relatif. —
  [Tomcat 9 : The Context Container](https://tomcat.apache.org/tomcat-9.0-doc/config/context.html)
  > À vérifier : la forme réelle du `Location` renvoyé par
  `/enregistrer.do`. Le test accepte les deux formes.

## Ce qui a été construit

- `fixtures/reference-candidate/relay.js` : le relais, extrait de
  `server.js`, exporte `createRelay({ host, port })`. `server.js` ne fait
  plus que l'appeler vers `legacy:8080` et écouter sur `PORT`. Le
  comportement ne change pas.
- `tests/seam-a/relay-fidelity.ts` :
  - `captureResponse` : envoie une requête sur une connexion neuve et rend
    la réponse brute (statut, `rawHeaders`, corps non décodé) ;
  - `compareResponses` : applique la liste fermée de la spec ;
  - l'option `maskSessionIds` : remplace la seule valeur de
    `;jsessionid=<valeur>` par un jeton fixe, des deux côtés, avant de
    comparer les corps octet par octet ;
  - `sessionIdsOutsideFormat` : liste les valeurs que ce masque laisserait
    telles quelles.
- `tests/relay-fidelity.test.ts` : tests de ces fonctions, sans pile :
  - en-tête ajouté, en-tête retiré, `Content-Length` changé, octet modifié,
    corps tronqué ;
  - hop-by-hop ignorés ;
  - `Date` et `Set-Cookie` comparés sur leur forme ;
  - masque : chemin d'un lien réécrit changé, identifiant retiré, valeur
    hors format.
- `tests/seam-a/reference-relay.test.ts` : le test du Seam A. Le relais
  tourne dans le processus du test, vers le port publié du legacy.
  - **Pages** des trois écrans, pour les deux rôles : comparées une fois
    sans cookie (masque appliqué) et une fois dans une session ouverte
    (comparaison stricte). Chaque page doit répondre `200`.
  - **Refus** : `401` sans identifiants et `404` d'un chemin inconnu.
  - **Redirection** : l'enregistrement de `D-0117` à travers le relais rend
    un `302`. Son `Location`, résolu contre l'adresse du relais, a l'origine
    du relais et est suivi à travers lui.
  - **Test négatif** : le relais du candidat 6 doit être détecté sur
    `/fiche.do`.
- `fixtures/defective-candidates/relay-alters-label/` : le **candidat
  défectueux 6**.
  - C'est une copie du relais de référence. Dans les pages HTML, il remplace
    `>Objet</label>` par `>Sujet</label>` et recalcule `Content-Length`.
  - Les réponses à `HEAD`, les `204` et les `304` sont relayées telles
    quelles, pour que le libellé reste le seul défaut.
- `fixtures/legacy-app/src/main/resources/dossiers.json` : `D-0117`,
  `BROUILLON`, réservé à `test:relay-fidelity`. Le test
  `tests/seam-b/dataset.test.ts` vérifie cette réservation.
- `docs/specs/03-candidate-runner.md` : trois précisions sur le masque de
  l'identifiant de session, la forme du `Location` et l'absence de
  ressource statique.

## Les choix faits et pourquoi

- **Masque étroit de `;jsessionid=<valeur>` et deux comparaisons par page.**
  C'est la décision de l'humain, prise après que la session a relevé le
  problème (voir « Difficultés »).
  - Seule la valeur au format exact est remplacée. Le nombre et la position
    des occurrences, et tout le reste du lien, restent comparés.
  - Dans une session ouverte, la comparaison est stricte, sans masque.
  - La spec précise que cette exception ne vaut que pour la vérification de
    fidélité du relais de référence, jamais pour la mesure d'un candidat.
  - Options écartées : la session ouverte seule (le `Set-Cookie` de
    l'ouverture n'aurait été comparé que sur ses en-têtes), ou le masque
    seul.
- **Le relais séparé dans `relay.js`**, plutôt qu'une variable
  d'environnement pour l'hôte du legacy. Le test lance ainsi le même code
  que le candidat, et le relais reste sans logique. Le test importe le
  module par une adresse calculée, car `relay.js` est du JavaScript sans
  types que `tsc` ne sait pas typer.
- **Un dossier réservé, `D-0117`, pour la redirection.** La seule vraie
  redirection du legacy suit un enregistrement : `/enregistrer.do` ou
  `/remettre.do`.
  - Réenregistrer les valeurs actuelles d'un dossier partagé est interdit
    par le plan (`docs/PLAN.md`, « Dossiers partagés et réservés »).
  - Les dossiers de `test:internal-api` sont modifiés en parallèle par
    leurs propres tests.
  - Le test lit les valeurs de `D-0117` dans le jeu de données, sans les
    recopier.
- **Le `Location` résolu comme par un navigateur.** Le `server.xml` du
  legacy est celui de Tomcat par défaut, et Tomcat 9 rend par défaut des
  redirections relatives. Le test n'en suppose donc pas la forme : il exige
  l'origine du relais après résolution, puis suit la redirection.
  Le Seam A est vert en CI, mais son log ne montre pas la forme du
  `Location`.
  > À vérifier : la forme réelle du `Location` (absolue ou relative).
- **`captureResponse` avec `node:http`** plutôt que `fetch`, pour garder les
  en-têtes bruts et le corps non décodé (voir « Notions »).

## Difficultés rencontrées

- **Les corps ne pouvaient pas être identiques octet par octet.**
  - Symptôme : en préparant le test, la session a constaté que la spec
    demandait des corps identiques alors que le legacy réécrit ses liens.
    `tests/seam-a/internal-api.test.ts:39` et les fiches #3, #5 et #8
    relèvent `;jsessionid=…` dans les liens d'une page servie sans cookie.
  - Cause : la réponse directe et la réponse relayée ouvrent chacune leur
    session, donc portent chacune leur identifiant, même à travers un
    relais parfait.
  - Résolution : question posée à l'humain, qui a choisi le masque étroit
    et un test négatif sur le chemin d'un lien réécrit (voir « Choix »).
- **Aucune valeur réelle de `jsessionid` dans le dépôt.**
  - Symptôme : `grep` ne trouve que `;jsessionid=…`, abrégé, dans les
    fiches, et les valeurs inventées des tests.
  - Cause : la pile était utilisée par une autre session, et cette session
    n'avait pas le droit de lancer Docker.
  - Résolution : format déduit de la configuration (Tomcat 9.0.124,
    `server.xml` par défaut, sans `jvmRoute`). Le Seam A exige que chaque
    occurrence d'une vraie réponse ait ce format.
  > À vérifier : une valeur réelle, relevée par `curl` sur `/recherche.do`.
- **Attendu faux dans un test du masque.** Le test « chemin d'un lien
  réécrit changé » attendait `155 bytes direct, 156 relayed`, alors que la
  fonction rendait `116` et `117`. L'attendu avait été compté sur les corps
  non masqués. Les longueurs rapportées sont celles des corps masqués :
  116 octets, recomptés à la main, dont 21 pour `;jsessionid=<session>`.
  L'attendu a été corrigé.
- **`tsc` et `noUncheckedIndexedAccess`.** `rawHeaders[index]` est typé
  `string | undefined`, et le typecheck a refusé le premier
  `headersByName` (TS2532, TS2322). Résolution : une valeur par défaut
  `?? ""`.
- **La revue a relevé six points**, tous corrigés dans `6253696` :
  - `/favicon.ico` ne testait aucune ressource, car le legacy n'en sert
    aucune : c'est un 404 de Tomcat ;
  - les pages n'exigeaient pas de statut `200` ;
  - le relais du candidat 6 envoyait `Content-Length: 0` à une requête
    `HEAD` ;
  - la recherche du `Location` lisait aussi les valeurs d'en-tête ;
  - la réservation de `D-0117` n'était vérifiée par aucun test ;
  - `afterAll` plantait si `beforeAll` avait échoué.
- **La CI ne tourne que sur une PR.** Pousser la branche ne lance aucun
  workflow (`on: pull_request` dans `.github/workflows/tests.yml`). Le test
  du Seam A n'est donc vérifié qu'à l'ouverture de la PR.

## Vérifier soi-même

Sans pile :

```sh
npx vitest run tests/relay-fidelity.test.ts tests/seam-b/dataset.test.ts
```

Observé sur `6253696` : `Tests  27 passed (27)`.

```sh
npm run typecheck
```

Observé sur `6253696` : aucune erreur.

Avec la pile (`docker compose up -d --build --wait`, verrou du banc libre) :

```sh
npx vitest run tests/seam-a/reference-relay.test.ts
```

Observé en CI, dans le job « Tests » de
https://github.com/karAmmi12/migrabench/actions/runs/45404468177 (tête de la
PR `ae0f74f`, du 24/11/2026 13:32:23Z au 13:35:33Z, soit 3 min 10 s) :
`tests/seam-a/reference-relay.test.ts (20 tests)` vert, et pour toute la
suite `Test Files 62 passed (62)`, `Tests 534 passed (534)`.

Ces tests ne passent que si les hypothèses de la session tiennent sur la
vraie pile :
- chaque page sert des liens avec `;jsessionid=`, et chaque valeur a le
  format exact supposé ;
- `/recherche.do` pose un cookie de session ;
- le `Location` de `/enregistrer.do` se résout vers l'origine du relais.

Le log ne montre ni la valeur ni la forme du `Location` : seulement que les
assertions passent.

Avec `D-0117` ajouté au jeu de données, l'oracle reste à 38 scénarios
réussis sur 38, et « Proof holds on 5 results », dans
https://github.com/karAmmi12/migrabench/actions/runs/45404468385, sur la
même tête.

```sh
curl -s -u <utilisateur>:<mot de passe> http://localhost:8080/recherche.do -D - | grep -io 'set-cookie: [^;]*\|;jsessionid=[^?"]*'
```

> À vérifier : que `/recherche.do` pose un cookie de session
(`Set-Cookie: JSESSIONID=…`), et le format réel de la valeur de
`;jsessionid=` dans les liens. Utilisateur et mot de passe : voir
`fixtures/users.json`.

```sh
npm run migrabench -- measure --candidate fixtures/defective-candidates/relay-alters-label
```

> À vérifier : mesure du candidat 6. Attendu par la spec : `completed`,
code `0`, au moins un scénario échoué dans `oracle.json`. Pas encore
lancée : la pile était utilisée par une autre session.

## Pour aller plus loin

- #74 : le job de CI des mesures, qui mesurera les sept candidats
  défectueux, dont le 6, sur une vraie pile.
- #67 : le marqueur du Seam A. Les requêtes de ce test vers le legacy le
  porteront, pour ne pas faire échouer la porte du relais d'une mesure
  lancée en même temps.
- Étape 4 : la porte du relais, dont le candidat de référence est le test
  négatif (son journal d'accès contient des requêtes hors marqueur).
- #92, « Verrou du banc : un verrou pris dans un worktree n'est pas vu
  depuis un autre » (ouverte) : tant qu'elle n'est pas fusionnée, deux
  sessions sur deux worktrees peuvent lancer la pile en même temps. C'est ce
  qui a empêché de vérifier ce ticket en local.
