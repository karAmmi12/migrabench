# #76 · CI : réduire la consommation de minutes

## Objectif

Chaque commit poussé sur une PR relançait les cinq workflows, dont le job
`proof` : cinq exécutions complètes de l'oracle. Il tournait même quand rien
de ce qu'il prouve n'avait changé. Sur la PR #75, le commit `2f0f034`, qui ne
modifiait que la fiche `docs/formation/journal/62-fil-traceur-mesure-diagnostic.md`,
a relancé tous les jobs (relevé dans l'issue). Ce ticket :

- fait annuler l'exécution en cours sur une PR par un nouveau commit ;
- fait ignorer les jobs lourds (`tests`, `oracle`, `proof`) quand seul
  `docs/**` a changé depuis leur dernier succès ;
- ne lance `proof` sur une PR que si elle touche ce qu'il prouve.

## Notions à connaître

- **Groupe de concurrence** : deux exécutions du même groupe ne tournent pas
  en même temps. Avec `cancel-in-progress`, la nouvelle annule celle en cours.
  — [GitHub Docs : Control the concurrency of workflows and jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) ;
  [Workflow syntax, concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency)
- **Condition de job (`jobs.<id>.if`) et filtre `paths`** : un job dont la
  condition est fausse est ignoré (*skipped*). Un filtre `paths` sous `on:`
  empêche le workflow entier de démarrer. Pour une vérification obligatoire,
  un job ignoré compte comme réussi, alors qu'un workflow qui n'a pas démarré
  reste « en attente ». — [Workflow syntax, jobs.<job_id>.if](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idif) ;
  [paths](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore) ;
  [Troubleshooting required status checks, Handling skipped but required checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks#handling-skipped-but-required-checks)
- **`needs` et fonctions de statut** : un job qui dépend d'un job ignoré est
  ignoré à son tour, sauf si sa condition utilise une fonction de statut comme
  `!cancelled()`. `needs.<id>.result` vaut alors `success`, `failure`,
  `cancelled` ou `skipped`. — [Expressions, Status check functions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#status-check-functions)
- **Sorties d'étape et de job** : une étape écrit `nom=valeur` dans le fichier
  `$GITHUB_OUTPUT`, le job la reprend sous `outputs:`, et les jobs qui en
  dépendent la lisent par `needs.<id>.outputs.<nom>`. —
  [Workflow commands, Setting an output parameter](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#setting-an-output-parameter)
- **Variables par défaut des Actions** : `GITHUB_EVENT_NAME`,
  `GITHUB_EVENT_PATH` (le JSON de l'événement), `GITHUB_HEAD_REF`,
  `GITHUB_WORKFLOW_REF` (chemin du fichier du workflow et ref). —
  [Variables, Default environment variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables#default-environment-variables)
- **API REST des exécutions de workflow** : liste des exécutions d'un
  workflow, filtrable par `event`, `branch` et `status` ; liste des jobs d'une
  exécution, avec leur `name` et leur `conclusion`. —
  [List workflow runs for a workflow](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow) ;
  [List jobs for a workflow run](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run)
- **`git diff --no-renames`** : sans cette option, un fichier déplacé n'est
  listé que sous sa destination. —
  [git-diff, --no-renames](https://git-scm.com/docs/git-diff#Documentation/git-diff.txt---no-renames)
- **`git merge-base --is-ancestor A B`** : code de sortie `0` si A est un
  ancêtre de B, `1` sinon. —
  [git-merge-base, --is-ancestor](https://git-scm.com/docs/git-merge-base#Documentation/git-merge-base.txt---is-ancestor)

Liens ouverts le 2026-11-23 (`curl`) : chaque page répond `200` et chaque
ancre existe (`id="…"`). Un lien a été remplacé : la page « Troubleshooting
required status checks » sous `repositories/…/managing-protected-branches/`
répond `404`. Elle se trouve sous
`pull-requests/…/collaborating-on-repositories-with-code-quality-features/`.

## Ce qui a été construit

- **`scripts/ci-scope.ts`** : la règle. `shouldRun(job, context, history)`
  décide si un job lourd tourne :
  - hors `pull_request` (push sur `main`, `workflow_dispatch`) : toujours ;
  - `proof` sur une PR : seulement si la PR touche `oracle/`,
    `fixtures/legacy-app/`, `docker-compose.yml` ou `results/oracle/` ;
  - sinon, la référence est le dernier commit de la PR, ancêtre de la tête,
    où ce même job a réussi. Une exécution annulée, en échec ou ignorée n'en
    est jamais une. Sans référence, le job tourne. Si seul `docs/**` a changé
    depuis la référence, il est ignoré. Si rien n'a changé (relance sur le
    même commit), il tourne.

  `History` est le port vers l'historique (exécutions terminées, jobs d'une
  exécution, ancêtre de la tête, fichiers changés).
- **`scripts/github-history.ts`** : l'adaptateur de `History`.
  - `gh api` pour les exécutions et les jobs. Le filtre des exécutions
    terminées se fait côté client, car celui de l'API n'est pas fiable ;
  - `git merge-base --is-ancestor` pour l'ascendance ;
  - `changedFiles(range)`, soit `git diff --name-only --no-renames`, pour les
    fichiers changés depuis la référence et depuis la base de la PR.
- **`scripts/write-ci-scope.ts`** : le script du job `changes`. Il lit
  `CI_JOBS` et les variables des Actions, puis écrit `<job>=true|false` dans
  `$GITHUB_OUTPUT` et une ligne de raison par job dans le journal. Hors PR, il
  n'appelle ni `gh` ni `git`.
- **Workflows** :
  - les cinq ont un groupe de concurrence par PR, avec `cancel-in-progress`
    limité aux PR. Hors PR, le groupe porte `github.run_id`, donc rien n'est
    annulé sur `main` ;
  - `tests.yml` et `oracle.yml` ont un job `changes` (permission
    `actions: read`), dont les jobs lourds dépendent ;
  - `oracle.yml` se déclenche aussi sur `push` vers `main` et en
    `workflow_dispatch`. Son checkout vise
    `github.event.pull_request.head.sha || github.sha`. `proof` tourne quand
    `oracle` a réussi ou a été ignoré.
- **Tests** :
  - `tests/ci-scope.test.ts` (21 tests), avec un faux historique en mémoire ;
  - `tests/github-history.test.ts` (7) : les analyseurs sur des réponses réelles
    de l'API, et `changedFiles` sur un vrai dépôt Git temporaire ;
  - `tests/write-ci-scope.test.ts` (3) : le script lancé avec
    `PATH=/nonexistent`, donc sans `gh` ni `git` ;
  - `tests/workflow-concurrency.test.ts` (6) : le bloc de concurrence dans
    chaque workflow ;
  - `tests/workflow-heavy-jobs.test.ts` (3) : `tests`, `oracle` et `proof`
    existent et n'ont pas de `name:` ;
  - `tests/fixtures/github-api/` : les réponses enregistrées depuis la PR #75,
    avec la commande qui les a produites.
- **`README.md`** : quand chaque job tourne.

## Les choix faits et pourquoi

- **Référence = dernier succès du même job, et non le commit poussé ni la PR
  entière.** Deux options avaient été proposées :
  - juger le diff du push (`before..after`) : un commit de code suivi aussitôt
    d'un commit docs fait annuler le premier, puis ignorer le second, et le
    code n'est testé nulle part ;
  - juger toute la PR : sans trou, mais la PR #75 n'aurait rien économisé.

  L'humain a écarté les deux. Comme la référence est un succès du job lui-même,
  ni une annulation ni un échec ne peuvent être masqués.
- **Un script TypeScript du dépôt plutôt que l'action `dorny/paths-filter`.**
  La règle a besoin de l'historique des exécutions, qu'un filtre de chemins ne
  lit pas. Un script se teste en TDD et n'ajoute ni action tierce ni
  dépendance npm. Décision de l'humain.
- **Condition au niveau du job, pas filtre `paths` sous `on:`** : demandé par
  l'issue, pour le cas où `main` aurait plus tard des vérifications
  obligatoires (voir « Notions »).
- **Concurrence : `github.run_id` hors PR.** Avec `github.ref`, deux fusions
  rapprochées sur `main` partageraient un groupe et la seconde remplacerait
  la première en attente. Or les preuves de `main` (étape 2, #74) doivent
  rester complètes.
- **`proof` ne dépend plus du succès d'`oracle` sur le même commit.** Leurs
  derniers succès peuvent porter sur des commits différents. Par exemple,
  `oracle` réussit et `proof` échoue, puis vient un commit docs : `oracle` est
  ignoré, mais `proof` doit tourner. Il tourne donc si `oracle` a réussi ou a
  été ignoré.
- **Seams de test validés par l'humain** :
  1. le module de décision, avec un faux historique ;
  2. le script hors PR ;
  3. la concurrence des workflows ;
  4. l'adaptateur, sur des réponses réelles de l'API (ajouté par l'humain :
     le format de l'API est vérifié sans appel réseau).

  Le test sur dépôt Git temporaire a été accepté après la revue : le bug venait
  du vrai `git`, un faux historique ne l'aurait pas reproduit.
- **E-mails remplacés dans les réponses enregistrées.** Les réponses brutes de
  l'API contiennent l'e-mail de l'auteur des commits (`head_commit`). Il est
  remplacé par `author@example.invalid`, la commande est écrite dans
  `tests/fixtures/github-api/README.md`, et le reste est tel que l'API l'a rendu.
- **`Run` renommé `WorkflowRun`.** Dans `PROTOCOL.md`, un run est « une
  exécution complète d'un outil ». Relevé par la revue de code (standards).

## Difficultés rencontrées

- **Un fichier déplacé sous `docs/` passait pour un changement de docs
  seul.**
  - Symptôme : relevé par la revue de code (spec). Après
    `git mv runner/x.ts docs/x.ts`, `git diff --name-only` ne listait que
    `docs/x.ts`. `tests` et `oracle` auraient été ignorés.
  - Cause : `git diff` détecte les renommages par défaut.
  - Résolution : `--no-renames`, via une seule fonction `changedFiles`.
    Le test sur un vrai dépôt temporaire a d'abord échoué : `runner/x.ts`
    manquait. Il passe depuis `2551bdd`.
- **Un garde-fou qui se désactivait sans bruit.**
  - Symptôme : relevé par la revue de code (spec).
  - Cause : la référence se cherche par le nom que l'API donne au job, soit
    son `name:`, soit son id. Un `name:` ajouté à `proof` aurait fait tourner
    le job à chaque fois, sans erreur.
  - Résolution : `tests/workflow-heavy-jobs.test.ts`. Vérifié en ajoutant
    `name: Preuve` à `proof` : le test a échoué, puis le fichier a été
    restauré (`94fff58`).
- **L'essai à blanc sur la PR #75 ne pouvait pas montrer un job ignoré.**
  - Symptôme : les deux jobs « tournent (rien n'a changé depuis 2f0f034…) ».
  - Cause : `2f0f034` a sa propre exécution réussie.
  - Résolution : le cas « ignoré » est couvert par `tests/ci-scope.test.ts`
    et sera prouvé par les exécutions de CI ci-dessous.

- **Les PR jetables ne déclenchaient plus aucune exécution.**
  - Symptôme : après un push, `actions/runs?head_sha=<sha>` rendait
    `total_count: 0`.
  - Cause : `main` avait avancé (#77, puis #82, fusionnées par une autre
    session) et touchait les fichiers des commits jetables (`runner/cli.ts`,
    puis `shared/digest.ts`). La PR était en conflit (`mergeable_state: dirty`),
    et GitHub ne lance aucun workflow `pull_request` sans commit de fusion.
  - Résolution : les commits jetables visent des fichiers neufs, ou remettent
    le fichier dans son état de la base commune (`6f52d3d`).
- **Deux pushes à 2 s d'écart ne donnaient qu'une série d'exécutions.**
  - Symptôme : `4491d74` n'a eu aucune exécution, `ef307ae` en a eu cinq.
  - Cause : GitHub n'a émis qu'un événement `synchronize`, pour la tête finale.
  - Résolution : un écart plus long. Avec 15 s, les trois workflows courts
    avaient fini avant l'arrivée du second commit. Pousser le second dès la
    première exécution visible n'en a fait annuler que deux sur cinq. Avec un
    écart fixe de 5 s, les cinq sont annulées (`9ec640c`). Sur un commit docs,
    une exécution dure 8 à 20 s, et GitHub met environ 6 s à créer les
    exécutions d'un push.
- **Sur la PR #79, `oracle` a tourné sur un commit docs seul.**
  - Symptôme : sur `6b2edf4`, `tests` a été ignoré mais `oracle` a tourné
    ([« Oracle »](https://github.com/karAmmi12/migrabench/actions/runs/45231005516)) :
    `oracle : tourne (oracle n'a réussi sur aucun commit de la PR ancêtre de la tête)`.
  - Cause : le filtre `status=completed` de l'API des exécutions a rendu
    0 exécution « Oracle » sur la branche, alors que les 2 étaient
    `completed`/`success`, de même que leurs suites de vérifications. Sans ce
    filtre, la même requête les rend. Sur la branche de #81, il en avait
    écarté 1 sur 13. Aucun motif n'a été trouvé.
  - Résolution : la requête ne filtre plus sur `status`, et
    `parseWorkflowRuns` garde les exécutions `completed`. Les deux réponses
    réelles sont versionnées (`tests/fixtures/github-api/oracle-runs-pr79-*.json`).
    Corrigé dans `d9a1eac`. Le défaut allait dans le sens sûr : le job
    tournait sans nécessité, et rien n'était masqué.
- **Une attente de CI bloquée** (script jetable de la session, hors dépôt).
  - Symptôme : l'attente tournait encore 26 minutes après la fin des
    exécutions. Relevé par l'humain.
  - Cause : elle exigeait 5 exécutions par commit cité, et le premier commit
    de la paire n'en a jamais eu. Sa borne était de 120 tours de 20 s, et sa
    sortie était redirigée, donc sans progression visible.
  - Résolution : une attente bornée, qui affiche l'état à chaque tour et rend
    le code `1` à l'échéance.

## Vérifier soi-même

Tests sans la pile, fichier par fichier (état : `d9a1eac`) :

```sh
npx vitest run tests/ci-scope.test.ts            # Tests  21 passed (21)
npx vitest run tests/github-history.test.ts      # Tests  7 passed (7)
npx vitest run tests/write-ci-scope.test.ts      # Tests  3 passed (3)
npx vitest run tests/workflow-concurrency.test.ts  # Tests  6 passed (6)
npx vitest run tests/workflow-heavy-jobs.test.ts   # Tests  3 passed (3)
npx vitest run tests/pinned-actions.test.ts      # Tests  9 passed (9)
npm run typecheck                                # aucune erreur
bash scripts/check-pinned-actions.sh .github/workflows   # aucune sortie, code 0
```

Essai à blanc du job `changes` sur la PR #75, contre la vraie API (état :
`3bbc1f6`) :

```sh
git fetch -q origin pull/75/head
base=$(gh pr view 75 --json baseRefOid -q .baseRefOid)
echo "{\"pull_request\":{\"head\":{\"sha\":\"2f0f0349a027c612f4807a185613e874cbaa1a1e\"},\"base\":{\"sha\":\"$base\"}}}" > /tmp/event.json
: > /tmp/out
GITHUB_EVENT_NAME=pull_request GITHUB_EVENT_PATH=/tmp/event.json \
GITHUB_REPOSITORY=karAmmi12/migrabench GITHUB_HEAD_REF=feat/62-measure-tracer \
GITHUB_WORKFLOW_REF="karAmmi12/migrabench/.github/workflows/oracle.yml@refs/pull/75/merge" \
GITHUB_OUTPUT=/tmp/out CI_JOBS=oracle,proof node scripts/write-ci-scope.ts
# oracle : tourne (rien n'a changé depuis 2f0f0349…, où oracle a réussi : relance)
# proof : tourne (rien n'a changé depuis 2f0f0349…, où proof a réussi : relance)
```

Preuves en CI. Les PR #80 (avant, partie de `main`) et #81 (après, partie
de cette branche) sont des PR jetables, fermées sans fusion. Elles portent les
mêmes commits jetables : un commit de code dans `shared/digest.ts`, puis un
commit docs seul dans `docs/mesure-76.md`.

- **`proof` ignoré sur une PR qui ne touche aucun de ses chemins** : PR #79,
  head `d9473d6`, [exécution « Oracle »](https://github.com/karAmmi12/migrabench/actions/runs/45216443496). Journal du job
  `changes` :
  `proof : ignoré (la PR ne touche aucun de oracle/, fixtures/legacy-app/, docker-compose.yml, results/oracle/)`.
- **`proof` tourne sur une PR qui touche `oracle/`** : PR #81, head `6f52d3d`
  (ajoute `oracle/mesure-76.md`), [exécution « Oracle »](https://github.com/karAmmi12/migrabench/actions/runs/45228437761).
  `proof : tourne (proof n'a réussi sur aucun commit de la PR ancêtre de la tête)`,
  puis `Proof holds on 5 results.`
- **Commit docs seul** : PR #81, head `9afa8b6`. Dans
  [« Tests du banc »](https://github.com/karAmmi12/migrabench/actions/runs/45220169468), `tests` est ignoré. Dans
  [« Oracle »](https://github.com/karAmmi12/migrabench/actions/runs/45220169471), `oracle` et `proof` sont ignorés.
  [« Fiche de formation »](https://github.com/karAmmi12/migrabench/actions/runs/45220169503) tourne (`success`). Journal :
  `tests : ignoré (seul docs/** a changé depuis ecd6c363…, où tests a réussi)`,
  et de même pour `oracle`.
- **Deux commits poussés coup sur coup, à 5 s d'écart** : PR #81. Les cinq
  exécutions de `9ec640c` sont `cancelled` :
  [« Oracle »](https://github.com/karAmmi12/migrabench/actions/runs/45230686491), [« Actions épinglées »](https://github.com/karAmmi12/migrabench/actions/runs/45230686215),
  [« Fiche de formation »](https://github.com/karAmmi12/migrabench/actions/runs/45230685996),
  [« Vérification des types »](https://github.com/karAmmi12/migrabench/actions/runs/45230685948),
  [« Tests du banc »](https://github.com/karAmmi12/migrabench/actions/runs/45230685853). Celles de `2f5e785` sont `success`.
- **Un commit de code annulé par un commit docs** : PR #81. Les exécutions de
  `5604390` sont `cancelled` ([« Oracle »](https://github.com/karAmmi12/migrabench/actions/runs/45221736854),
  [« Tests du banc »](https://github.com/karAmmi12/migrabench/actions/runs/45221736610)). Sur le commit docs `74ac074`, `tests`
  et `oracle` tournent ([« Tests du banc »](https://github.com/karAmmi12/migrabench/actions/runs/45221787893),
  [« Oracle »](https://github.com/karAmmi12/migrabench/actions/runs/45221788177)) :
  `tests : tourne (des fichiers hors docs/** ont changé depuis ecd6c363…, où tests a réussi)`.
- **Minutes, somme des durées des jobs** (`completedAt − startedAt`, jobs
  ignorés à 0, via `gh run view <id> --json jobs`) :

  | PR type | commit de code | commit docs seul | total |
  |---|---|---|---|
  | avant, #80 | `7c3dd44` : 618 s | `9991fa9` : 615 s | 1233 s, soit 20,6 min |
  | après, #81 | `ecd6c36` : 479 s | `9afa8b6` : 51 s | 530 s, soit 8,8 min |

  Exécutions :
  - avant, `7c3dd44` : [Oracle](https://github.com/karAmmi12/migrabench/actions/runs/45218587188), [Tests](https://github.com/karAmmi12/migrabench/actions/runs/45218587754),
    [Types](https://github.com/karAmmi12/migrabench/actions/runs/45218587523), [Fiche](https://github.com/karAmmi12/migrabench/actions/runs/45218587870),
    [Actions](https://github.com/karAmmi12/migrabench/actions/runs/45218587693) ;
  - avant, `9991fa9` : [Oracle](https://github.com/karAmmi12/migrabench/actions/runs/45220167577), [Tests](https://github.com/karAmmi12/migrabench/actions/runs/45220167422),
    [Types](https://github.com/karAmmi12/migrabench/actions/runs/45220167407), [Fiche](https://github.com/karAmmi12/migrabench/actions/runs/45220167429),
    [Actions](https://github.com/karAmmi12/migrabench/actions/runs/45220167448) ;
  - après, `ecd6c36` : [Oracle](https://github.com/karAmmi12/migrabench/actions/runs/45218594901), [Tests](https://github.com/karAmmi12/migrabench/actions/runs/45218595001),
    [Types](https://github.com/karAmmi12/migrabench/actions/runs/45218594905), [Fiche](https://github.com/karAmmi12/migrabench/actions/runs/45218595392),
    [Actions](https://github.com/karAmmi12/migrabench/actions/runs/45218594859) ;
  - après, `9afa8b6` : voir « Commit docs seul » ci-dessus, avec
    [Types](https://github.com/karAmmi12/migrabench/actions/runs/45220169453) et [Actions](https://github.com/karAmmi12/migrabench/actions/runs/45220169467).

  Sur le commit de code, l'écart vient de `proof` (338 s avant, ignoré
  après). Le job `oracle` a duré 119 s avant et 273 s après, sans changement
  de son code. Cette variation entre deux exécutions réduit l'écart mesuré.
  Les jobs `changes` comptent 20 s après sur ce commit, et 25 s sur le commit
  docs.
- **`npm test` complet** dans « Tests du banc » sur la PR #79, head `d9473d6` :
  [job `tests`](https://github.com/karAmmi12/migrabench/actions/runs/45216443911/job/137838951063), 48 fichiers, 325 tests
  réussis.

> À vérifier après la fusion : `proof` tourne sur `push` vers `main` et en `workflow_dispatch` (liens). « To trigger the workflow_dispatch event, your workflow must be in the default branch » ([GitHub Docs : Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), lu le 2026-11-23).

## Pour aller plus loin

- **#74 (étape 3)** : les preuves des mesures comptées restent produites sur
  `main`, où rien n'est ignoré ni annulé.
- **Limite : une page de 100 exécutions.** Au-delà, la référence la plus
  ancienne manque et le job tourne, ce qui reste sûr.
- **Limite : le filtre `branch`.** Une PR venue d'un fork, dont la branche
  porte le même nom qu'une autre, mélange leurs exécutions. Le contrôle
  d'ascendance écarte celles qui ne sont pas des ancêtres de la tête.
- **Vérifications obligatoires sur `main`** : si on en ajoute, les jobs
  ignorés comptent comme réussis (voir « Notions »).
