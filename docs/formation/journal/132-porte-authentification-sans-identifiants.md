# #132 · Étape 4 · Porte d'authentification par rejeu sans identifiants

## Objectif

Une migration peut laisser un écran ou une requête accessible sans
identifiants, même quand le legacy les exige partout (BASIC, ADR 0003). Ce
ticket ajoute la porte `auth-check`, qui vérifie deux choses en rejouant des
requêtes sans identifiants. D'abord, aucune requête rejouée ne renvoie un
numéro de dossier (`auth-read`). Ensuite, aucune ne modifie un dossier
(`auth-write`). Un rejeu de contrôle, avec identifiants, montre que ces
requêtes savent lire et écrire : sans lui, un refus ne prouverait rien.

## Notions à connaître

- **Authentification BASIC et défi `401`** : sans identifiants, le serveur
  répond `401` avec `WWW-Authenticate`, et le navigateur renvoie la requête
  avec `Authorization`. La sonde montre que `allHeaders()` de Playwright ne
  donne pas `authorization` pour la requête qui a reçu le défi. —
  [RFC 7617](https://www.rfc-editor.org/rfc/rfc7617)
- **Identifiants d'une session Playwright (`httpCredentials`)** : le contexte
  répond seul au défi `401`. —
  [Playwright, Browser.newContext](https://playwright.dev/docs/api/class-browser)
- **Jeton anti-CSRF (synchronizer token)** : un secret par session, posé dans
  la page et renvoyé avec chaque écriture. Il protège d'un autre site, pas
  d'une écriture anonyme : un attaquant sans identifiants peut ouvrir sa
  propre session et lire son jeton. —
  [OWASP, CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- **Principal gardé dans la session par Tomcat** : après une authentification
  réussie, Tomcat peut garder l'utilisateur dans la session HTTP (attribut
  `cache` des valves d'authentification). Une requête qui porte ensuite le
  cookie de cette session est authentifiée sans `Authorization`. C'est ce qui
  fait fuir la lecture du candidat à jeton (voir « Difficultés »). —
  [Tomcat 9, Valves, Basic Authenticator](https://tomcat.apache.org/tomcat-9.0-doc/config/valve.html)
- **Format HAR** : le journal des requêtes et réponses d'une page, que
  l'oracle enregistre par scénario. La porte en relit les `GET` et `HEAD`. —
  [W3C, HTTP Archive (HAR) format](https://w3c.github.io/web-performance/specs/HAR/Overview.html)

Ces cinq liens ont été ouverts le 2026-11-27 (`curl -sL`). Tous ont répondu
`200`, et chaque page contient le passage cherché : `WWW-Authenticate`,
« Synchronizer Token Pattern », « cache authenticated Principals »,
`httpCredentials`, `postData`.

## Ce qui a été construit

- **`fixtures/legacy-app/src/main/resources/dossiers.json`** : `D-0119`
  (`BROUILLON`) et `D-0120` (`EN_INSTRUCTION`), réservés à `gate:auth`. Le
  test du jeu de données (`tests/seam-b/dataset.test.ts`) le vérifie.
- **`gates/auth.ts`**, la porte `auth-check`, dans le groupe des portes qui
  écrivent, entre le rôle et le relais :
  - **Les unités** : chaque HAR de l'oracle (ses `GET` et `HEAD` vers le
    candidat ; les autres méthodes sont comptées dans `skipped`), puis le
    parcours de la porte. Dans ce parcours, l'agent enregistre un nouvel
    objet sur `D-0119`. L'instructeur fait de même sur `D-0120`, puis le
    remet.
  - **L'ordre** : enregistrement, redémarrage du legacy, contrôle avec
    identifiants, redémarrage, rejeu anonyme. L'état des deux dossiers est lu
    par l'API interne avant et après chaque rejeu.
  - **`replayUnit`** : une unité rejouée ouvre elle-même sa session, avec un
    jar vide, à partir de `BASE_URL`.
  - **Bruts** : `gates/auth-check/recording.json`, `control.json`,
    `anonymous.json`.
- **`gates/transplant.ts`** (renommé depuis `role-transplant.ts`, commun aux
  deux portes) :
  - `authorization: null` retire l'en-tête ;
  - la règle différentielle : `sessionBoundValues` dit quelles valeurs sont
    liées à la session, et l'option `sessionBound` l'applique.
- **`gates/replay.ts`** : les outils de rejeu sortis de la porte de rôle
  (identités, sessions du navigateur, réponses reçues, envoi d'une requête,
  cookies posés).
- **Candidats défectueux** : des relais du legacy, chacun avec sa copie de
  `relay.js`, à laquelle deux crochets ont été ajoutés (`forward`, `respond`) :
  - `auth-read-and-write-unchecked` pose les identifiants de l'instructeur sur
    toute requête qui n'en a pas ;
  - `auth-csrf-write-unchecked` laisse les lectures au legacy. Il exige, pour
    écrire, un jeton lié à son propre cookie, posé dès la première page (la
    page `401` comprise), puis écrit avec les identifiants de l'instructeur.
- **`scripts/measure-cases.ts`** et **`.github/workflows/measures.yml`** :
  - les issues de la porte pour chaque cas ;
  - six témoins `start-N`, au lieu de quatre ;
  - un groupe `auth`, avec les deux candidats ;
  - une seule fabrique de cas, `legacyRelayCase`, pour les relais du legacy.
- **Fixtures** :
  - `tests/fixtures/probe132-ca289e1/`, la sonde sur le legacy ;
  - `tests/fixtures/measure-d905931-har/`, deux vrais HAR de l'oracle.
- **`tests/gates/auth.test.ts`** : la lecture des HAR, la transplantation
  vers la session anonyme, la règle différentielle, `replayUnit` face à un
  faux candidat à jeton, la recherche des numéros et le jugement.
- **Documentation** :
  - `docs/specs/04-gates.md` : la phrase sur les cookies, corrigée, et les
    « Précisions de #132 » ;
  - `PROTOCOL.md` : deux limites.
- **Issue #166** : alignement de la porte de rôle sur la règle
  différentielle (demandée par Karim).

## Les choix faits et pourquoi

- **Cookies du rejeu anonyme** (décision de Karim du 27/11, posée en
  question). Le rejeu n'envoie jamais les cookies ni l'`Authorization` de la
  session authentifiée : il transplante les cookies de la session anonyme,
  et les retire s'ils n'y existent pas. L'option écartée était de n'envoyer
  aucun cookie. Raison : un attaquant sans identifiants a ses propres
  cookies, et un candidat à jeton lié au cookie aurait sinon passé
  `auth-write` sans exiger d'authentification pour écrire.
- **Règle différentielle** (décision de Karim du 27/11, posée en question).
  Une valeur est liée à la session seulement si une nouvelle session
  authentifiée en reçoit une autre au même endroit. L'option écartée était
  une forme de jeton (16 caractères au moins), jugée arbitraire. Raison :
  l'ancienne règle retirait les valeurs métier (voir « Difficultés »). Le
  contrôle tourne donc en premier, et c'est lui qui relève ces valeurs.
- **Règle écrite une seule fois** (demande de Karim). Elle vit dans
  `gates/transplant.ts`, et l'issue #166 alignera la porte de rôle dessus.
  Le contrôle, lui, garde l'ancienne règle : c'est elle qui lui permet de
  relever ce qui change.
- **Une unité ouvre elle-même sa session.** L'option écartée était une
  session cible ouverte d'abord dans le navigateur, comme pour le rôle.
  Raison : chaque scénario et le parcours partent d'un contexte neuf, à
  `BASE_URL`. La session ouverte à part faisait doublon et cassait le lien
  entre jeton et cookie (voir « Difficultés »).
- **Contrôle par utilisateur.** L'agent rejoue les unités des HAR, qui ne
  font que lire. Chaque unité du parcours est rejouée par l'utilisateur qui
  l'a enregistrée. L'option écartée était de mêler, dans une même unité, des
  lectures en agent et des écritures en instructeur. Raison : le jeton lu en
  agent ne vaudrait pas pour l'écriture de l'instructeur.
- **Numéro cherché dans le corps et les en-têtes, quel que soit le statut**,
  comme le dit la spec (« aucune réponse rejouée ne contient »). Raison : la
  lecture littérale de la spec. Le prix est une limite, écrite dans
  `PROTOCOL.md` : une réponse qui recopie l'URL fait échouer la porte.
- **Sans requête à rejouer, aucun redémarrage** : les deux résultats sont
  alors `not-evaluable`.
- **Nom `auth-check`** : jamais `auth` seul, vocabulaire Java EE que garde la
  copie expurgée (décision de Karim du 26/11 sur #125).

## Difficultés rencontrées

- **Sonde arrêtée au redémarrage.** `Error: legacy not back`. Cause : le
  legacy rend `401` à `BASE_URL` sans identifiants, et `curl -f` échoue sur
  ce statut. Résolution : attendre le code `401`. C'était le premier fait
  utile de la sonde.
- **Vitest refusé hors de `npm test`.** `npx vitest run` a rendu « No test
  files found » : le verrou du banc doit être tenu (#163). Résolution :
  `npm test -- <fichier>`.
- **Valeurs métier retirées du rejeu anonyme.** Le test de la transplantation
  était rouge : `Received:
  "http://127.0.0.1:8100/rechercher.do?number=&applicant=&filedFrom=&filedTo="`,
  sans `status=REMIS`. Cause : « REMIS » figure dans la page de `BASE_URL`
  reçue par la session source, alors que la session anonyme n'a reçu qu'une
  page `401`. Résolution : la règle différentielle, tranchée par Karim.
- **Contrôle sans effet sur le candidat à jeton.** La première mesure
  (`20261127T162324Z-316e805-defective-candidates-auth-csrf-write-unchecked`)
  rendait `auth-write` `not-evaluable` : les `POST` du contrôle recevaient
  `403`. Cause : le premier `GET /` rejoué, sans cookie, recevait un nouveau
  `csrf-session`, mais le jeton était lu dans la page ouverte avant par le
  navigateur, liée à l'ancien cookie. Résolution : `replayUnit`, dont le test
  rouge (`TypeError: replayUnit is not a function`) reproduit le cas avec un
  faux candidat (commit `c4819b4`).
- **Attente fausse sur le candidat à jeton.** J'attendais `auth-read`
  réussi. La mesure
  `20261127T163152Z-4a22809-defective-candidates-auth-csrf-write-unchecked`
  a rendu `failed`, pour deux raisons :
  - les écritures anonymes répondent `302` avec `Location:
    /fiche.do?number=…` ;
  - l'écriture, partie avec les identifiants de l'instructeur, ouvre une
    session Tomcat authentifiée, et le `GET /remise.do?number=D-0120` qui
    suit, sans identifiants, rend `200`.

  La spec n'attend que l'échec à `auth-write`. Résolution : l'attente suit la
  mesure (commit `dc3f627`), avec le constat cité.
- **Verrou du banc tenu par une autre session.** Un `npm test` lancé ailleurs
  tenait le verrou. Les tests et les mesures ont attendu sa fin.
- **Mesure refusée en `stack-not-from-this-copy`** après un commit. Cause :
  l'empreinte du contexte de la pile couvre le dépôt. Résolution :
  `npm run stack:up` après chaque commit, avant de mesurer.
- **Revues.** Deux revues (normes, spec) ont relevé :
  - un en-tête de candidat qui annonçait encore `auth-read` réussi ;
  - des identifiants de mesure tronqués ;
  - deux fabriques de cas identiques ;
  - un cast que le type `Har` évitait ;
  - le contrôle, qui garde l'ancienne règle sans que la spec le dise.

  Tout est corrigé dans le commit `158cbb2`.

## Vérifier soi-même

```sh
node .probes/132/probe.ts
```

La sonde n'est pas versionnée. Son code est copié dans
`tests/fixtures/probe132-ca289e1/probe.ts.txt`. Elle a été lancée sur un arbre
propre au commit `ca289e1`, après `npm run stack:up`. Sortie observée,
abrégée (`PROVENANCE.md`) :

- `"start GET 401 http://127.0.0.1:8080/ 683"`, `cookies: []` ;
- les 13 requêtes rejouées sans identifiants : `401`, `nb=` et `nh=` vides ;
- états de `D-0117` et `D-0112` inchangés après les deux rejeux.

Rouge d'abord, observé pendant la session :

- `tests/seam-b/dataset.test.ts` avant `D-0119` et `D-0120` : `Tests  1 failed | 10 passed (11)` ;
- `tests/gates/auth.test.ts` avant le module : `Cannot find module '../../gates/auth.ts'` ;
- la transplantation, avant la règle différentielle : `1 failed | 17 passed (18)` ;
- l'ordre du registre, avant l'inscription : `× runs the witness value first, then accessibility, XSS and Lighthouse, then the role, then the authentication` ;
- `replayUnit` : `TypeError: replayUnit is not a function`.

```sh
npm run stack:up && npm test
```

Observé sur le commit `158cbb2`, arbre propre : `Test Files  105 passed (105)`,
`Tests  1205 passed (1205)`.

```sh
npm run stack:up && node scripts/run-measure-case.ts auth-read-and-write-unchecked
```

Mesures de diagnostic locales, chacune après `npm run stack:up`, sur un arbre
propre. Chacune est « the expected measure (completed, ok, exit code 0) ».

| Mesure | Oracle (réussis/échoués/non atteints) | `auth-read`, `auth-write` | Phase `gates` |
|---|---|---|---|
| `20261127T162823Z-4a22809-reference-candidate` | 38/0/0 | passed, passed | 86 813 ms |
| `20261127T163006Z-4a22809-defective-candidates-auth-read-and-write-unchecked` | 35/3/0 | failed, failed | 87 653 ms |
| `20261127T163431Z-dc3f627-defective-candidates-auth-csrf-write-unchecked` | 38/0/0 | failed, failed | 86 924 ms |

- Sur le legacy, le contrôle change les deux dossiers, et `auth-read` rejoue
  154 requêtes (`skipped: 9`).
- Les trois scénarios échoués du premier candidat sont `auth-no-credentials`,
  `auth-unknown-user` et `remise-agent-reserved`.
- Les témoins vont de `start-1` à `start-6`, puis `end`.

Couverture par les tests existants :

- le filtre de la copie expurgée (1a) écarte `D-0119` et `D-0120` : c'est le
  test `keeps no reserved dossier` de
  `tests/legacy-copy/legacy-copy-real.test.ts`, qui écarte tout dossier de
  `reservations` ;
- la partition des dossiers est vérifiée par `assigns each reserved dossier
  to exactly one scenario or gate`, dans `tests/seam-b/dataset.test.ts`.

**En CI, sur la vraie pile :**

> À vérifier après l'exécution de la CI de la PR : le job des mesures (groupes `reference`, `role`, `auth`), chaque cas conforme à l'attendu, avec le lien et le commit.

> À vérifier après l'exécution de la CI de la PR : la durée ajoutée par la porte à la mesure du candidat de référence en CI (étape « Candidat de référence », comparée à la dernière exécution des mesures sur `main`), à signaler à Karim au-delà de 5 minutes.

> À vérifier après l'exécution de la CI de la PR : l'oracle avec `D-0119` et `D-0120`, 38 réussis à l'exécution complète et à chacune des cinq exécutions de la preuve.

> À vérifier après l'exécution de la CI de la PR : `tests` et `typecheck` verts, avec leurs liens.

## Pour aller plus loin

- **#166, porte de rôle** : l'aligner sur la règle différentielle, écrite une
  seule fois dans `gates/transplant.ts`.
- **#100, étalonnage** : le délai de la porte (10 min), celui du groupe `auth`
  en CI (30 min) et celui d'une requête rejouée sont des valeurs de
  conception.
- **Limites connues** (`PROTOCOL.md`) :
  - une réponse qui recopie l'URL demandée (une redirection, par exemple)
    fait échouer `auth-read` à tort ;
  - une valeur liée à l'utilisateur, mais identique d'une session à l'autre,
    est rejouée telle quelle sans identifiants.
- **Limite connue** : un cookie effacé par un `Expires` passé, et non par
  `Max-Age`, reste dans le jar du rejeu (`applySetCookies`, relevé par la
  revue).
