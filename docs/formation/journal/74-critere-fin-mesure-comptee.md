# #74 · Étape 3 · Critère de fin : candidat de référence à 100 % dans une mesure comptée en CI

## Objectif

L'étape 3 est finie quand le candidat de référence obtient 100 % dans une
mesure comptée, et quand chaque issue qu'une mesure doit savoir produire
s'est produite au moins une fois sur une vraie pile. Avant ce ticket, ces
issues n'étaient prouvées qu'en Vitest (faux `docker`, faux Playwright) ou à
la main. Le ticket ajoute un job de CI qui mesure, sur une vraie pile :
- le candidat de référence ;
- les huit candidats défectueux ;
- une mesure refusée par le verrou du banc, puis une mesure interrompue.

Il versionne aussi un étalonnage fait en CI et les mesures comptées obtenues
sur `main`.

## Notions à connaître

- **Clone complet avec `actions/checkout`** : par défaut, l'action ne récupère
  qu'un commit. `fetch-depth: 0` récupère tout l'historique. Le runner en a
  besoin, car `--counted` fait `git merge-base --is-ancestor HEAD origin/main`,
  qui échoue dans un clone superficiel dès que `main` a avancé. —
  [actions/checkout](https://github.com/actions/checkout),
  [git-merge-base, --is-ancestor](https://git-scm.com/docs/git-merge-base)
- **Annulation d'un job et `exec`** : à l'annulation, GitHub envoie `SIGINT`
  au processus d'entrée de l'étape, puis `SIGTERM` 7 500 ms plus tard. Le
  shell d'une étape `run` ne relaie pas le signal (vu en #71). `exec node …`
  remplace le shell par le script, qui reçoit donc le signal. —
  [Workflow cancellation reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation)
- **Délai d'une étape** : `timeout-minutes` sur une étape l'arrête seule, et
  les étapes suivantes tournent si leur condition le permet. —
  [Workflow syntax, jobs.<job_id>.steps[*].timeout-minutes](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepstimeout-minutes)
- **Résumé d'un job** : ce qu'une étape écrit dans le fichier
  `$GITHUB_STEP_SUMMARY` s'affiche en Markdown sur la page de l'exécution.
  Le job des mesures y écrit le tableau de ses cas. —
  [Workflow commands, Adding a job summary](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary)
- **Commentaire YAML** : « Comments must be separated from other tokens by
  white space characters. » Dans `name: Panne de #68, mesure`, le ` #` ouvre
  donc un commentaire, et le nom devient « Panne de ». —
  [YAML 1.2.2, 6.6 Comments](https://yaml.org/spec/1.2.2/#66-comments)
- **Nombre de workers de Playwright** : sans réglage, Playwright lance des
  workers pour 50 % des cœurs logiques. Sur un runner GitHub, cela fait un
  seul worker, et les scénarios tournent en série. — aide de la CLI,
  `npx playwright test --help` (Playwright 1.65.1, version installée par le
  banc) : « Number of concurrent workers or percentage of logical CPU cores
  […] (default: 50%) ». La page
  [Parallelism](https://playwright.dev/docs/test-parallel) ne donne pas
  cette valeur.
- **`socket.destroy()`** : ferme la connexion TCP sans réponse HTTP. Côté
  navigateur, `page.goto` échoue tout de suite (`net::ERR_EMPTY_RESPONSE`). —
  [Node 22, socket.destroy](https://nodejs.org/docs/latest-v22.x/api/net.html#socketdestroyerror)

Liens ouverts le 2026-11-25 (`curl`) : chaque page répond `200`. Les ancres
`jobsjob_idstepstimeout-minutes`, `adding-a-job-summary`, `66-comments` et
`socketdestroyerror` existent. La phrase citée de YAML figure sur sa page, et
le README d'`actions/checkout` mentionne `fetch-depth: 0`.

## Ce qui a été construit

- **`.github/workflows/measures.yml`** (#110) : un job `changes`, puis un job
  `measures`. Il construit la pile une seule fois, puis enchaîne :
  - le candidat de référence : `--counted` en `workflow_dispatch` sur `main`,
    diagnostic sinon ;
  - le verrou du banc et l'interruption ;
  - les huit candidats défectueux ;
  - la configuration de Playwright cassée de #68.

  Il publie les mesures et les bruts en artefact `measures` (7 jours,
  ADR 0005), et le tableau des cas dans le résumé du job.
- **`scripts/measure-cases.ts`** : l'issue attendue de chaque cas, et
  `caseProblems`, contrôle pur du code de sortie, de `measure.json` et
  d'`oracle.json`.
- **`scripts/run-measure-case.ts`** : lance un cas, relaie `SIGINT`/`SIGTERM`
  à la mesure et la contrôle, constat de démarrage compris.
- **`scripts/interrupt-measure.ts`** : une seule mesure sert deux preuves :
  - pendant que Playwright tourne, une seconde mesure doit rendre le code 4
    sans rien écrire ;
  - puis `SIGINT` : code 3, `interrupted`, moins de 7 500 ms, aucun
    conteneur `candidate` ni processus `playwright test` restant, verrou du
    banc libéré.
- **`scripts/measure-process.ts`** : lancement d'une mesure dont le script
  connaît le PID, relais des signaux, attente de la ligne `Running` dans
  `oracle-playwright.log`.
- **Sonde d'isolation** (`fixtures/defective-candidates/isolation-probe/server.js`) :
  - nouvelle tentative `read-measure-marker` : elle écrit son environnement,
    avec la valeur d'`ARCHIVE_TOKEN` masquée ;
  - `start-report:check -- probe <start.log> --marker <marqueur>` y cherche
    le marqueur de la mesure ;
  - elle ne sert plus son constat qu'à la vérification de disponibilité, et
    coupe toute autre connexion.
- **`scripts/ci-scope.ts`** : nouveau job lourd `measures`, lancé sur une PR
  seulement si elle touche ses propres chemins.
- **`results/calibration/20261124T232316Z-aeb3037-ci45509307133.1-1.json`**
  (#109) : étalonnage fait en CI sur `main`.
- **`results/counted/`** (cette PR) : les trois mesures comptées du candidat
  de référence, faites sur `main` (voir « Difficultés »).
- **`tests/runner/counted-measure.test.ts`** (cette PR) : le test de
  `--counted` compare `results/counted/` avec les mesures déjà versionnées,
  au lieu de l'attendre vide.
- **`tests/fixtures/measure-cases/20261125T133422Z-52303ae-reference-candidate/`**
  (#114) : copie d'une vraie mesure comptée. Les tests de `caseProblems` en
  dérivent leurs variantes.
- **`CLAUDE.md`** (#114) : règle « une fixture qui imite un fichier produit
  par le banc est copiée d'un vrai fichier produit, avec sa provenance ».
- **`docs/specs/03-candidate-runner.md`** : huit candidats défectueux au lieu
  de sept, règle du marqueur et du masque, comportement de la sonde, preuve
  manuelle du legacy arrêté pendant l'oracle.

## Les choix faits et pourquoi

- **Quatre PR : étalonnage (#109), job (#110), correctif (#114), mesures et
  fiche (celle-ci)** plutôt qu'une seule. `--counted` refuse un `HEAD` qui
  n'est pas dans `origin/main`. La mesure comptée ne peut donc tourner
  qu'après la fusion du job, et se versionner que dans une PR suivante.
- **Réétalonnage avant la mesure comptée.** La règle décidée : réétalonner
  si l'empreinte de l'image d'exécution ou les commandes de fetch, install et
  build ont changé depuis 6a135fe. Les commandes n'avaient pas changé, mais
  l'empreinte de l'image, si : `sha256:3e802a7f…` en 6a135fe,
  `sha256:ab3c1aed…` dans l'exécution 45502579027. Étalonnage refait en CI
  sur `main` ([exécution 45509307133](https://github.com/karAmmi12/migrabench/actions/runs/45509307133),
  job de 3 min 58 s), versionné par #109.
- **Un seul job, une seule construction de la pile** plutôt qu'un job par
  cas : l'issue demande « dans le même job », et chaque construction coûte
  des minutes Actions.
- **Pas de lancement à chaque push sur `main`** : seulement en
  `workflow_dispatch`, et sur les PR qui touchent ses chemins. Le dépôt est
  privé, avec un quota de 2 000 minutes par mois.
- **Candidat défectueux 8 sur une vraie pile** : les images sont construites
  avec une empreinte de contexte étrangère, puis reconstruites, plutôt que de
  reprendre le faux `docker` de Vitest. Le Seam 1 demande une vraie pile.
- **Valeur d'`ARCHIVE_TOKEN` masquée dans le constat de la sonde** : c'est la
  valeur témoin du piège n° 2, que le score de l'étape 5 cherchera dans les
  sorties du candidat. La sonde ne doit pas la semer dans ses propres bruts.
- **Verrou du banc et interruption sur une même mesure** : la mesure qui
  tient le verrou est celle qu'on interrompt ensuite. Une mesure de moins à
  payer.
- **Legacy arrêté pendant l'oracle, retiré du job.** `--timeout-cap-ms` ne
  plafonne que la construction et la disponibilité, pas l'oracle. Sur le
  runner, les 38 scénarios attendent chacun 30 s. La preuve manuelle de #106
  reste citée dans la spec, et le plafond des délais de l'oracle est l'objet
  de #111.
- **Sonde : constat servi à la seule vérification de disponibilité,
  reconnue à l'en-tête `Accept`.** Filtrer sur le chemin ne suffisait pas : la
  vérification de disponibilité (`GET /`) et les navigations de l'oracle
  visent le même chemin `/`. Le `fetch` de Node envoie `accept: */*`, une
  navigation de navigateur `text/html`.
- **Les trois mesures comptées versionnées**, plutôt que la seule de
  l'exécution verte. Récit 23 de la spec : « les mesures prévues pour compter
  [sont] toutes versionnées dans `results/counted/`, invalides comprises,
  pour qu'aucune mesure gênante ne disparaisse ». Les deux premières sont
  complètes ; seul un contrôle faux du job les a rejetées.

## Difficultés rencontrées

- **L'issue n'avait que quatre commentaires.** Le plan devait couvrir cinq
  exigences, dont « les trois cas de panne de #68 ». Ces cas ne sont pas dans
  #74 : ils sont dans la section Evidence de la PR #106. Le plan les a repris
  de là.
- **Empreinte d'image non reproductible.** 344b70c et 6a135fe ont le même
  Dockerfile d'image d'exécution, mais des empreintes différentes
  (`3d2f1850…`, `3e802a7f…`). Juger un étalonnage sur cette empreinte
  conclut donc toujours « changé ». Issue #113 : juger sur le contenu.
- **`stack-not-from-this-copy` en local.** Une mesure lancée après une
  modification de `scripts/` a été refusée avant toute construction.
  - Cause : le contexte de construction de la pile est toute la racine du
    dépôt (#102). Modifier n'importe quel fichier suivi change l'empreinte.
  - Conséquence 1 : le cas « configuration de Playwright cassée » reconstruit
    les images après avoir modifié `oracle/playwright.config.ts`.
  - Conséquence 2 : modifier des fichiers pendant un lot de mesures locales
    a fait refuser `broken-stack` et `legacy-stopped-during-oracle`. Relancés
    sans toucher aux fichiers, au commit fa21aaf, ils ont rendu leur issue.
- **`saltImposed` introuvable dans `oracle.json`.** Les premiers tests de
  `caseProblems` mettaient `saltImposed` à la racine d'`oracle.json`. Une
  vraie mesure locale l'a montré sous `config.metadata` : « oracle.json:
  saltImposed is undefined, expected false ». Tests refaits rouges, puis
  verts au commit 03d95f4.
- **Mesure `never-ready` bloquée 954 143 ms en construction** (locale,
  commit 03d95f4), avec un délai de 48 970 ms. npm avait fini (« up to date
  in 135ms », `exit 0`). Relancée sur une pile reconstruite, elle a donné
  `start-not-ready` en 13 s. Non reproduite. Issue #112 : le délai tue-t-il
  le conteneur, ou faut-il aussi tuer le client `docker run` ?
- **`npm test` rouge sous charge.** Après des heures de mesures locales, un
  passage a donné 6 fichiers et 12 tests en échec, sans lien avec le diff.
  Seuls, ces fichiers passaient. Après `npm run stack:up`, la suite complète
  est passée au commit 24be934 : 80 fichiers, 719 passed, 1 skipped.
- **Legacy arrêté pendant l'oracle : 5 751 s en local, coupé à 10 min en
  CI.** Le délai de 30 s de Playwright se déclenche, puis la fermeture du
  contexte attend une requête du relais restée pendante (de 13 à 17 min par
  scénario en local). Retiré du job ; voir les choix.
- **Sonde d'isolation : 19 min en CI contre 199 s en local.** Même somme de
  durées des scénarios (1 082 759 ms en CI, 1 081 876 ms en local), mais un
  worker au lieu de sept. Corrigé dans la sonde, sans toucher au runner ni à
  l'oracle. La phase oracle passe de 1 108 054 ms
  ([exécution 45610167767](https://github.com/karAmmi12/migrabench/actions/runs/45610167767))
  à 32 162 ms
  ([exécution 45616489363](https://github.com/karAmmi12/migrabench/actions/runs/45616489363)),
  et le job de 28 min 12 s à 10 min 29 s.
- **Forcer un seul worker en local.** La configuration de l'oracle ne fixe
  pas `workers`, et Playwright n'a pas de variable d'environnement pour ça.
  Un préchargement jetable de `.probes/` réduit ce que renvoie `os.cpus()` à
  deux cœurs. Résultat : « Running 38 tests using 1 worker », phase oracle de
  la sonde en 15 071 ms.
- **Première mesure comptée rejetée par un contrôle faux.** Deux lancements
  sur `main`, au commit 52303ae :
  - [exécution 45624562190](https://github.com/karAmmi12/migrabench/actions/runs/45624562190),
    mesure `20261125T133340Z-52303ae-reference-candidate`, la première ;
  - [exécution 45624689673](https://github.com/karAmmi12/migrabench/actions/runs/45624689673),
    mesure `20261125T133422Z-52303ae-reference-candidate`.

  Les deux mesures sont complètes, 38 sur 38, et ont été rejetées par
  l'étape « Candidat de référence » avec le code 1 :
  `reference-counted: environment.originMain is missing`.
  - Cause : `scripts/measure-cases.ts` cherchait `originMain` sous
    `environment`, alors que le banc l'écrit à la racine de `measure.json`.
    Les tests passaient sur des fixtures écrites de mémoire, avec la même
    mauvaise forme.
  - Correction (#114) : la fixture est copiée de la vraie mesure (rouge au
    commit 0dbc366, vert au commit d503036), et `CLAUDE.md` gagne la règle
    des fixtures copiées. Issue #115 : convertir les autres fixtures.
- **Étapes « Panne de ».** Dans les mêmes exécutions, les trois étapes
  `Panne de #68, …` s'appelaient toutes « Panne de » : le ` #` ouvrait un
  commentaire YAML. Noms mis entre guillemets (#114).
- **Test `counted-measure` rouge une fois les mesures versionnées.** Le job
  `tests` de cette PR ([exécution 45636668767](https://github.com/karAmmi12/migrabench/actions/runs/45636668767),
  commit c47d653) a échoué sur 2 tests de
  `tests/runner/counted-measure.test.ts`. Ce test copie le banc,
  `results/counted/` compris, et attendait ce dossier vide avant sa mesure :
  c'était vrai tant qu'aucune mesure comptée n'était versionnée. La suite
  complète n'avait pas été relancée sur cette branche avant l'ouverture de la
  PR. Le test compare désormais avec le contenu de `results/counted/` avant
  la mesure (commit 402bdb4) : 2 rouges sans le correctif, 2 verts avec.
- **Contrôle de la fiche en échec sur #110** : une case cochée chiffrée ne
  citait aucun commit. Plan de test corrigé avec les SHA.

## Vérifier soi-même

```sh
npx vitest run tests/runner/versioned-measures.test.ts --reporter=verbose
```

Les trois mesures comptées passent le contrôle des mesures versionnées
(commit c5ca232) :

```text
✓ … > 20261125T133340Z-52303ae-reference-candidate passes the measure check
✓ … > 20261125T133422Z-52303ae-reference-candidate passes the measure check
✓ … > 20261125T140819Z-889e111-reference-candidate passes the measure check
Tests  7 passed (7)
```

```sh
npm run stack:up && npm test
```

Observé au commit 402bdb4 : `Test Files  80 passed (80)`,
`Tests  724 passed (724)`. Plus aucun test sauté : le contrôle des mesures
versionnées était le seul, faute de mesure.

```sh
npx vitest run tests/runner/versioned-measures.test.ts tests/measure-cases.test.ts tests/start-report.test.ts tests/ci-scope.test.ts
```

Observé sur la branche de cette PR : `Test Files  4 passed (4)`,
`Tests  91 passed (91)`.

```sh
npm run stack:up && node scripts/run-measure-case.ts contract-invalid
```

Observé au commit 8fd72de, avec les modifications non encore commitées :

```text
contract-invalid: results/diagnostic/20261125T001256Z-8fd72de-defective-candidates-contract-invalid is the expected measure (contract-failure, contract-invalid, exit code 0).
```

```sh
node scripts/interrupt-measure.ts
```

Observé au commit 8fd72de, avec les modifications non encore commitées :

```text
refused-lock: The bench lock is held by measure (PID 87495 …
The measure exited with code 3, 1199 ms after SIGINT.
Bench lock refusal and interrupted measure hold: results/diagnostic/20261125T001733Z-8fd72de-reference-candidate, 1199 ms after SIGINT.
```

```sh
gh run view 45630451023 --json jobs --jq '.jobs[]|select(.name=="measures")|"\(.conclusion) \(.startedAt) \(.completedAt)"'
```

L'exécution verte sur `main` (commit 889e111), source de la mesure
`20261125T140819Z-889e111-reference-candidate` :

```text
success 2026-11-25T14:06:50Z 2026-11-25T14:17:25Z
```

> À vérifier après l'exécution de la CI de la PR : relever le job `tests`
> (contrôle des mesures versionnées sur les trois dossiers de
> `results/counted/`) et le job « Fiche de formation », avec leurs liens et
> le commit.

## Pour aller plus loin

- #111 : plafond des délais de l'oracle pour les mesures de diagnostic, qui
  ramènerait dans la CI le cas du legacy arrêté pendant l'oracle.
- #112 : le délai de construction tue-t-il ce qui bloque, conteneur ou
  client `docker run` ?
- #113 : juger la validité d'un étalonnage sur le contenu, pas sur
  l'identifiant d'image.
- #115 : convertir les fixtures écrites à la main en copies de vrais
  fichiers produits. Leurs sources sont dans des artefacts qui expirent le
  2026-12-01 et le 2026-12-02.
