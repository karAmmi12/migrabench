# #39 · Étape 2 · Critère de fin : 5 exécutions vertes et job de CI de l'oracle

## Objectif

Le critère de fin de l'étape 2 demande 100 % de scénarios réussis sur 5
exécutions complètes consécutives de l'oracle contre le legacy, chacune
enregistrée depuis un arbre de travail propre. Ce ticket fait tourner
l'oracle en CI et ajoute un **job de preuve** : les images sont construites
une seule fois, puis l'oracle est lancé 5 fois sur ces mêmes images. Chaque
résultat enregistre l'exécution de CI qui l'a produit (`ciRun`), et une
vérification refuse les 5 résultats si l'un des critères de la spec n'est pas
tenu.

## Notions à connaître

- **Déclencheur `pull_request` et commit de fusion** : sur ce déclencheur,
  `actions/checkout` récupère par défaut `refs/pull/<N>/merge`, un commit de
  fusion temporaire créé par GitHub, qui n'entre jamais dans l'historique de
  la branche. L'entrée `ref` permet de récupérer le commit de la PR à la place
  (`github.event.pull_request.head.sha`). —
  [GitHub Docs : Events that trigger workflows, pull_request](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#pull_request)
  > À vérifier : ancre exacte de la page GitHub Docs.
- **`GITHUB_RUN_ID` et `GITHUB_RUN_ATTEMPT`** : variables définies par GitHub
  Actions dans chaque job. L'identifiant reste le même quand on relance une
  exécution ; la tentative augmente. —
  [GitHub Docs : Default environment variables](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/store-information-in-variables#default-environment-variables)
- **`actions/upload-artifact` et fichiers cachés** : depuis la v4.4, les
  fichiers et dossiers dont le nom commence par un point sont exclus, sauf
  avec `include-hidden-files: true`. Le dossier des bruts, `.oracle-artifacts/`,
  en est un. L'entrée est présente dans l'`action.yml` du SHA épinglé
  (`cf430e0…`, v7.0.2), relu pendant la session. —
  [actions/upload-artifact : README](https://github.com/actions/upload-artifact#readme)
  > À vérifier : version (v4.4) à partir de laquelle les fichiers cachés sont exclus.
- **`bash -e` dans un `run:`** : GitHub lance les étapes `run` avec
  `bash --noprofile --norc -eo pipefail {0}`. Une commande qui échoue dans la
  boucle des 5 exécutions arrête donc l'étape, ce qui rend les exécutions
  consécutives. —
  [GitHub Docs : jobs.<job_id>.steps[*].shell](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#jobsjob_idstepsshell)
- **`docker compose up --no-build`** : recrée les conteneurs à partir des
  images existantes, sans les reconstruire. C'est ce que fait le temps
  « préparer » de l'oracle (#32), et ce qui garantit la même empreinte
  d'images sur les 5 exécutions. —
  [Docker Docs : docker compose up](https://docs.docker.com/reference/cli/docker/compose/up/)

## Ce qui a été construit

- `oracle/ci-run.ts` :
  - `ciRunOf(env)` lit `GITHUB_ACTIONS`, `GITHUB_RUN_ID`,
    `GITHUB_RUN_ATTEMPT` et `ORACLE_CI_RANK`, et rend
    `{ runId, attempt, rank }`, ou rien hors de GitHub Actions. Un rang qui
    n'est pas un entier positif arrête l'exécution ;
  - `resultFileName` donne le nom du résultat :
    `<horodatage>-<commit court>.json` hors CI,
    `<horodatage>-<commit court>-ci<runId>.<attempt>-<rank>.json` en CI.
- `oracle/playwright.config.ts` : `captureGitInfo` désactivé, pour que la
  CI n'ajoute ni commit ni diff au résultat.
- `oracle/execute.ts` : le temps « préparer » lit `ciRun` avant de recréer la
  pile, l'ajoute aux métadonnées et nomme le fichier avec `resultFileName`.
- `oracle/proof.ts` : `checkProof(results)` rend la liste des manquements
  d'une preuve :
  - 5 exécutions, rangs 1 à 5 d'une même exécution de CI (même identifiant,
    même tentative) ;
  - pour chacune : `worktree: clean`, `saltImposed: false`, 38 scénarios
    réussis sur 38 ;
  - pour toutes : mêmes `benchCommit`, `node`, `chromium`, `playwright`,
    `frozenDate`, `images.legacy` et `images.archive`, chacun présent ;
  - 5 sels différents.
- `scripts/check-oracle-proof.ts` et `npm run oracle:proof` : la commande
  mince qui lit des résultats et lance `checkProof`.
- `.github/workflows/oracle.yml` : le workflow « Oracle », sur chaque PR :
  - job `oracle` : une exécution complète (rang 1) ;
  - job `proof` : construction des images, 5 exécutions complètes, puis
    `npm run oracle:proof` sur les 5 résultats ;
  - chaque job publie résultats JSON, traces, HAR et journaux de la pile en
    artefact, gardé 7 jours (ADR 0005).
- Tests : `tests/oracle/ci-run.test.ts` et `tests/oracle/proof.test.ts`, un
  test négatif par critère de la preuve.
- Documentation : `README.md` (section « Lancer l'oracle ») et la ligne
  `ciRun` de `docs/specs/02-oracle.md`.

## Les choix faits et pourquoi

- **`ciRun` porte aussi la tentative (`attempt`).** La spec demandait
  l'identifiant et le rang. Une relance d'une exécution de CI garde le même
  identifiant : sans la tentative, deux fichiers de deux tentatives auraient
  le même nom au rang près. La ligne `ciRun` de la spec est précisée dans la
  même PR.
- **Rang 1 par défaut.** Le job `oracle` lance une seule exécution complète ;
  seul le job de preuve a besoin de `ORACLE_CI_RANK`.
- **Un vérificateur de preuve plutôt qu'une relecture à la main.** Les
  critères (même environnement, sels différents, 38 sur 38) se vérifient sur
  les JSON. `checkProof` le fait dans le job de preuve, avant publication, et
  sur les fichiers versionnés. Option écartée : relire les 5 JSON à la main
  dans la PR. Seams validés par l'humain avant le premier test.
- **Le job de preuve tourne sur chaque PR, après le job `oracle`.** Une
  exécution complète a duré 4,2 s pour les 38 scénarios en local (sortie de
  `npm run oracle`, voir plus bas). Option écartée : un label ou un
  déclenchement manuel, qui ajoute une mécanique pour un gain faible.
  En CI (exécution
  [45041781224](https://github.com/karAmmi12/migrabench/actions/runs/45041781224),
  commit `a664b7b`), le job `oracle` a duré de 16:04:37 à 16:06:44 UTC et le
  job `proof` de 16:06:46 à 16:12:29 UTC (`gh run view`). Chaque exécution y
  affiche environ 35 s pour les 38 scénarios (`38 passed (35.8s)` au rang 1),
  sur 1 worker contre plusieurs en local.
- **Checkout du commit de la PR.** Relevé par la relecture « spec » : sans
  `ref`, les 5 résultats citeraient le commit de fusion temporaire de GitHub,
  introuvable une fois la PR fusionnée. Corrigé dans `d76e437`.
- **Une valeur absente fait échouer la preuve.** Relevé par la même relecture :
  `chromium` absent des 5 résultats passait le test « même valeur partout ».
  Corrigé dans `b06d600`, avec un test rouge d'abord.
- **Vocabulaire.** La relecture « standards » a relevé « run » dans
  `oracle/proof.ts` et ses tests, mot réservé du protocole : remplacé par
  « execution ». `ciRun` et `runId` restent, termes de GitHub repris par la
  spec. Le job `preuve` devient `proof` (identifiants en anglais).
- **Laissé tel quel après la relecture** : les étapes communes des deux jobs
  répétées dans le workflow, et la constante `SCENARIOS = 38` reprise de la
  spec.

## Difficultés rencontrées

- **Le premier job `oracle` de la CI échoue après 38 scénarios réussis.**
  - Symptôme : exécution
    [45041363621](https://github.com/karAmmi12/migrabench/actions/runs/45041363621),
    commit `ac0e3e8` : `38 passed (36.7s)`, puis
    `Error: The oracle result would contain a path above the repository root`
    levée par la collecte.
  - Cause : quand il détecte GitHub Actions, Playwright ajoute de lui-même aux
    métadonnées `gitCommit` et `gitDiff`, le diff de la PR contre sa base
    (option `captureGitInfo`, active par défaut en CI). Le `report.json` de
    l'artefact montrait dans `gitDiff` des imports `../../oracle/proof.ts`, que
    la collecte refuse à raison. En local, sans événement de PR, rien n'est
    ajouté.
  - Résolution : échec reproduit en local en donnant à `npm run oracle`
    `GITHUB_ACTIONS=true` et un `GITHUB_EVENT_PATH` de PR factice, puis
    `captureGitInfo: { commit: false, diff: false }` dans
    `oracle/playwright.config.ts` (`7e4dc7c`). Relancé dans les mêmes
    conditions : `Scenarios: 38, passed: 38, failed: 0, unreached: 0`.
    Playwright garde la métadonnée `ci` (liens de la PR et de l'exécution),
    conservée volontairement.
- **`npm test` refusé au premier lancement.**
  - Symptôme : `npm test requires Node 22.23.5 (.nvmrc), found v24.12.0.`
  - Cause : le shell de la session n'avait pas le Node de `.nvmrc`.
  - Résolution : `nvm use` avant `npm test`.
- **Cinq tests du seam A rouges après un essai local de l'oracle.**
  - Symptôme : `tests/seam-a/archive-reference.test.ts` échoue avec
    « The stack does not run with the archive salt of npm test: rerun
    `npm run stack:up` … ».
  - Cause : l'essai de `npm run oracle` (simulant la CI) avait recréé la pile
    avec son propre sel ; c'est le comportement attendu, expliqué depuis #46.
  - Résolution : `npm run stack:up`, puis `npm test` : 190 tests réussis.

## Vérifier soi-même

Sorties observées au commit `d76e437`, sous Node 22.23.5.

```sh
npx vitest run tests/oracle/ci-run.test.ts tests/oracle/proof.test.ts
```

```
 Test Files  2 passed (2)
      Tests  17 passed (17)
```

```sh
npm run stack:up && npm test
```

```
 Test Files  29 passed (29)
      Tests  190 passed (190)
```

Une exécution complète comme en CI, rang 2 (observée au commit `c8d4755`,
avant les corrections de relecture ; le fichier produit a été supprimé
ensuite) :

```sh
GITHUB_ACTIONS=true GITHUB_RUN_ID=123 GITHUB_RUN_ATTEMPT=1 ORACLE_CI_RANK=2 npm run oracle
```

```
  38 passed (4.2s)

Result: results/oracle/20261122T155629Z-c8d4755-ci123.1-2.json
Scenarios: 38, passed: 38, failed: 0, unreached: 0
```

Le résultat porte `ciRun: { runId: '123', attempt: 1, rank: 2 }`.

La vérification de preuve refuse un résultat local isolé :

```sh
npm run oracle:proof -- results/oracle/20261122T144456Z-f89e6d0.json
```

```
expected 5 executions, got 1
rank ?: no ciRun
```

(code de sortie 1)

La preuve en CI : exécution
[45041781224](https://github.com/karAmmi12/migrabench/actions/runs/45041781224),
head SHA `a664b7b`, job
[`proof`](https://github.com/karAmmi12/migrabench/actions/runs/45041781224/job/137268233860).
Chacun des 5 rangs affiche `Scenarios: 38, passed: 38, failed: 0, unreached: 0`,
puis l'étape « Vérification de la preuve » affiche `Proof holds on 5 results.`

Les 5 résultats, récupérés de l'artefact `oracle-proof` et versionnés par
`cc27981` :

```sh
npm run oracle:proof -- results/oracle/*-ci45041781224.1-*.json
```

```
Proof holds on 5 results.
```

Relevé sur ces 5 fichiers : commit `a664b7b`, `worktree: clean`,
`saltImposed: false`, Node `v22.23.5`, Chromium `159.0.8154.6`,
`@playwright/test` `1.65.1`, horloge `2025-11-15`, images `legacy`
`sha256:73e4a751bdfb…` et `archive` `sha256:239a944d837a…` identiques,
5 sels différents, 38 réussis sur 38 et 0 non atteint, sans `gitDiff`.

## Pour aller plus loin

- La règle 6 de `PROTOCOL.md` (le legacy déclaré comme candidat obtient
  100 %) se vérifie à l'étape 3, avec le runner qui réutilisera
  `executeOracle`.
- ADR 0005 : seuls les JSON sont versionnés ; traces et HAR ne vivent que 7
  jours dans les artefacts de la CI.
- Limite connue : `SCENARIOS = 38` est recopié de la spec ; ajouter un
  scénario demande de le changer dans `oracle/proof.ts`.
