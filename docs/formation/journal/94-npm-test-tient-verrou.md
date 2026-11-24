# #94 · Verrou du banc : npm test ne le tient pas pendant qu'il utilise la pile

## Objectif

Les tests du Seam A envoient des requêtes au legacy de la pile, et l'un d'eux
le redémarre (#67). Pourtant, `npm test` ne faisait que vérifier le verrou du
banc au démarrage (`pretest`), sans le prendre. Une mesure, une exécution
complète de l'oracle ou `npm run stack:up` lancés pendant un `npm test` n'étaient
donc pas refusés. Le ticket fait tenir le verrou du banc à `npm test` du
début à la fin, y compris sur échec et sur interruption : c'est la décision
validée par Karim le 24/11, dans un commentaire de l'issue.

## Notions à connaître

- **Groupe de processus et Ctrl+C** : un terminal range une commande au
  premier plan dans un groupe de processus. Ctrl+C envoie `SIGINT` à **tous**
  les processus de ce groupe, pas seulement au premier. Un processus lancé
  par un autre hérite de son groupe. —
  [GNU C Library, Job Control](https://www.gnu.org/software/libc/manual/html_node/Job-Control.html),
  [Access to the Terminal](https://www.gnu.org/software/libc/manual/html_node/Access-to-the-Terminal.html)
- **`detached` de `child_process.spawn`** : sur macOS et Linux, l'enfant
  devient chef d'un nouveau groupe de processus (« made the leader of a new
  process group and session »). Il ne reçoit plus les signaux que le terminal
  envoie au groupe de premier plan. —
  [Node 22, options.detached](https://nodejs.org/docs/latest-v22.x/api/child_process.html#optionsdetached)
- **Événements de signal de Node** : `process.on("SIGINT", …)` remplace le
  comportement par défaut (sortir). Un gestionnaire posé avec `once` ne sert
  qu'une fois : au second signal, le comportement par défaut revient et le
  processus meurt aussitôt. —
  [Node 22, Signal events](https://nodejs.org/docs/latest-v22.x/api/process.html#signal-events)
- **Scripts npm et relais des signaux** : `npm test` lance `pretest`, puis
  `test`. Pendant que le script tourne, npm relaie `SIGINT` et `SIGTERM` à son
  enfant (`signal-manager.js` de `@npmcli/run-script`, version 9.1.0 livrée
  avec npm 10.9.9 sur la machine de la session). —
  [npm, Pre & Post Scripts](https://docs.npmjs.com/cli/v10/using-npm/scripts#pre--post-scripts),
  [npm/run-script, signal-manager.js](https://github.com/npm/run-script/blob/main/lib/signal-manager.js)
  (fichier de la branche `main` ; la session a lu la copie installée).

Liens ouverts le 2026-11-24 (`curl`) : chaque page répond `200`. Les ancres
`optionsdetached`, `signal-events` et `pre--post-scripts` existent, et la
phrase citée de Node figure sur sa page.

## Ce qui a été construit

- **`scripts/test.ts`**, nouveau : c'est maintenant le script `test` de
  `package.json`. Il :
  - prend le verrou du banc avec l'outil `test`, par `acquireBenchLockOrExit`,
    comme les autres outils du banc. Sur refus, il sort avec le code `4`
    (`refused-lock`) avant de lancer Vitest ;
  - lance `vitest run` avec les arguments reçus (`npm test -- <fichier>`), dans
    son propre groupe de processus ;
  - relaie à Vitest la première interruption reçue (`SIGINT`, `SIGTERM`,
    `SIGHUP`), une seule fois ;
  - libère le verrou du banc à la fin de Vitest, ou si Vitest ne peut pas être
    lancé, et rend le code de Vitest.
- **`scripts/check-bench-lock.ts`** : supprimé. `pretest` ne vérifie plus que
  la version de Node.
- **`shared/bench-lock.ts`** :
  - l'outil `test` s'ajoute au type `BenchTool` ;
  - `inspectBenchLock` et `BenchLockState` sont retirés : ils ne servaient
    plus qu'aux tests ;
  - la commande `pgrep` du refus de reprise cherche aussi `scripts/test.ts`.
- **`tests/bench-lock.test.ts`** : le bloc des tests de `pretest` devient
  « npm test holding the bench lock ». Le script est copié dans un dépôt
  temporaire, à côté d'un faux Vitest (`node_modules/vitest/vitest.mjs`).
  Neuf tests :
  - prise pendant que Vitest tourne, avec les arguments transmis ;
  - libération après des tests en échec ;
  - refus pendant qu'une mesure tient le verrou du banc, sans lancer Vitest ;
  - reprise d'un verrou orphelin ;
  - libération quand Vitest ne peut pas être lancé ;
  - quatre interruptions : Ctrl+C au terminal, Ctrl+C sous npm, `SIGINT` seul,
    `SIGTERM` seul. Dans chacune, le faux Vitest note chaque signal reçu et
    met une seconde à faire son nettoyage. Le test exige un seul signal, et un
    verrou du banc encore tenu à la fin du nettoyage.
- **`tests/runner/bench-lock-tools.test.ts`** : il observe le verrou du banc
  par `acquireBenchLock`, la fonction des outils du banc, au lieu
  d'`inspectBenchLock`.
- **Spec de l'étape 3** (« Verrou du banc », Seam 3, marqueur du Seam A),
  **`README.md`**, **`PROTOCOL.md`** : `npm test` parmi les outils qui
  prennent le verrou du banc, ses limites, et la réponse à la question du
  ticket sur `bench-lock-tools.test.ts`. `migrabench calibrate` manquait dans
  ces listes depuis #72 ; il y est ajouté.

## Les choix faits et pourquoi

- **Un script qui enveloppe Vitest**, plutôt que de prendre le verrou du
  banc dans la configuration globale de Vitest. La décision de Karim vise
  `npm test`. Avec la configuration globale, chaque `npx vitest run
  <fichier>` le prendrait aussi, et un simple test unitaire serait refusé
  pendant une mesure lancée depuis un autre worktree. Contrepartie, écrite
  dans la spec : `npx vitest` lancé directement ne prend pas le verrou du
  banc, et le marqueur du Seam A reste la protection dans ce cas.
- **Le même refus que les autres outils du banc** (`refused-lock`, code `4`).
  Le premier jet avait son propre message, `npm test refused`. La relecture
  des standards l'a signalé comme une copie d'`acquireBenchLockOrExit`, avec
  un second format à documenter. Il est remplacé au commit `25ffe05`.
- **Vitest dans son propre groupe de processus, et un seul relais.** Karim
  avait proposé de ne pas relayer `SIGINT` quand Vitest est dans le même
  groupe, et de le relayer quand `scripts/test.ts` le reçoit seul. Cette
  règle est écartée : un processus Node ne sait pas si un signal visait son
  groupe ou lui seul, puisque Node ne donne pas l'expéditeur du signal. Avec
  `detached: true`, Ctrl+C n'atteint plus que `scripts/test.ts`, qui relaie
  toujours. La garde « une seule fois » est nécessaire parce que npm relaie
  lui aussi `SIGINT`.
- **`inspectBenchLock` retirée**, à la demande de Karim, sur la règle de #96
  (`uncitedLines`) : les tests passent par les fonctions que le code utilise.
  Dans `bench-lock-tools.test.ts`, la prise de sonde n'a lieu qu'une fois
  l'outil arrivé au faux `docker`. Il tient alors déjà le verrou du banc, et
  le refus de la sonde nomme le détenteur. Une sonde tentée plus tôt pourrait
  devancer l'outil et le faire refuser.
- **La commande `pgrep` reste recopiée** dans le code, le README et un test :
  c'est la décision de Karim après la relecture.

## Difficultés rencontrées

- **Le premier test d'interruption bloquait Vitest.**
  - Symptôme : branche `feat/94-npm-test-holds-bench-lock` créée sur `main`
    `1c6a742`, avant le premier commit. `scripts/test.ts` existait sans
    gestion des signaux, et le test d'interruption venait d'être écrit.
    `npx vitest run tests/bench-lock.test.ts -t "npm test holding"` ne rendait
    pas la main au bout de 120 s, et Claude Code l'a passé en arrière-plan.
  - Cause : `scripts/test.ts` mourait sous le signal sans arrêter le faux
    Vitest. Celui-ci, orphelin, gardait les sorties héritées
    (`stdio: "inherit"`) ouvertes. Une fois les faux Vitest orphelins tués
    (`pkill`), l'exécution s'est terminée sur l'échec attendu :
    `expected true to be false` (verrou du banc resté en place).
  - Résolution : les tests d'interruption lancent `scripts/test.ts` avec
    `stdio: "ignore"` et tuent le faux Vitest restant dans un `finally`. Le
    script relaie les signaux et libère le verrou du banc.
- **Ctrl+C faisait recevoir `SIGINT` deux fois à Vitest.**
  - Symptôme : commit `25ffe05` et les quatre nouveaux tests d'interruption,
    non encore commités. Deux échouent, Ctrl+C au terminal et sous npm :

    ```text
    AssertionError: expected [ 'SIGINT', 'SIGINT', …(1) ] to deeply equal [ 'SIGINT', 'cleaned lock=held' ]
    ```

  - Cause : le faux Vitest était dans le groupe de `scripts/test.ts`. Il
    recevait le `SIGINT` du terminal, puis celui du relais. Le vrai Vitest
    pose ses gestionnaires avec `process.once("SIGINT", onExit)` (lu dans
    `node_modules/vitest/dist/chunks/index.Di8au7q4.js`) : le second signal
    l'aurait tué pendant son nettoyage.
  - Résolution : Vitest est lancé avec `detached: true`, et le relais ne
    sert qu'une fois (commit `5d22be5`). Les quatre tests passent.
- **Premier `npm test` complet en échec, sans défaut du code.**
  - Symptôme : avant le premier commit, `npm test` donnait
    `6 failed | 629 passed | 1 skipped`, dont « The stack does not run with
    the archive salt of npm test » dans `tests/seam-a/archive-reference.test.ts`.
  - Cause : la pile tournait avec un autre sel d'archive que celui de
    `.dev-archive-salt`.
  - Résolution : `npm run stack:up`, comme le dit le README, puis
    `npm test` : `635 passed | 1 skipped`.

## Vérifier soi-même

```sh
npx vitest run tests/bench-lock.test.ts tests/runner/bench-lock-tools.test.ts
```

Observé au commit `5d22be5` : `Tests  31 passed (31)`.

```sh
npm run stack:up && npm test
```

Observé au commit `5d22be5` : `Test Files  72 passed (72)`, puis
`Tests  638 passed | 1 skipped (639)`.

Une mesure lancée pendant un vrai `npm test` est refusée. Dans un terminal,
lancer `npm test -- tests/bench-lock.test.ts`, puis dans un autre, pendant
qu'il tourne :

```sh
node runner/cli.ts measure --candidate fixtures/reference-candidate
```

Observé dans la session, sur l'état commité juste après en `5c2aa07` (le
refus vient alors de `migrabench measure`, qui nomme `test` comme détenteur) :

```text
refused-lock: The bench lock is held by test (PID 60202 on …, started …: node scripts/test.ts tests/bench-lock.test.ts), taken at 2026-11-24T16:30:39.780Z
Bench lock: /Users/…/.local/state/migrabench/bench-lock
```

Ctrl+C dans un vrai terminal : lancer `npm test --
tests/runner/bench-lock-tools.test.ts`, appuyer sur Ctrl+C après le
`RUN v5.1.0`. Observé dans la session, avec `scripts/test.ts` tel que
commité en `5d22be5`, dans un pseudo-terminal piloté par Python (`pty.fork`, `\x03` écrit sur le terminal) : code de sortie `130`, verrou
du banc absent ensuite, aucun processus `vitest.mjs` restant (`pgrep -fl
vitest.mjs` vide). Sans Ctrl+C, le même pseudo-terminal sur
`tests/bench-lock.test.ts` va au bout : `Tests  25 passed (25)`, code `0`.

> À vérifier après l'exécution de la CI de la PR : le job des tests (`npm test -- --reporter=default --reporter=junit …`) passe avec `scripts/test.ts` ; relever le lien, le head SHA et la ligne `Tests`.

## Pour aller plus loin

- **Limite sous `SIGKILL`** : tué par `SIGKILL`, `scripts/test.ts` ne relaie
  rien. Vitest continue seul, et le verrou du banc, orphelin, est repris par
  le prochain outil du banc. La commande `pgrep` du refus de reprise ne voit
  pas ce Vitest restant.
- **`npx vitest` direct** ne prend pas le verrou du banc. Seul le marqueur du
  Seam A (#67) rend alors invalide une mesure qu'il croise.
- **Vitest hors du groupe de premier plan** : il ne reçoit plus Ctrl+Z ni
  Ctrl+\ du terminal. Un terminal réglé avec `stty tostop` suspendrait son
  affichage.
  > À vérifier : effet de `stty tostop`, non observé pendant la session.
- Spec de l'étape 3, section « Verrou du banc » :
  `docs/specs/03-candidate-runner.md`.
