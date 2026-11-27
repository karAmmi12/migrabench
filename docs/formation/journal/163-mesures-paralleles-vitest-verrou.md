# #163 · CI : mesures en jobs parallèles, et Vitest seulement sous le verrou du banc

## Objectif

Deux problèmes, réglés dans la même PR à la demande de Karim. D'abord, le job
`measures` du workflow « Mesures » a duré 39 min 47 s pour un délai de
45 min (exécution 46015618324, PR #162), et #132 l'aurait fait déborder.
Plutôt que de relever le délai, les mesures sont découpées en jobs
parallèles. Ensuite, un `vitest` lancé directement, sans `npm test`, ne tient
pas le verrou du banc : pendant la session 1, un tel lancement depuis un
worktree a rendu invalide une mesure en cours. Vitest refuse désormais de
démarrer hors de `npm test`.

## Notions à connaître

- **Matrice d'un job GitHub Actions** : `strategy.matrix` lance une copie du
  job par combinaison de valeurs. `fail-fast` vaut `true` par défaut : un
  job de la matrice en échec annule les autres. Le délai
  (`timeout-minutes`) et le nom (`name`) du job peuvent lire le contexte
  `matrix`. — [Workflow syntax, `jobs.<job_id>.strategy`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
  et [Contexts, « Context availability »](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts).
  Pages lues le 2026-11-27 : la phrase « This property defaults to `true`. »
  et les lignes du tableau pour `jobs.<job_id>.timeout-minutes` et
  `jobs.<job_id>.name` (`github, needs, strategy, matrix, vars, inputs`).
- **`globalSetup` de Vitest** : un module dont la fonction `setup` tourne
  avant les workers de test, hors de leur portée globale. La page dit : « The
  global setup is called before the test workers are created », « only if
  there is at least one test queued », et « Multiple global setup files are
  possible. `setup` and `teardown` are executed sequentially ». Elle ne dit
  rien d'une exception levée dans `setup` : son effet (arrêt, code 1) est
  celui observé (voir « Vérifier soi-même »). —
  [Vitest, `globalSetup`](https://vitest.dev/config/globalsetup), page de la
  version 5.1.2 lue le 2026-11-27.
- **Verrou du banc** : voir `GLOSSARY.md` et `shared/bench-lock.ts`. `npm test`
  le prend depuis #94.

## Ce qui a été construit

- **`.github/workflows/measures.yml`** :
  - le job `measure-group`, une matrice de quatre groupes, chacun avec sa
    construction de la pile, son délai et son artefact
    (`measures-<groupe>`) :
    - `reference` : candidat de référence (compté sur `main`), verrou du banc
      et mesure interrompue, porte du relais, délai 15 min ;
    - `defective` : candidats défectueux 1 à 8 et panne de #68, 20 min ;
    - `xss` : porte XSS, 30 min ;
    - `role` : porte de rôle, 30 min.
    Chaque étape de mesure porte `matrix.group == '<groupe>'` dans son `if`.
  - le job `measures`, qui rassemble : il écrit les durées dans son résumé et
    échoue si un job de groupe n'a pas réussi, d'après la conclusion de
    chacun lue sur l'API.
- **`scripts/measure-durations.ts`** (pur) et
  **`scripts/write-measure-durations.ts`** : lisent les jobs de l'exécution
  sur l'API et donnent la durée de chaque groupe, leur somme, le plus long et
  la durée du premier départ à la dernière fin.
- **`tests/fixtures/github-api/measures-jobs-run46015618324.json`** : vraie
  réponse de l'API, enregistrée le 2026-11-27 (commande dans le `README.md`
  du dossier).
- **`shared/bench-lock.ts`** : `NPM_TEST_PID` et `npmTestLockProblem`, qui
  rend la raison d'un refus, ou rien.
- **`scripts/test.ts`** : pose `MIGRABENCH_NPM_TEST_PID` (son propre PID) dans
  l'environnement de Vitest.
- **`tests/bench-lock-held.setup.ts`**, premier `globalSetup` de
  `vitest.config.ts` : refuse de démarrer sans la variable, ou si le verrou du
  banc n'est pas tenu par l'outil `test` sous ce PID.
- **`scripts/ci-scope.ts`** : les deux nouveaux scripts font partie des chemins
  du job des mesures.

## Les choix faits et pourquoi

- **Quatre groupes plutôt que les trois suggérés** (référence et verrou,
  défectueux, portes). Les portes durent ensemble 27 min sur l'exécution
  46015618324 (relais 2 min 25 s, XSS 11 min 39 s, rôle 13 min 8 s) : un seul
  groupe de portes resterait le plus long et grossirait avec #132. La porte
  du relais, courte, rejoint le groupe de référence.
- **Une matrice avec un `if` par étape**, plutôt que quatre jobs écrits en
  entier ou une boucle dans une seule étape. La construction de la pile n'est
  écrite qu'une fois, et chaque mesure garde son étape lancée par `exec` :
  l'annulation du job lui relaie SIGINT (#71).
- **Un job `measures` qui rassemble**, plutôt que renommer. `scripts/ci-scope.ts`
  cherche un job nommé exactement `measures` pour savoir si les mesures ont
  réussi sur un commit, et `tests/workflow-heavy-jobs.test.ts` exige qu'il
  existe sans `name:`.
- **Durée totale = somme des jobs**, avec en plus la durée du premier départ à
  la dernière fin. La somme se compare aux 39 min 47 s d'avant (minutes de
  runner) ; l'autre dit combien de temps on attend.
- **L'échec lu job par job sur l'API**, plutôt que `needs.measure-group.result`.
  La documentation relue dans la session ne dit pas comment le résultat d'une
  matrice est agrégé pour un job qui en dépend ; la conclusion de chaque job,
  elle, se lit sur l'API et se teste sur une vraie réponse.
- **`fail-fast: false`** : un groupe en échec n'annule pas les autres, qui
  rendent leurs mesures.
- **Le globalSetup vérifie le fichier du verrou du banc**, pas seulement la
  variable : une variable posée à la main ne suffit pas, il faut que le verrou
  du banc soit tenu par l'outil `test` sous ce PID.

## Difficultés rencontrées

- **Le verrou du banc pris par une autre session.** Symptôme : `npm test --
  tests/measure-durations.test.ts` ne rendait aucune ligne de résultat. Cause :
  `refused-lock: The bench lock is held by measure (… isolation-probe …)`,
  code 4 ; une autre session mesurait. Résolution : attendre la fin de la
  mesure ; le refus est le comportement voulu.

- **Un refus qui semblait ne pas en être un.** Symptôme : `vitest` lancé
  directement affichait « No test files found » pour chaque projet, et la
  commande `… | head; echo "exit=$?"` donnait `exit=0`. Cause : `$?` était
  celui de `head`, et Vitest liste ses projets avant d'appeler le
  `globalSetup`. Résolution : sortie redirigée dans un fichier et code relevé
  directement : `exit=1`, avec le message du refus.

## Vérifier soi-même

```sh
npm test -- tests/bench-lock.test.ts
```

Test écrit avant le code (arbre de travail au-dessus de `131141c`, tests
seuls ajoutés) : `Tests  7 failed | 24 passed (31)`. Après le code :
`Tests  31 passed (31)`.

```sh
npm test -- tests/measure-durations.test.ts
```

Avant le module : `Cannot find module '../scripts/measure-durations.ts'`.
Après : `Tests  10 passed (10)`. Le test de `unsuccessful`, ajouté ensuite, n'a
pas été vu rouge : `npm test` a été refusé (code 4) tant qu'une mesure d'une
autre session tenait le verrou du banc, et le code était écrit entre-temps.

```sh
node node_modules/vitest/vitest.mjs run tests/ci-scope.test.ts; echo "exit=$?"
```

Observé dans la session (commit `bf628e5` écrit) : `Error: Vitest runs only
under the bench lock held by npm test: use npm test -- <file>
(MIGRABENCH_NPM_TEST_PID is not set).`, puis `exit=1`. Aucun marqueur du
Seam A ajouté : 436 fichiers dans `~/.local/state/migrabench/seam-a-markers`
avant et après.

```sh
npm run typecheck
```

Vert dans la session, sur le commit `97b0a3c`.

> À vérifier après l'exécution de la CI de la PR : durée de chaque groupe, durée totale et plus long job (résumé du job `measures`), lien et head SHA.

> À vérifier après l'exécution de la CI de la PR : `tests` (nombre de tests), `typecheck`, liens et head SHA.

## Pour aller plus loin

- #132 (porte d'authentification) : ses mesures forment un cinquième groupe,
  ou rejoignent le plus court.
- Chaque groupe reconstruit la pile : environ 1 min 20 s de plus par groupe
  sur l'exécution 46015618324 (image du navigateur, dépôt Maven, images).
- Le refus de Vitest ne protège pas d'un `vitest` lancé avec la variable et
  un verrou du banc forgé à la main : il arrête l'erreur, pas la malveillance.
