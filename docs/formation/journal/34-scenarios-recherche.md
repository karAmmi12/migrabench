# #34 · Étape 2 · Scénarios @recherche

## Objectif

Le fil traceur (#32) n'avait posé que deux scénarios de recherche : R2
(formulaire vide) et R17 (sans identifiants). Ce ticket ajoute les 16 autres
du tableau « Recherche » de `docs/specs/02-oracle.md` : le focus initial, les
critères de recherche et leurs combinaisons, les règles de `validation.xml`,
et l'utilisateur inconnu. Avec eux, l'oracle compte ses 38 scénarios, ce qui
débloque la preuve du critère de fin de l'étape 2 (#39).

## Notions à connaître

- **Règles de `validation.xml` de la recherche** (`mask`, `date` avec
  `datePatternStrict`, `validwhen`) : elles sont présentées par la fiche de #4
  ([`4-validation-focus-recherche.md`](4-validation-focus-recherche.md)).
  R12 à R16 en vérifient le refus, le message et la saisie gardée.
- **`expect.poll`** : rappelle une fonction jusqu'à ce que l'assertion passe
  ou que le délai expire. Les scénarios de recherche lisent ainsi les numéros
  affichés, qui n'existent qu'une fois la réponse arrivée. Il passe dès le
  premier relevé conforme : il ne vérifie pas que la liste reste stable, d'où
  la relecture de `expectStableList`. —
  [Playwright : Assertions, expect.poll](https://playwright.dev/docs/test-assertions)
- **`selectOption({ label })`** : choisit une option d'une liste par son texte
  affiché, pas par sa valeur technique. Le statut « Remis » est choisi par ce
  qu'en voit l'agent, pas par `REMIS`. —
  [Playwright : Locator](https://playwright.dev/docs/api/class-locator)
- **`401 Unauthorized`** : la réponse HTTP d'une ressource protégée quand les
  identifiants manquent ou sont faux. R17 et R18 l'attendent de l'origine de
  `BASE_URL`. —
  [MDN : 401 Unauthorized](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/401)
- **`LockOutRealm` de Tomcat** : verrouille un nom d'utilisateur après
  plusieurs échecs d'authentification. R18 utilise donc le nom inconnu commun
  (`UNKNOWN_USER`, absent de `fixtures/users.json`), jamais l'agent ni
  l'instructeur. —
  [Tomcat 9 : Realm, LockOut Realm](https://tomcat.apache.org/tomcat-9.0-doc/config/realm.html)

## Ce qui a été construit

- **`oracle/scenarios/search.spec.ts`** : les 18 scénarios de recherche, sur
  quatre formes.
  - `searchScenario` (R2 à R10) : critères saisis, « Rechercher », puis la
    suite des numéros partagés affichés comparée à la liste attendue par
    égalité exacte. R2 y est ramené.
  - `search-no-result` (R11) : `D-0999`, le message « Aucun dossier ne
    correspond à vos critères. », et aucun numéro affiché.
  - `refusedInputScenario` (R12 à R16) : le message exact, aucun numéro
    partagé affiché, et chaque valeur saisie gardée.
  - `refusedAccessScenario` (R17, R18) : chargement de `BASE_URL`, au moins
    une réponse `401` de son origine, et le champ « Numéro » absent. R17 y est
    ramené.
  - `search-initial-focus` (R1, `@clavier`) : le focus sur « Numéro ».
- **`oracle/messages.ts`** : `SEARCH_MESSAGES`, les quatre messages de la
  recherche, à côté de `SHEET_MESSAGES` (#36).
- **`tests/oracle/messages.test.ts`** : compare aussi `SEARCH_MESSAGES` au
  texte exact de `ApplicationResources.properties`.
- **`oracle/support.ts`** : réexporte `SEARCH_MESSAGES`, et ajoute
  `expectStableList` : `expect.poll` jusqu'à la liste attendue, puis une
  attente de l'intervalle de `REREAD` (500 ms) et une seconde lecture, qui
  doit rendre la même liste. Les listes de R2 à R16 passent par elle.
- **`docs/specs/02-oracle.md`** : la règle de stabilité dans « Numéros
  affichés » et « Refus d'une saisie de recherche », et sa limite connue.
- **`results/oracle/20261122T144456Z-f89e6d0.json`** : l'exécution complète
  versionnée, depuis un arbre propre, avec 38 scénarios. Elle remplace celle
  de `9e264ca`, antérieure à la vérification de stabilité.

## Les choix faits et pourquoi

- **Faire #34 avant #39.** #39 exige 38 scénarios réussis, et l'oracle n'en
  comptait que 22 : #34, encore ouvert, le bloquait. L'humain a choisi de
  faire #34 d'abord, sur sa propre branche et sa propre PR.
- **Les clés des critères sont les libellés exacts des champs**
  (`Numéro`, `"Déposé du"`…), pas des identifiants anglais. Le contrat de
  l'oracle désigne les champs par leur libellé (ADR 0006). La revue Standards
  l'a relevé comme une entorse possible à « identifiants en anglais » ; c'est
  une donnée, pas un nom de code, et le commentaire le dit.
- **Les scénarios de refus n'acceptent que des champs de texte**
  (`TextCriteria`). La revue Standards a vu que la vérification de la saisie
  gardée comparerait mal un statut : la valeur d'une option n'est pas son
  libellé. Le type écarte ce cas, plutôt qu'une branche que rien n'utilise.
- **Le message est attendu avant de lire l'absence de numéros** (R11 à R16).
  Avant la réponse, la page n'affiche aucun numéro : lire l'absence trop tôt
  passerait sans rien vérifier.
- **R11 lit tous les numéros affichés**, pas seulement les partagés : la spec
  dit « aucun numéro affiché », et `D-0999` ne peut désigner aucun dossier,
  réservé ou non. Le commentaire d'en-tête nomme cette exception (relevé par
  la revue Spec).
- **Une liste correcte est relue une fois, après l'intervalle de `REREAD`.**
  La revue Spec a noté qu'`expect.poll` passe au premier relevé conforme ; la
  première version l'avait laissé en limite connue. L'humain a demandé de la
  fermer dans cette PR : attendre l'intervalle de `REREAD`, puis vérifier que
  la liste n'a pas changé. Un sondage « jusqu'à stabilité » n'a pas été
  retenu : la constante existante borne déjà l'attente, et l'oracle n'en
  introduit pas une seconde.
- **La relecture s'applique aussi aux listes vides de R11 à R16.** Après le
  message, un candidat pourrait afficher des numéros : c'est le même trou que
  pour une liste non vide, fermé par la même fonction.
- **Le message de R11 reste dans le scénario**, pas dans `SEARCH_MESSAGES` :
  il vient de `recherche.jsp`, pas de `ApplicationResources.properties`.

## Difficultés rencontrées

- **La mutation de la saisie gardée ne voyait échouer qu'une valeur de R16.**
  - Symptôme : avec chaque valeur attendue faussée, R16 échouait sur
    « Déposé du » (`Expected: "02/01/2025x"`), et « Déposé au » n'était jamais
    comparé.
  - Cause : la boucle de `refusedInputScenario` s'arrête au premier échec.
  - Résolution : une seconde mutation ne fausse que « Déposé au » :
    `Expected: "01/01/2025x"`, `Received: "01/01/2025"`.

## Vérifier soi-même

Sorties observées au commit `f89e6d0` (puis `ac5058b`, qui remplace seulement
le résultat), Node v22.23.5, Docker Compose 2.40.3-desktop.1, Playwright 1.65.1,
Chromium 159.0.8154.6.

```sh
nvm use
npx vitest run tests/oracle/messages.test.ts
#       Tests  8 passed (8)

npm run typecheck
# > tsc --noEmit        (aucune erreur)

npm run oracle
# Result: results/oracle/20261122T144456Z-f89e6d0.json
# Scenarios: 38, passed: 38, failed: 0, unreached: 0
```

Le résultat versionné porte `benchCommit` `f89e6d0…`, `worktree: clean`,
`saltImposed: false`, et `keyboard` : 5 réussis sur 5.

```sh
npm run stack:up   # npm run oracle a recréé la pile avec un autre sel (#46)
npm test
#  Test Files  27 passed (27)
#       Tests  170 passed (170)
```

Avant `SEARCH_MESSAGES`, le test des messages était rouge : `TypeError: Cannot
read properties of undefined (reading 'numberMask')`, 4 échecs.

**Chaque vérification vue échouer une fois.** Une valeur attendue faussée à
la fois, puis `npx playwright test -c playwright.config.ts
scenarios/search.spec.ts -g <scénario>` depuis `oracle/`, sur la pile de
développement. État : arbre de travail sur `main` (`ce2dc64`), avec le code
du futur commit `2ba7a0d` non commité. Les messages ci-dessous viennent de ce
passage. Après la revue, toutes les mutations ont été relancées sur le futur
`9e264ca` non commité, avec le même verdict pour chaque ligne, et R2, ramené à
`searchScenario`, faussé à 29 numéros (`+   "D-0030"`, `1 failed`). Sans
modification, les 18 scénarios passent.

| Vérification faussée | Échec observé |
|---|---|
| R1 focus (sur « Demandeur ») | `Expected: focused`, `Received: inactive` |
| R3 liste (`D-0008`) | `- Expected - 1`, `+ Received + 1` |
| R4 liste (`D-0017` en plus) | `- Expected - 1`, `+ Received + 0` |
| R5 liste (`D-0001` en plus) | `- Expected - 1`, `+ Received + 0` |
| R6 ordre (`D-0004` avant `D-0001`) | `- Expected - 1`, `+ Received + 1` |
| R7 borne incluse (`D-0019` retiré) | `- Expected - 0`, `+ Received + 1` |
| R8 liste (`D-0029` en plus) | `- Expected - 1`, `+ Received + 0` |
| R9 liste (vide) | `- Expected - 1`, `+ Received + 3` |
| R10 liste (`D-0026` en plus) | `- Expected - 1`, `+ Received + 0` |
| R11 message (sans le point final) | `toBeVisible()` : `element(s) not found` |
| R11 aucun numéro (`D-0999` attendu) | `- Expected - 3`, `+ Received + 1` |
| R12 à R16 message (celui d'un autre champ) | `toBeVisible()` : `element(s) not found`, sur chacun des cinq |
| R12 à R16 aucun numéro partagé (`D-0001` attendu) | `- Expected - 3`, `+ Received + 1`, `5 failed` |
| R12 à R16 saisie gardée (`+ "x"`) | `5 failed`, dont `Expected: "D-0001x"`, `Received: "D-0001 "` |
| R16 « Déposé au » gardé (`+ "x"`) | `Expected: "01/01/2025x"`, `Received: "01/01/2025"` |
| R17 et R18 `401` (`403` attendu) | `Expected value: 403`, `Received array: [401]`, `2 failed` |
| R17 et R18 recherche absente (`toHaveCount(1)`) | `Expected: 1`, `Received: 0`, `2 failed` |

**La stabilité vue échouer sur un candidat factice.** Un proxy `node:http`
devant le legacy (port 8092 vers 8080) ajoute aux pages qui contiennent
« Rechercher » un script qui, 200 ms après le chargement, retire la ligne du
premier numéro affiché, ou, sans numéro et avec un champ rempli, ajoute un
lien `D-0001`. Depuis `oracle/` :

```sh
BASE_URL=http://127.0.0.1:8092 npx playwright test -c playwright.config.ts scenarios/search.spec.ts
```

| État | Résultat observé |
|---|---|
| Arbre à `7c49e28`, sans la relecture | `18 passed` |
| Futur `f89e6d0` non commité | `15 failed`, `3 passed` : R2 à R16 échouent sur `Error: list changed within 500 ms of being correct` ; R1, R17 et R18, sans liste, passent |
| Le même, sur le legacy (`BASE_URL=http://localhost:8080`) | `18 passed` |

Sur R4, par exemple : `Expected` `["D-0016"]`, `Received` `[]`. Sur R11 à
R16, relancés seuls à `ac5058b` (`6 failed`) : `Expected` `[]`, `Received`
`["D-0001"]`.

## Pour aller plus loin

- **#39** : le critère de fin de l'étape 2, cinq exécutions vertes de
  l'oracle en CI, maintenant possible avec 38 scénarios.
- **#46** : après `npm run oracle`, les tests de la référence d'archivage
  échouent jusqu'à `npm run stack:up`.
- **ADR 0006** : le contrat de l'oracle envers le candidat, qui fixe la
  désignation des champs par leur libellé.
- **Limite connue des listes** : la liste n'est relue qu'une fois, 500 ms
  après le relevé conforme ; un candidat qui la remplacerait plus tard ne
  serait pas vu.
