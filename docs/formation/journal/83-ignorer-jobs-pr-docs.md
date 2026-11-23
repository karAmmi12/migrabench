# #83 · CI : ignorer les jobs lourds d'une PR qui ne touche que docs/**

## Objectif

La règle de #76 ignore un job lourd (`tests`, `oracle`, `proof`) sur une PR
quand seul `docs/**` a changé depuis le dernier commit de la PR où ce même job
a réussi. Une PR neuve n'a encore aucune référence de ce genre. Sur une PR qui
ne touche que de la documentation, `tests` et `oracle` tournaient donc quand
même sur le premier commit. Ce ticket les fait ignorer dès ce premier commit
quand le diff complet de la PR ne touche que `docs/**`.

## Notions à connaître

- **Diff à trois points** : `git diff A...B` compare B à la base commune de A
  et B. C'est ce que montre l'onglet « Files changed » d'une PR, et c'est ainsi
  que le job `changes` calcule les fichiers de la PR (`prFiles`). —
  [git-diff, Description](https://git-scm.com/docs/git-diff#_description)
- **Commit de fusion d'une PR** : un workflow déclenché par `pull_request`
  tourne sur un commit de fusion temporaire de la tête dans la base. Si la PR
  ne touche que `docs/**`, ce commit a le code de la base. —
  [Events that trigger workflows, pull_request](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)

Liens ouverts le 2026-11-23 (`curl`) : chaque page répond `200` et chaque
ancre existe (`id="…"`).

## Ce qui a été construit

- **`scripts/ci-scope.ts`** : `onlyDocs(files)` est vrai pour au moins un
  fichier, tous sous `docs/`. `shouldRun` ignore un job lourd quand
  `onlyDocs(prFiles)` est vrai, avec la raison « la PR ne touche que
  `docs/**` ». Ce test passe après celui des chemins de `proof` et avant la
  recherche de référence. La règle de la référence utilise la même fonction.
- **`scripts/github-history.ts`** : `pullRequestFiles(baseSha, headSha)` rend
  les fichiers de la PR avec la plage à trois points `base...tête`. Le script
  `scripts/write-ci-scope.ts` l'appelle au lieu d'écrire la plage lui-même,
  si bien qu'un test la protège.
- **`tests/github-history.test.ts`** : « lists only the pull request's files
  when main moved on, so that a docs-only pull request stays docs-only ». Sur
  un vrai dépôt Git temporaire, une branche ne modifie que `docs/x.md`, puis
  `main` reçoit un commit de code `runner/y.ts`. `pullRequestFiles(main, pr)`
  doit rendre `["docs/x.md"]`.
- **`tests/ci-scope.test.ts`** : 3 tests de plus, soit 24.
  - `tests` et `oracle` sont ignorés sur une PR qui ne touche que `docs/**`,
    sans aucune référence ;
  - un diff vide fait tourner le job.
- **`README.md`**, en-têtes de `tests.yml` et `oracle.yml` : la règle
  complétée.

## Les choix faits et pourquoi

- **Étendre la règle, plutôt qu'ouvrir la PR de documentation de #76 telle
  quelle.** En préparant cette PR (branche `docs/76-main-proof`, `fef3fb4`),
  l'écart est apparu : avec la règle de #76, `tests` et `oracle` y auraient
  tourné. Deux options ont été proposées : étendre la règle d'abord, ou ouvrir
  la PR et consigner l'écart comme limite connue. Décision de l'humain :
  étendre.
- **Diff complet de la PR, base commune...tête.** Le code du commit de fusion
  est alors celui de la base. La règle de la référence reste inchangée pour
  tous les autres cas.
- **Un diff vide n'est pas « docs seul ».** Même raisonnement qu'en #76 pour
  une relance : sans aucun changement, on ne peut rien conclure, donc le job
  tourne.

## Difficultés rencontrées

- **La règle de #76 ne couvrait pas une PR de documentation neuve.**
  - Symptôme : relevé avant d'ouvrir la PR de documentation de #76. Sa
    première exécution n'aurait trouvé aucune référence.
  - Cause : la règle ne cherche qu'un succès du même job sur la PR.
  - Résolution : ce ticket. Les deux tests de la PR docs seule ont d'abord
    échoué, puis ils passent depuis `53096a0`.

- **Aucun test ne protégeait la comparaison à la base de fusion.**
  - Symptôme : à la question de l'humain, aucun test n'a pu être cité. Les
    tests de `shouldRun` reçoivent `prFiles` tout fait. Le seul test de
    `changedFiles` sur un vrai dépôt utilise deux points, et le test du
    script ne couvre que les événements hors PR. Remplacer `...` par `..`
    dans le script ne cassait aucun test.
  - Cause : la plage était écrite en dur dans `write-ci-scope.ts`, hors de
    toute fonction testée.
  - Résolution : la plage passe dans `pullRequestFiles`, avec le test
    ci-dessus. Pour prouver qu'il protège, la plage a été passée
    temporairement à `..`. Le test a échoué ainsi :

    ```text
    × lists only the pull request's files when main moved on, so that a docs-only pull request stays docs-only
    - Expected
    + Received
      [
        "docs/x.md",
    +   "runner/y.ts",
      ]
    ```

    La plage a ensuite été remise à `...`, et le test passe depuis `70ac43b`.

## Vérifier soi-même

Tests sans la pile, fichier par fichier (état : `70ac43b`) :

```sh
npx vitest run tests/ci-scope.test.ts            # Tests  24 passed (24)
npx vitest run tests/github-history.test.ts      # Tests  8 passed (8)
npx vitest run tests/write-ci-scope.test.ts      # Tests  3 passed (3)
npx vitest run tests/workflow-concurrency.test.ts  # Tests  6 passed (6)
npx vitest run tests/workflow-heavy-jobs.test.ts   # Tests  3 passed (3)
npx vitest run tests/pinned-actions.test.ts      # Tests  9 passed (9)
npm run typecheck                                # aucune erreur
bash scripts/check-pinned-actions.sh .github/workflows   # aucune sortie, code 0
```

CI de la PR #84, head `3caa40b`. Le commit touche du code, et la PR n'a
encore aucune référence :

- [« Tests du banc »](https://github.com/karAmmi12/migrabench/actions/runs/45266467734) : `tests : tourne (tests n'a réussi sur aucun commit de la PR ancêtre de la tête)`, job `success` ;
- [« Oracle »](https://github.com/karAmmi12/migrabench/actions/runs/45266467630) : `oracle` tourne et réussit, et
  `proof : ignoré (la PR ne touche aucun de oracle/, fixtures/legacy-app/, docker-compose.yml, results/oracle/)`.

Après la fusion, test réel sur la PR de documentation #85 (branche
`docs/76-main-proof`, rebasée sur `main` `a7b8f49`). Son diff ne touche que
`docs/**`, et son premier commit `ccd3a87` n'a aucune référence :

- [« Tests du banc »](https://github.com/karAmmi12/migrabench/actions/runs/45269380341) : `tests` ignoré,
  `tests : ignoré (la PR ne touche que docs/**)` ;
- [« Oracle »](https://github.com/karAmmi12/migrabench/actions/runs/45269380500) : `oracle` et `proof` ignorés,
  `oracle : ignoré (la PR ne touche que docs/**)`, puis
  `proof : ignoré (la PR ne touche aucun de oracle/, fixtures/legacy-app/, docker-compose.yml, results/oracle/)` ;
- [« Fiche de formation »](https://github.com/karAmmi12/migrabench/actions/runs/45269380385) tourne (`success`).

## Pour aller plus loin

- **Les tests de `main` ne tournent pas sur `push`.** `tests.yml` ne se
  déclenche que sur les PR : une PR docs seule s'appuie sur le fait que le
  code de la base a été testé dans la PR qui l'a fusionné, à sa tête.
- **#76** : la règle de la référence, les preuves de CI et la mesure des
  minutes (`docs/formation/journal/76-ci-reduire-consommation-minutes.md`).
