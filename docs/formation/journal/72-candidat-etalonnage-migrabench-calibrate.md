# #72 · Étape 3 · Candidat d'étalonnage et migrabench calibrate

## Objectif

Depuis #65, une mesure applique un plafond de sécurité : 10 min de
construction, 60 s jusqu'à la disponibilité, 4 GiB et 2 CPU. Ces valeurs
sont choisies à l'œil et marquées `provisional`. Ce ticket les fait sortir
d'une mesure. Un candidat d'étalonnage, écrit par le banc, est construit et
démarré plusieurs fois comme le serait un candidat. Chaque délai ou limite
vaut le maximum relevé multiplié par un multiple déclaré, et une mesure cite
dans `environment.limits` l'empreinte du résultat d'étalonnage dont ses
limites sortent.

## Notions à connaître

- **cgroup v2, `memory.peak` et `cpu.stat`** : un conteneur Docker est un
  cgroup. Ses fichiers donnent le pic de mémoire enregistré depuis sa
  création (`memory.peak`) et son temps CPU cumulé (`usage_usec` de
  `cpu.stat`), tous processus compris. —
  [Linux Kernel Docs : Control Group v2](https://docs.kernel.org/admin-guide/cgroup-v2.html).
  Les deux fichiers sont observés dans un conteneur de l'image d'exécution
  (voir « Vérifier soi-même »).
- **`docker run --cpus`** : fixe la part des CPU disponibles qu'un conteneur
  peut utiliser. Par exemple, `--cpus="1.5"` donne au plus un CPU et demi. —
  [Docker Docs : Resource constraints](https://docs.docker.com/engine/containers/resource_constraints/)
- **`vite build`** : construit le bundle de production d'une application
  front. Le candidat d'étalonnage règle le dossier de sortie par
  `build.outDir`. —
  [Vite : Building for Production](https://vite.dev/guide/build)
- **`workflow_dispatch` et filtre `paths`** :
  - `workflow_dispatch` ne lance un workflow que si son fichier est sur la
    branche par défaut ;
  - avec un filtre `paths` sous `pull_request`, le workflow ne tourne que si
    un fichier modifié correspond. Si ce workflow porte une vérification
    obligatoire, elle reste « Pending ».

  [GitHub Docs : Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) ;
  [GitHub Docs : Workflow syntax, paths](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)

## Ce qui a été construit

- `fixtures/calibration-candidate/` : le **candidat d'étalonnage** (ADR
  0003).
  - Un front React + TypeScript, construit par Vite, et une couche serveur
    Node compilée par `tsc`. Elle authentifie en `BASIC` à partir de
    `USERS_FILE`, relaie `/api/` vers l'API interne et sert le front.
  - `build` : `npm run build` ; `start` : `node dist/server/index.js`.
  - Il n'a pas à réussir l'oracle : il sert à mesurer le coût d'une
    construction et d'un démarrage réalistes.
- `runner/resource-usage.ts`, `cgroupUsage` : lit le pic de mémoire et le
  temps CPU. Un compteur absent (cgroup v1, noyau trop ancien) est une
  erreur au message clair, jamais une valeur par défaut.
- `runner/calibration.ts`, fonctions pures :
  - `readingValues` : les valeurs d'un relevé ;
  - `calibrationSummary` : minimum, maximum et limites arrondies vers le
    haut ;
  - `chooseCalibration` : le plus récent des étalonnages faits en CI ;
  - les paramètres déclarés `DECLARED_MULTIPLES` (délais × 5, ressources × 2)
    et `CALIBRATION_READINGS` (5), avec leur justification.
- `runner/calibration-results.ts`, `appliedCalibration` : lit les fichiers de
  `results/calibration/` suivis par Git et rend le résultat appliqué,
  empreinte comprise.
- `runner/limits.ts`, `measureLimits` : applique l'étalonnage et le cite
  (fichier, empreinte, multiples, `provisional: false`). Sans lui, applique
  le plafond de sécurité, `provisional: true`. Le plafond imposé
  `--timeout-cap-ms` continue de s'appliquer dans les deux cas.
- `runner/calibrate.ts` et `runner/cli.ts` : `migrabench calibrate
  [--readings n]`.
  - Il valide d'abord le candidat d'étalonnage avec le même contrat qu'une
    mesure (`runner/contract-phase.ts`, venu de #64).
  - Il construit le candidat avec le relevé des ressources de chaque étape,
    recrée la pile, démarre le candidat et relève ses ressources quand il
    devient disponible.
  - Le résultat va dans `results/calibration/` en CI, et dans
    `results/diagnostic/calibration/`, ignoré par Git, ailleurs.
- `runner/candidate-runtime.ts` : ce que `measure` et `calibrate` partagent,
  extrait de `runner/measure.ts` :
  - la copie du candidat ;
  - l'image d'exécution ;
  - la composition du service `candidate`, son démarrage, son attente et son
    arrêt.
- `runner/build.ts` : option `collectUsage`. La commande de chaque étape
  passe par un petit shell qui copie les compteurs du cgroup à la fin et
  rend le code de sortie inchangé.
- `oracle/execute.ts` : `recreateStack` et `stackImages`, exportés pour
  l'étalonnage.
- `.github/workflows/calibration.yml` : le job `calibration`, précédé d'un
  job `changes`.
- `scripts/ci-scope.ts` : `calibration` rejoint les jobs lourds, avec ses
  propres chemins, comme `proof` (table `JOB_PATHS`). Tests dans
  `tests/ci-scope.test.ts` et `tests/write-ci-scope.test.ts`.
- `results/calibration/20261123T215140Z-344b70c-ci45273672040.1-1.json` : le
  premier résultat d'étalonnage de CI, versionné seul dans le commit
  `b44b257`.
- `docs/specs/03-candidate-runner.md` : la limite du relevé de CPU.
- Tests :
  - `tests/runner/resource-usage.test.ts` ;
  - `tests/runner/calibration.test.ts` ;
  - `tests/runner/limits.test.ts` (réécrit pour l'étalonnage).

## Les choix faits et pourquoi

- **Multiples : délais × 5, mémoire et CPU × 2, 5 relevés.** C'est la
  décision de l'humain.
  - Sur les runners GitHub, la durée d'un même job a varié de 2,3 fois sans
    changement de code (job `oracle`, 119 s puis 273 s, fiche de #76).
  - Un délai dépassé est un échec du candidat, jamais une mesure invalide.
    Un faux échec coûte donc bien plus qu'une attente plus longue.
  - La mémoire et le CPU dépendent du code construit, pas de la machine.
  - Le résultat garde le minimum et le maximum des relevés, pour vérifier
    que la marge couvre leur dispersion.
  - Options écartées : tout × 2 avec 3 relevés, ou tout × 5.
- **Seul un étalonnage fait en CI et versionné est appliqué.** C'est une
  précision de l'humain.
  - Un étalonnage local sert à la mise au point : il ne va pas dans
    `results/calibration/` et n'est jamais choisi, même plus récent. Un test
    le vérifie.
  - Après la relecture, la lecture se limite aux fichiers suivis par Git
    (`git ls-files`). Un artefact téléchargé mais pas encore versionné n'est
    donc pas appliqué.
- **Relevé par le cgroup v2 du conteneur**, plutôt qu'un échantillonnage par
  `docker stats`.
  - `memory.peak` donne le vrai pic, tous processus compris.
  - Pour la construction, les compteurs sont copiés à la fin de l'étape par
    le conteneur lui-même, car le cgroup disparaît avec lui. Pour le
    démarrage, ils sont lus par `docker exec` au moment de la disponibilité.
- **Limite du relevé de CPU : une moyenne, pas un pic.**
  - L'usage relevé est le temps CPU du conteneur divisé par la durée de
    l'étape. La limite `--cpus` qui en sort (maximum × 2) peut donc freiner
    une construction qui demande par moments plus que sa moyenne.
  - Ce ralentissement allonge la construction sans la faire échouer. Il est
    absorbé par la marge sur les délais (× 5), bien plus large que celle sur
    le CPU (× 2).
  - Le pic de mémoire, lui, est un vrai pic. La limite est écrite dans la
    spec (« Candidat d'étalonnage »), à la demande de l'humain.
- **Mémoire et CPU de la construction : l'étape la plus gourmande.** Les
  limites s'appliquent à chacun des trois conteneurs (`fetch`, `install`,
  `build`). Le délai, lui, couvre la phase entière.
- **Pas de test Vitest avec Docker.** C'est la décision de l'humain. La
  preuve réelle est l'exécution de `calibrate` puis de `measure`, et le job
  de CI.
- **Pas d'oracle pendant l'étalonnage.** La spec dit que le candidat
  d'étalonnage « n'a pas à réussir l'oracle ». La pile est quand même
  recréée avant chaque démarrage, comme pendant une mesure.
- **Le vocabulaire « relevé » (`reading`), pas « run ».** La relecture a
  relevé que « run » est un mot du vocabulaire de `PROTOCOL.md`, avec un
  autre sens. `--runs` est devenu `--readings`.
- **Déclenchement du job par la règle de `scripts/ci-scope.ts`.** C'est la
  demande de l'humain, après la première CI de la PR.
  - Option retenue : un job `changes`, comme pour les autres jobs lourds.
    `calibration` ne tourne que sur une PR qui touche ses propres chemins :
    le candidat d'étalonnage, l'image d'exécution, la construction, le
    contrat, le relevé des ressources et le workflow. Il ne tourne pas si
    seul `docs/**` a changé depuis son dernier succès sur la PR.
    `workflow_dispatch` le lance toujours.
  - Options écartées :
    - le filtre `paths` sous `on:`, qui laissait le job tourner à chaque
      push (voir « Difficultés ») ;
    - tout `runner/**`, qui aurait lancé 5 constructions sur chaque PR du
      runner (#76).
  - `results/calibration/` n'est pas dans ses chemins : versionner un
    résultat ne doit pas en produire un autre.
- **Le candidat d'étalonnage passe par le contrat.** Une fois `main`
  fusionnée, la mesure valide le contrat (#64). L'étalonnage le valide
  aussi, au lieu de lire `candidate.json` sans contrôle.
- **Ce qui a été laissé** :
  - le refus de `--counted` sans étalonnage revient à #73 ;
  - `lock` reste absent de l'environnement, car le verrou du banc n'existe
    pas encore ;
  - le CPU du démarrage est un peu surestimé, puisque son temps CPU part de
    la création du conteneur. Cette valeur n'est pas appliquée.

## Difficultés rencontrées

- **Le front du candidat ne compilait pas.** Le premier `npm run build`
  sur l'hôte rendait `TS5097: An import path can only end with a '.tsx'
  extension when 'allowImportingTsExtensions' is enabled`.
  - Cause : l'import `./App.tsx` dans `src/main.tsx`.
  - Résolution : `./App`, résolu par Vite en mode `bundler`.
- **`gh workflow run calibration.yml` a échoué.** Le message était `HTTP 404:
  workflow calibration.yml not found on the default branch`.
  - Cause : le workflow n'existe pas encore sur `main`.
  - Résolution : la PR #87 a été ouverte en brouillon. L'événement
    `pull_request` a lancé le job.
- **Un push pendant l'étalonnage l'aurait annulé.** Le groupe de
  concurrence annule l'exécution en cours de la PR. La note de spec a donc
  été committée en local, et poussée seulement une fois le job fini.
- **La pile Docker locale était occupée par une autre session.** Toute
  commande qui la touche a été suspendue jusqu'à ce que l'humain la déclare
  libre. La mesure du candidat de référence a été faite après.
- **Une source citée de mémoire était fausse.** La variation 119 s / 273 s
  était attribuée à la fiche de #63. Elle est en fait dans
  `docs/formation/journal/76-ci-reduire-consommation-minutes.md`, et c'est
  cette fiche que cite le code.
- **Le job `calibration` tournait à chaque push de la PR.**
  - Symptôme : il a tourné sur `b44b257` (45274528723) et sur `f17a309`
    (45276758945). Aucun de ces commits ne touchait un chemin du filtre
    `paths`.
  - Cause : pour `pull_request`, GitHub applique le filtre à tout le diff de
    la PR. Or la PR touche ces chemins.
  - Résolution : le filtre est retiré, et le job passe par la règle de
    `scripts/ci-scope.ts`. Les tests ont été écrits rouges d'abord.
- **398 tests en local, 402 en CI, au même commit `b44b257`.**
  - Cause : le job `tests` ne teste pas la tête de la PR. Son checkout n'a
    pas de `ref:` : il prend `refs/pull/87/merge`, le commit de fusion de la
    PR avec `main`. Le journal de l'exécution 45274528965 montre
    `e2f2be8… -> pull/87/merge`.
  - Entre-temps, `main` avait reçu #84, #85 et #86. La comparaison des
    rapports JUnit (CI : artefact `traces-tests`, local : même commit)
    montre quatre tests présents en CI seulement, tous venus de #84 :
    - `tests/ci-scope.test.ts` : « runs a job on a pull request with an
      empty diff… », et les deux cas « skips oracle / tests on a pull
      request touching only docs/**, even without reference » ;
    - `tests/github-history.test.ts` : « lists only the pull request's
      files when main moved on… ».
  - Résolution : `main` a été fusionnée dans la branche (`3a518bc`), par une
    fusion et non un rebase, pour que les commits cités restent joignables.
    Sur ce commit fusionné, local et CI testent le même code.
- **Conflit de fusion dans `runner/measure.ts`.** #64 y avait ajouté la
  phase de contrat, pendant que ce ticket en extrayait l'exécution du
  candidat vers `runner/candidate-runtime.ts`.
  - Résolution : la structure de #64 (construction et démarrage seulement
    après un contrat valide), avec les fonctions extraites.
  - Il a aussi fallu `npm ci` : `ajv`, ajouté par #64, manquait pour le
    typecheck.
- **Un commit intermédiaire ne compile pas seul.** Dans `6f6deeb`,
  `runner/measure.ts` appelle encore l'ancienne signature de
  `measureLimits`. Il est adapté dans `e2751ab`. La PR se fusionne en squash.

## Vérifier soi-même

Environnement local : Node 22.23.5 et Docker Engine 29.1.3 (Docker Desktop,
noyau 6.12.54-linuxkit), sous macOS.

Compteurs du cgroup v2 dans un conteneur de l'image d'exécution (empreinte
`sha256:a6d76625baf3…`), sous Docker Desktop, noyau 6.12.54-linuxkit :

```sh
docker run --rm migrabench-runtime sh -c 'cat /sys/fs/cgroup/cpu.stat; echo ---; cat /sys/fs/cgroup/memory.peak'
# usage_usec 12084
# user_usec 4028
# system_usec 8056
# nice_usec 0
# nr_periods 0
# nr_throttled 0
# throttled_usec 0
# nr_bursts 0
# burst_usec 0
# ---
# 4984832
```

Tests purs de l'étalonnage, au commit `b44b257` :

```sh
npx vitest run tests/runner/calibration.test.ts tests/runner/limits.test.ts tests/runner/resource-usage.test.ts
# Tests  17 passed (17)
```

Suite complète, pile démarrée par `npm run stack:up`, au commit `82cf7b7`
(branche fusionnée avec `main`, règle de la CI comprise), arbre propre :

```sh
npm run typecheck   # aucune erreur
npm test
# Test Files  56 passed (56)
#      Tests  462 passed (462)
```

Avant la fusion, au commit `b44b257` : 54 fichiers et 398 tests.

Refus, sans Docker, au commit `b44b257`. Le plafond imposé ne peut plus
dépasser le délai étalonné le plus long :

```sh
node runner/cli.ts measure --candidate fixtures/reference-candidate --timeout-cap-ms 50551; echo "exit=$?"
# refused-usage: --timeout-cap-ms only lowers the timeouts: at most 50550
# exit=4
node runner/cli.ts calibrate --readings 0; echo "exit=$?"
# refused-usage: --readings must be a positive whole number
# exit=4
```

Étalonnage en CI : [exécution 45273672040](https://github.com/karAmmi12/migrabench/actions/runs/45273672040),
job `calibration`, commit `344b70c`, arbre propre. Runner ubuntu 24.04
(image `20261116.376.1`), 2 CPU AMD EPYC 9V74, 8 Go, cgroup v2. Résultat
versionné :
`results/calibration/20261123T215140Z-344b70c-ci45273672040.1-1.json`,
empreinte `sha256:0a411d5fe323e88f13cc6bc9de3e80145693f7300da9794daa07ba73b0f55d0b`.

| Sur 5 relevés | min | max | limite (max × multiple) |
|---|---|---|---|
| Construction | 8 714 ms | 10 110 ms | 50 550 ms |
| Jusqu'à la disponibilité | 676 ms | 719 ms | 3 595 ms |
| Pic de mémoire, construction | 329 773 056 o | 331 354 112 o | 663 748 608 o |
| CPU moyen, construction | 0,71 | 0,97 | 1,95 |

Mesure du candidat de référence qui applique cet étalonnage, au commit
`82cf7b7`, arbre propre. Le dossier de la mesure est un diagnostic, ignoré
par Git : seules les mesures prévues pour compter seront versionnées (#73).

```sh
npm run stack:up
npm run migrabench -- measure --candidate fixtures/reference-candidate
# Measure: results/diagnostic/20261123T222304Z-82cf7b7-reference-candidate
# Outcome: completed (ok)
# measure.json : 7 phases ok (preparation, contract, build, start, oracle,
# gates, closing), 38 scénarios, 38 réussis, 0 non atteint ; environment.limits :
# {"provisional":false,"source":"calibration",
#  "calibration":{"file":"results/calibration/20261123T215140Z-344b70c-ci45273672040.1-1.json",
#   "digest":"sha256:0a411d5fe323e88f13cc6bc9de3e80145693f7300da9794daa07ba73b0f55d0b"},
#  "multiples":{"timeouts":5,"resources":2},
#  "buildTimeoutMs":50550,"readyTimeoutMs":3595,"buildMemoryBytes":663748608,"buildCpus":1.95}
shasum -a 256 results/calibration/20261123T215140Z-344b70c-ci45273672040.1-1.json
# 0a411d5fe323e88f13cc6bc9de3e80145693f7300da9794daa07ba73b0f55d0b
```

La même mesure, avant la fusion de `main`, au commit `b44b257` :

```sh
npm run stack:up
npm run migrabench -- measure --candidate fixtures/reference-candidate
# Measure: results/diagnostic/20261123T220608Z-b44b257-reference-candidate
# Outcome: completed (ok)
# measure.json : 38 scénarios, 38 réussis, même environment.limits
```

Avant que l'étalonnage soit versionné, la même mesure au commit `c6daa19`
gardait `{"provisional":true,"source":"safety-cap",…}`, alors qu'un
étalonnage local plus récent existait dans `results/diagnostic/calibration/`.

CI de la PR #87 :

- **Jobs lourds, sur `b44b257`**, le dernier commit qui touche autre chose
  que `docs/**` :
  - « Tests du banc » : [exécution 45274528965](https://github.com/karAmmi12/migrabench/actions/runs/45274528965),
    job `tests` en 143 s, `Test Files 54 passed (54)`,
    `Tests 402 passed (402)`. En local, au même commit : 398 tests ;
  - « Oracle » : [exécution 45274528685](https://github.com/karAmmi12/migrabench/actions/runs/45274528685).
    Le job `oracle` (116 s) rend `Scenarios: 38, passed: 38, failed: 0,
    unreached: 0`. Le job `proof` (301 s) rend cinq fois la même ligne,
    puis `Proof holds on 5 results.` ;
  - « Vérification des types » : [exécution 45274528867](https://github.com/karAmmi12/migrabench/actions/runs/45274528867),
    `success`.
- **Sur `f17a309`**, qui n'ajoute que cette fiche : `tests`, `oracle` et
  `proof` sont ignorés, avec la raison `seul docs/** a changé depuis
  b44b2579dd3b78acd66d2a9332d1eb9bed85d8bd, où tests a réussi`. Ont réussi
  sur ce commit :
  - « Vérification des types » : [45276758697](https://github.com/karAmmi12/migrabench/actions/runs/45276758697) ;
  - « Fiche de formation » : [45276758524](https://github.com/karAmmi12/migrabench/actions/runs/45276758524) ;
  - « Actions épinglées » : [45276758502](https://github.com/karAmmi12/migrabench/actions/runs/45276758502).
- **Le job `calibration` a tourné à chaque push de la PR.** Ce sont les
  exécutions [45274528723](https://github.com/karAmmi12/migrabench/actions/runs/45274528723)
  sur `b44b257` et [45276758945](https://github.com/karAmmi12/migrabench/actions/runs/45276758945)
  sur `f17a309`, alors que ces commits ne touchent aucun chemin du filtre.
  Leurs résultats ne sont pas versionnés. C'est corrigé par `82cf7b7`.

> À vérifier après l'exécution de la CI de la PR : sur le push qui porte
> `82cf7b7`, le job `changes` du workflow « Étalonnage » doit lancer
> `calibration` (raison relevée), puisque ses propres fichiers changent ; et
> « Tests du banc » doit tourner sur le code fusionné avec `main` (lien, head
> SHA, nombre de tests). Puis, sur le commit suivant, qui ne touche que
> `docs/**` : `calibration` doit être ignoré (lien et raison relevée).

## Pour aller plus loin

- **#73, mesure prévue pour compter** : `--counted` doit être refusé tant
  qu'aucun étalonnage de CI n'est versionné. `appliedCalibration` rend déjà
  `undefined` dans ce cas.
- **Délais serrés** : 3,6 s jusqu'à la disponibilité et 50,5 s de
  construction sortent d'un candidat d'étalonnage léger. Un candidat d'agent
  avec plus de dépendances les approchera. L'étape 6 réétalonne avant sa
  première mesure comptée.
- **Relevé du pic de CPU** : un échantillonnage de `cpu.stat` pendant
  l'étape donnerait un pic, au lieu de la moyenne actuelle.
- **ADR 0007**, exécution du candidat : les limites étalonnées ne
  s'appliquent qu'aux conteneurs de la construction, pas encore au service
  `candidate` démarré.
