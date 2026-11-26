# #129 · Étape 4 · Porte XSS sur les trois écrans

## Objectif

Le legacy écrit le demandeur sans échappement dans les résultats de la
recherche (`<bean:write filter="false">`). C'est un piège à corriger
(`TRAPS.md`, « XSS »), et rien ne le mesurait encore. Ce ticket ajoute la
porte XSS. Elle affiche une charge silencieuse sur les trois écrans du
candidat et rend deux résultats par écran : la charge s'est-elle exécutée, et
est-elle affichée en texte ? Le legacy, présenté par le candidat de
référence, doit échouer sur la recherche.

## Notions à connaître

- **XSS (cross-site scripting)** : une donnée insérée dans une page sans
  échappement y devient du code. Ici, un demandeur `<img src=x onerror=…>`
  exécute son `onerror`. Échapper (`&lt;img…`) affiche la donnée en texte.
  Assainir (retirer l'attribut dangereux) empêche l'exécution, mais l'utilisateur
  ne voit plus ce qui a été saisi. —
  [OWASP, Cross Site Scripting](https://owasp.org/www-community/attacks/xss/)
- **`addInitScript` et `exposeBinding` de Playwright** : le premier lance un
  script dans chaque page et chaque cadre, avant les scripts de la page. Le
  second expose dans la page une fonction qui appelle le code du banc, avec la
  page et le cadre appelants (`source`). —
  [Playwright, BrowserContext](https://playwright.dev/docs/api/class-browsercontext)
- **Propriété non configurable à accesseur** : `Object.defineProperty` avec
  `configurable: false` et un `set`. Ensuite, `delete` échoue et redéfinir la
  propriété lève une `TypeError` : toute écriture passe par le `set`. —
  [MDN, Object.defineProperty](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty)
- **`innerText`** : le texte rendu d'un élément, sans le contenu caché et
  sans les valeurs des champs. —
  [MDN, HTMLElement.innerText](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/innerText)
- **Événements de requête et `networkidle`** : une page Playwright émet
  `request`, `requestfinished` et `requestfailed`. `networkidle` veut dire
  « aucune connexion pendant au moins 500 ms ». `waitForLoadState` se résout
  aussitôt si le document a déjà atteint cet état. —
  [Playwright, Page](https://playwright.dev/docs/api/class-page)

Liens ouverts le 2026-11-26 (`curl -L`), et tous ont répondu `200` :

| Page | Ce qu'elle contient |
|---|---|
| BrowserContext | `exposeBinding` et `addInitScript` |
| MDN `defineProperty` | `configurable` |
| MDN `innerText` | « rendered text » |
| Page | `requestfinished`, « no network connections for at least 500 ms » et « If current document has already reached the required state, resolves immediately » |
| OWASP | « Cross Site Scripting » |

## Ce qui a été construit

- **`gates/xss.ts`**, la porte :
  - **Écrans** : la recherche par numéro de `D-0101` et sa fiche, vues en
    agent, puis la remise de `D-0118`, atteinte depuis sa fiche et vue en
    instructeur. La porte ne clique jamais sur « Remettre ».
  - **Détection** : un accesseur `__mbXss`, non configurable, posé par
    `addInitScript`. Il signale chaque écriture par le binding
    `__mbXssReport`, dont il garde la fonction dans une fermeture.
  - **Attente** : la porte compte elle-même les requêtes en cours. Elle
    attend 500 ms sans requête (au plus 15 s), puis 1 s.
  - **Résultats** : `executed/<écran>` et `as-text/<écran>`, jugés.
    `examined` compte les affichages du dossier.
  - **Bruts** : `gates/xss/<écran>.json`, avec l'observation et les écritures
    reçues avant l'écran.
- **`fixtures/legacy-app/src/main/resources/dossiers.json`** : ajout de
  `D-0118`, `EN_INSTRUCTION`, avec la même charge, réservé à `gate:xss`.
  `TRAPS.md` dit pourquoi il existe.
- **`gates/registry.ts`** : la porte XSS vient juste après l'accessibilité.
- **Candidats**, des relais du legacy qui ne réécrivent que les pages
  porteuses de la charge :
  - `conforming-candidates/xss-escapes` échappe la charge sur la recherche ;
  - `defective-candidates/xss-sanitizes` la remplace par `<img src="x">` ;
  - `defective-candidates/xss-injects-on-sheet` échappe la charge, puis la
    recopie en HTML sur la fiche, 300 ms après le chargement et après une
    requête ;
  - `defective-candidates/xss-executes-then-erases` exécute la charge, puis
    fait `delete window.__mbXss` et y écrit `undefined`.
- **`scripts/measure-cases.ts` et `.github/workflows/measures.yml`** : les
  issues attendues des quatre candidats, du candidat de référence et des
  candidats sans écran (XSS `not-evaluable`), et quatre étapes de mesure.
- **Tests** :
  - `tests/gates/xss.test.ts` : jugement des observations, sur la vraie
    sortie de la sonde (`tests/fixtures/probe129-11cd11c/`) ;
  - `tests/gates/registry.test.ts` : l'ordre ;
  - `tests/seam-b/dataset.test.ts` : la réservation de `D-0118`.
- **Spec 04 et `TRAPS.md`** : les précisions de la porte XSS.

## Les choix faits et pourquoi

- **Le legacy échoue aussi à `as-text/search`** (Karim). La spec et
  `TRAPS.md` disaient que le legacy échoue « seulement » à
  `executed/search`. Or la recherche rend la charge en HTML : aucun texte
  n'en est affiché, exactement comme chez un candidat qui assainit, que la
  spec veut voir échouer. Les deux exigences ne tenaient pas ensemble. La
  question a été posée, et l'option « non évaluable si exécutée » a été
  écartée.
- **Attribution par frontière** plutôt que par étape en cours, ou par
  visite entière. La sonde montre que la charge s'exécute sur la page de
  résultats qui mène à la fiche. Compter toute la visite ferait échouer la
  fiche et la remise du legacy. Avant le clic qui mène à l'écran jugé, la
  porte attend donc le repos de l'écran précédent. Seules les écritures
  reçues ensuite comptent.
- **Repos suivi requête par requête** plutôt que par
  `waitForLoadState("networkidle")`. Ce dernier se résout aussitôt sur un
  document qui a déjà atteint l'état, donc il n'attendrait pas une
  application d'une seule page après sa première navigation.
- **Fonction du binding gardée dans la fermeture** : selon la sonde, la page
  peut écraser `window.__mbXssReport`, et l'écriture suivante est quand même
  reçue.
- **`as-text`** : la charge est cherchée dans `innerText` ou dans la valeur
  d'un champ visible. La fiche du legacy l'affiche dans un champ, sa remise
  dans le texte.
- **`examined`** : sur la recherche, ce sont les liens du numéro, pour
  qu'une ligne absente donne `not-evaluable` comme le veut la spec. Sur la
  fiche et la remise, ce sont les éléments visibles qui affichent le numéro.
- **Constat d'`as-text` réussi dès une occurrence**, plutôt qu'une par
  affichage : un candidat qui montre le numéro deux fois (titre et tableau)
  échouerait à tort.
- **Valeurs écrites bornées à 200 caractères** : c'est le candidat qui les
  choisit.
- **Corrections après la revue des normes** :
  - les écritures sont relevées en dernier, pour garder celles qui arrivent
    pendant les relevés ;
  - un objet de dossier manquant lève une erreur au lieu de chercher `""` ;
  - la limite de la frontière est écrite dans le commentaire.

## Difficultés rencontrées

- **Spec contradictoire sur `as-text/search`**, relevée à la conception,
  avant la première ligne de code. Elle a été soumise à Karim, qui a tranché
  (voir les choix).
- **Écriture attribuée à la mauvaise étape**, relevée par la sonde. Sur le
  chemin de la remise, l'écriture de la recherche de `D-0118` est arrivée
  alors que l'étape en cours était déjà « sheet D-0118 ». Le `onerror` d'une
  image se déclenche après le chargement, et le signalement est asynchrone.
  Résolution : la frontière d'attribution.
- **Pile occupée.** Une mesure du candidat d'essai, lancée par une autre
  session, tenait le verrou du banc. La sonde a attendu sa fin. `D-0118` et
  son test ont été écrits pendant ce temps.
- **Mesures refusées en `stack-not-from-this-copy`.**
  - D'abord, la pile avait été construite depuis `11cd11c`, et les mesures
    tournaient sur `fa0b155`. Résolution : `npm run stack:up`.
  - Ensuite, la référence a réussi, puis les quatre mesures suivantes ont été
    refusées. Cause : l'outil de réveil de la session a créé
    `.claude/scheduled_tasks.lock` dans le dépôt, et ce fichier entre dans
    l'empreinte du contexte de la pile, car `.dockerignore` ne l'exclut pas.
    Résolution : reconstruire la pile avec le fichier présent, puis relancer.
- **Attente mal écrite pour l'effacement.** La porte avait bien relevé
  l'écriture de `undefined`, mais l'attente `findingCites: '"undefined"'`
  échouait : `citesText` cherche le texte avec ses guillemets échappés.
  Résolution : `findingCites: "undefined"` (commit `2dd0758`).

## Vérifier soi-même

```sh
node .probes/129/probe.mjs
```

La sonde n'est pas versionnée (`.probes/`). Son code est copié dans
`tests/fixtures/probe129-11cd11c/probe.mjs.txt`. Elle a été lancée sur un
arbre propre au commit `11cd11c`, après `npm run stack:up`. Sortie observée,
abrégée (`PROVENANCE.md`) :

- `bindingTypeAtInit: "function"` ;
- `delete` rend `false`, et `defineProperty` lève `TypeError: Cannot redefine property: __mbXss` ;
- écritures reçues `1`, puis `undefined`, puis `after-overwrite` ;
- remise : l'écriture vient de `rechercher.do…number=D-0118`, et
  `payloadText: 1`.

Rouge d'abord, observé pendant la session :

- `tests/seam-b/dataset.test.ts` avant `D-0118` : `Tests  1 failed | 9 passed (10)` ;
- `tests/gates/xss.test.ts` avant le module : `Tests  no tests`, car
  l'import échoue ;
- le test d'ordre du registre avant l'inscription de la porte :
  `× runs the XSS gate right after the accessibility gate`.

```sh
npm run stack:up && npm test
```

Observé sur le commit `ad4c300`, arbre propre :
`Test Files  98 passed (98)`, `Tests  1070 passed (1070)`.

```sh
npm run stack:up && node scripts/run-measure-case.ts xss-injects-on-sheet
```

Mesures de diagnostic locales, chacune après `npm run stack:up`, sur un arbre
propre. Chacune est « the expected measure (completed, ok, exit code 0) ».

| Mesure | Commit | `executed` search / sheet / submission | `as-text` search / sheet / submission | Phase `gates` |
|---|---|---|---|---|
| `20261126T221352Z-fa0b155-reference-candidate` | `fa0b155` | failed / passed / passed | failed / passed / passed | 12 036 ms |
| `20261126T221515Z-fa0b155-conforming-candidates-xss-escapes` | `fa0b155` | passed / passed / passed | passed / passed / passed | 11 905 ms |
| `20261126T221542Z-fa0b155-defective-candidates-xss-sanitizes` | `fa0b155` | passed / passed / passed | failed / passed / passed | 12 046 ms |
| `20261126T221610Z-fa0b155-defective-candidates-xss-injects-on-sheet` | `fa0b155` | passed / failed / passed | passed / passed / passed | 12 356 ms |
| `20261126T221725Z-2dd0758-defective-candidates-xss-executes-then-erases` | `2dd0758` | failed / passed / passed | failed / passed / passed | 12 035 ms |

- Le candidat qui efface rend deux constats sur `executed/search`, de
  valeurs `1` et `undefined`.
- Sur le legacy, les bruts `sheet.json` et `submission.json` rangent
  l'écriture de la recherche dans `receivedBeforeScreen`, et `writes` est
  vide.
- Chaque résultat XSS a `values.networkIdle: 1`.
- La phase `gates` durait 1 878 ms en local avant ce ticket (mesure `20261126T170809Z-b930d8d-reference-candidate`, arbre propre), avec
  l'accessibilité seule (fiche de #128). La porte XSS y ajoute donc
  une dizaine de secondes, loin du seuil de 5 minutes.

Couverture par les tests existants :

- le filtre de la copie expurgée (1a) écarte `D-0118` : c'est le test
  `keeps no reserved dossier` de `tests/legacy-copy/legacy-copy-real.test.ts`,
  qui écarte tout dossier de `reservations`, sur le vrai jeu de données ;
- la partition des dossiers est vérifiée par
  `assigns each reserved dossier to exactly one scenario or gate`, dans
  `tests/seam-b/dataset.test.ts`.

**En CI, sur la vraie pile**, tête de la PR `dd5a226` (fusion de `main`
dans la branche, après #130 et #153) :

- job des mesures, [exécution 45904839677](https://github.com/karAmmi12/migrabench/actions/runs/45904839677) :
  chaque cas est conforme à l'attendu.

  | Mesure | Résultats XSS | Phase `gates` |
  |---|---|---|
  | `20261126T222801Z-dd5a226-reference-candidate` | `failed` à `executed/search` et `as-text/search`, `passed` aux quatre autres | 12 907 ms |
  | `20261126T223520Z-dd5a226-conforming-candidates-xss-escapes` | six `passed` | 12 784 ms |
  | `20261126T223619Z-dd5a226-defective-candidates-xss-sanitizes` | `as-text/search` `failed`, les cinq autres `passed` | 12 806 ms |
  | `20261126T223717Z-dd5a226-defective-candidates-xss-injects-on-sheet` | `executed/sheet` `failed`, les cinq autres `passed` | 13 224 ms |
  | `20261126T223816Z-dd5a226-defective-candidates-xss-executes-then-erases` | `executed/search` (constat `undefined`) et `as-text/search` `failed` | 12 840 ms |
  | `20261126T223434Z-dd5a226-conforming-candidates-relay-untouched` | six `not-evaluable`, `examined: 0` | 913 ms |

- **Durée ajoutée à la mesure en CI** : la phase `gates` du candidat de
  référence durait 2 802 ms avant la porte XSS (mesure
  `20261126T221443Z-1f990d7-reference-candidate`,
  [exécution 45903361617](https://github.com/karAmmi12/migrabench/actions/runs/45903361617)),
  et 12 907 ms avec elle. La porte ajoute donc 10,1 s par mesure, sous le
  seuil de 5 minutes. Les quatre étapes de mesure ajoutées au job durent
  ensemble 3 min 53 s (de 22:35:20Z à 22:39:13Z).
- Oracle et preuve avec `D-0118`,
  [exécution 45904839458](https://github.com/karAmmi12/migrabench/actions/runs/45904839458) :
  `38 passed` à l'exécution complète et à chacune des cinq exécutions de la
  preuve, puis `Proof holds on 5 results.`
- `tests`, [exécution 45904839542](https://github.com/karAmmi12/migrabench/actions/runs/45904839542) :
  `Test Files  99 passed (99)`.
- `typecheck`, [exécution 45904839452](https://github.com/karAmmi12/migrabench/actions/runs/45904839452) : vert.

## Pour aller plus loin

- **#134, Lighthouse** : la porte à navigateur suivante, dans le même groupe.
- **#100, étalonnage** : le délai de la porte (3 min), l'attente du repos
  (500 ms, 15 s, puis 1 s) et celle de la ligne (10 s).
- **Limites connues** :
  - une écriture de l'écran précédent qui arrive après le clic compte contre
    l'écran jugé ;
  - une recherche qui affiche le numéro sans lien rend `executed/search`
    `not-evaluable`, même si la charge s'exécute ;
  - `.dockerignore` n'exclut pas `.claude/scheduled_tasks.lock`.
- **Extension hors périmètre** (`TRAPS.md`) : injecter la charge par
  l'écran 2.
