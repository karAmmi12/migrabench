# #68 · Étape 3 · Pannes de la pile et erreurs du runner

## Objectif

Une mesure peut échouer pour des raisons qui ne viennent pas du candidat. Le
legacy peut ne pas devenir sain, tomber pendant l'oracle, Playwright peut ne
pas charger sa configuration, ou le runner lui-même peut lever une erreur
imprévue. Jusqu'ici, ces cas faisaient planter la commande (code `1`, aucune
mesure écrite), ou étaient comptés à tort contre le candidat, comme un code
`125` de Docker classé `build-failed`. Ce ticket range chacun dans la bonne
catégorie. La mesure est invalide seulement quand le candidat n'a pas pu
provoquer le cas ; sinon le cas est compté contre lui (règle 7).

## Notions à connaître

- **`docker compose up --wait`** : attend que les services soient en marche
  et sains, et sort en erreur si l'un devient malade. C'est le moment où le
  runner relève `stack-failed-before-candidate`. —
  [Docker, docker compose up](https://docs.docker.com/reference/cli/docker/compose/up/)
- **Healthcheck** : une commande que Docker lance à intervalle régulier dans
  le conteneur. Après `retries` échecs, le conteneur est `unhealthy`. Les
  derniers résultats sont gardés dans `State.Health.Log`. —
  [Dockerfile reference, HEALTHCHECK](https://docs.docker.com/reference/dockerfile/#healthcheck)
- **`docker inspect`** : rend l'état complet d'un conteneur en JSON
  (`State.Status`, `State.Running`, `State.ExitCode`, `State.StartedAt`,
  `State.Health`, `RestartCount`). Un conteneur créé mais jamais démarré a
  `StartedAt` à `0001-01-01T00:00:00Z` : constaté dans la session sur un
  `docker create` jamais lancé. —
  [Docker, docker inspect](https://docs.docker.com/reference/cli/docker/inspect/)
- **Code de sortie `125` de `docker run`** : c'est Docker lui-même qui
  échoue (image absente, démon injoignable, option refusée). La commande du
  conteneur n'a pas tourné, mais une commande peut aussi rendre `125`
  elle-même. —
  [Docker, Running containers, Exit status](https://docs.docker.com/engine/containers/run/)
- **`COMPOSE_FILE`** : variable qui donne la liste des fichiers de
  composition quand `--file` est absent. Elle sert ici à ajouter une
  composition qui casse le healthcheck du legacy, sans modifier le legacy. —
  [Docker, Compose pre-defined environment variables](https://docs.docker.com/compose/how-tos/environment-variables/envvars/)
- **`outputDir` de Playwright** : le dossier des sorties des tests. La page
  de référence le dit dans ses détails : « This directory is cleaned at the
  start. » Un fichier écrit dedans avant le lancement disparaît donc ; c'est
  ce qu'on a constaté pendant la session. Version de Playwright du dépôt :
  `@playwright/test` 1.65.1. —
  [Playwright, TestConfig.outputDir](https://playwright.dev/docs/api/class-testconfig#test-config-output-dir)

Liens ouverts le 24/11/2026 (`curl`) : chaque page répond `200`. La page de
`docker compose up` cite `--wait`, celle de `docker run` cite `125`, celle
des variables de Compose cite `COMPOSE_FILE`, la référence du Dockerfile
cite `retries`, et la section `outputDir` de Playwright cite « This
directory is cleaned at the start. »

## Ce qui a été construit

- **`oracle/stack-state.ts`** : l'état du legacy et du service d'archivage.
  - `serviceState` et `describeStack` traduisent `docker inspect` en une
    ligne lisible par service ; c'est la preuve d'une pile malade.
  - `isHealthy` vérifie que chaque service tourne et est sain.
  - `stackDown` compare deux relevés et nomme le service tombé : absent,
    remplacé, arrêté, redémarré ou malade.
  - `stackStates` fait le relevé, et `saveServiceLogs` écrit les sorties des
    services dans les bruts (`stack/<service>.log`).
- **`oracle/execute.ts`** :
  - `recreateStack` lève `StackFailed` quand `docker compose up --wait`
    échoue avec un service malade, avec l'état des services pour message ;
  - `launch` lève `OracleError` quand Playwright sort sans rapport. Ses
    sorties sont copiées dans `<dossier>-playwright.log`, à côté du dossier
    de sortie (`shared/process.ts` affiche et écrit à la fois).
- **`runner/measure.ts`** :
  - les phases 1 à 6 tournent dans une fonction interne. Une erreur levée
    après la création du dossier de la mesure est rangée dans la phase en
    cours : `runner-error-before-candidate` avant le lancement du conteneur
    de `npm ci`, `stack-down-while-candidate` ensuite. La clôture tourne
    toujours ;
  - l'état de la pile est relevé quand elle est saine, candidat arrêté, puis
    à la fin de l'oracle : un service tombé donne `stack-down-while-candidate`,
    et `oracle.json` est gardé.
- **`runner/build.ts`, `runner/build-outcome.ts`** : chaque conteneur de la
  construction a un état relevé par `docker inspect` : `started`,
  `never-started` ou `inspectFailed`. Les deux derniers sont des erreurs du
  banc, avec la vraie raison dans la preuve.
- **`runner/candidate-runtime.ts`, `runner/contract-phase.ts`** : les défauts
  des fichiers du candidat deviennent des manquements du contrat
  (`contract-invalid`). Ce sont un lien symbolique, un fichier illisible, ou
  un `candidate.json` illisible ou qui est un dossier.
- **`runner/verdict.ts`** : `runner-error-before-candidate` est permis en
  construction et en clôture ; le type `RunnerErrorOutcome` est nommé.
- **`tests/fixtures/broken-stack/legacy-never-healthy.compose.yml`** :
  composition du candidat défectueux 7, qui remplace le healthcheck du
  legacy par `false`.
- **Tests** :
  - `tests/oracle/stack-state.test.ts` ;
  - `tests/runner/candidate-files.test.ts` ;
  - `tests/runner/runner-errors.test.ts`, des mesures sous un faux `docker`,
    dans le projet Vitest `runner-errors` ;
  - des ajouts dans `build-outcome.test.ts`, `verdict.test.ts` et
    `contract-phase.test.ts`. `bench-lock-tools.test.ts` attend désormais
    le code `3`.
- **Spec** (`docs/specs/03-candidate-runner.md`) : la table des phases, les
  règles `runner-error-before-candidate`, `stack-failed-before-candidate`,
  `stack-down-while-candidate` et `oracle-error`, la nouvelle règle
  « Défauts des fichiers du candidat », et le candidat défectueux 7.

## Les choix faits et pourquoi

- **Code `125` pendant la construction** (commentaire de #65), validé par
  l'humain. Le runner regarde l'état du conteneur, pas le code seul, car la
  commande `build` du candidat peut rendre `125` elle-même.
  - conteneur jamais démarré ou état inconnu pendant `fetch` :
    `runner-error-before-candidate` ;
  - même cas pendant `install` et `build` : `stack-down-while-candidate`.
- **`docker inspect` en échec** (demande de l'humain). Il n'est plus
  confondu avec « jamais démarré » : la preuve dit « container state
  unknown: docker inspect failed », avec sa sortie. La mesure reste invalide
  pour `fetch`, puisque c'est le runner qui échoue.
- **Échec de la liste des scénarios** (commentaire de #63), validé par
  l'humain. L'erreur est rangée en clôture et `oracle.summary` est absent.
  Option écartée : un compte inventé de scénarios, interdit par « les
  chiffres viennent de mesures ».
- **La panne de la pile passe devant `oracle-error`** dans la même exécution
  (relevé par la revue, validé par l'humain). Un candidat qui fait tomber la
  pile pourrait sinon obtenir une mesure invalide, donc une seconde chance
  (règle 7). Le premier choix était l'inverse : une erreur de l'oracle
  d'abord, « le banc était en défaut ».
- **Défauts des fichiers du candidat : contract-failure.** Le premier choix,
  refusé par l'humain, gardait un plantage (code `1`) pour un lien
  symbolique ou un fichier illisible. Raison du refus : un plantage n'écrit
  aucune mesure, et le candidat échapperait à la mesure. Le même
  raisonnement s'applique à l'ancien classement de `contractPhase`, qui
  rangeait un `candidate.json` illisible en `runner-error-before-candidate`,
  donc en mesure invalide que le candidat pouvait fabriquer. Règle écrite
  dans la spec : « un défaut des fichiers fournis par le candidat est une
  contract-failure ; seul ce que le candidat ne peut ni fournir ni fabriquer
  rend la mesure invalide (règle 7) ».
- **Lancement de `npm ci` au conteneur de `fetch`**, et non à l'ouverture de
  la phase de construction (relevé par la revue). Une erreur levée avant ce
  conteneur (copie, dossiers) n'a fait tourner aucun code du candidat ; elle
  reste invalide, comme le dit la spec : « avant le lancement de `npm ci` ».
- **`StackFailed` seulement avec un service malade relevé.** Si
  `docker compose up` échoue alors que tout est sain, ou si le relevé échoue
  aussi, l'erreur reste imprévue : sans preuve, pas d'invalidité.
- **Candidat défectueux 7 par `COMPOSE_FILE`**, plutôt qu'un faux `docker`
  ou une modification du legacy. La vraie pile échoue vraiment, et la
  preuve est son état réel.
- **Tests des défauts du candidat au seam du contrat**, pas par une mesure
  complète. Un candidat de test doit vivre sous `candidates/` ou
  `fixtures/`, dans le dépôt. Là, un fichier illisible ferait échouer le
  calcul de l'empreinte du contexte de construction de la pile (#102), et
  la spec range déjà ces variantes dans « les tests Vitest du contrat ».

## Difficultés rencontrées

- **Le journal de Playwright disparaissait.**
  - Symptôme : pendant la preuve du legacy arrêté, la boucle d'attente ne
    trouvait jamais `oracle/playwright.log`, et la mesure finissait
    `completed`.
  - Cause : Playwright vide son dossier de sortie au démarrage.
  - Résolution : le journal est écrit à côté, dans
    `oracle-playwright.log` (commit `31f5155`).
- **L'oracle était plus rapide que la boucle d'attente.**
  - Symptôme : au premier essai, l'oracle a fini en 4,4 s, avant que la
    boucle n'arrête le legacy. La boucle l'a arrêté après la fin de la
    mesure, sans effet sur elle.
  - Résolution : surveiller la sortie de la mesure elle-même (première
    ligne `✓`), toutes les 0,1 s.
- **Deux mesures dans la même seconde.**
  - Symptôme : dans `runner-errors.test.ts`, `EEXIST` sur le dossier de la
    mesure.
  - Cause : l'identifiant est horodaté à la seconde, et un dossier de mesure
    n'est jamais réécrit.
  - Résolution : le test attend la seconde suivante avant chaque mesure.
- **Chaque modification du dépôt change l'empreinte des images.**
  - Cause : le contexte de construction est toute la racine, documentation
    comprise (#102).
  - Conséquence : un `npm run stack:up` après chaque commit, avant de
    mesurer, et aussi après avoir cassé la configuration de Playwright pour
    la preuve, puis après l'avoir restaurée.
- **Le test du verrou du banc attendait le code `1`.**
  - Cause : une mesure dont Docker échoue à la préparation est maintenant
    rangée (`runner-error-before-candidate`, code `3`), et l'erreur n'est
    plus sur stderr.
  - Résolution : le test vérifie le code `3` et l'issue imprimée.
- **Relecture (deux relecteurs, standards et spec).** Corrigés au commit
  `241e36c` :
  - lancement de `npm ci` trop tôt ;
  - priorité de `oracle-error` ;
  - sorties des services qui pouvaient faire perdre l'issue invalide
    (`allowFailure`) ;
  - erreur d'origine perdue dans `recreateStack`.

  Restent ouverts : pas de test automatique sur la vraie pile, et quelques
  remarques de style.

## Vérifier soi-même

Tests et types, au commit `60f4608` :

```sh
npm run stack:up && npm run typecheck && npm test
# Test Files  78 passed (78)
# Tests  675 passed | 1 skipped (676)
```

Toutes les mesures ci-dessous sont des mesures de diagnostic du candidat de
référence, faites au commit `60f4608` après `npm run stack:up`. Le verrou du
banc était libre.

Candidat défectueux 7, legacy jamais sain. Mesure
`20261124T212232Z-60f4608-reference-candidate` (arbre propre) :

```sh
COMPOSE_FILE=docker-compose.yml:tests/fixtures/broken-stack/legacy-never-healthy.compose.yml \
  npm run migrabench -- measure --candidate fixtures/reference-candidate
# Outcome: invalid (stack-failed-before-candidate)   (code de sortie 3)
```

Preuve (`verdict.evidence`, abrégée) : `docker compose up --detach
--force-recreate --no-build --wait legacy archive exited with code 1` /
`legacy: container ac5ed91d289e running, exit code 0, health unhealthy, …;
last health check: exit 1:` / `archive: … health healthy …`. Bruts de la
phase `start` : `stack/legacy.log`, `stack/archive.log`.

Legacy arrêté pendant l'oracle. Mesure
`20261124T212240Z-60f4608-reference-candidate` (arbre propre) :

```sh
npm run migrabench -- measure --candidate fixtures/reference-candidate &
# dès la première ligne ✓ de l'oracle :
docker stop -t 0 migrabench-legacy-1
# Outcome: stack-down-while-candidate (stack-down-while-candidate)   (code de sortie 0)
```

Phases : `oracle:stack-down-while-candidate`, puis
`closing:access-log-inactive`, qui ne change pas la catégorie. Détail :
`legacy is down: not running. legacy: container df9e964c9b7b exited, exit
code 137, …`. `oracle.json` est gardé : 38 scénarios, 2 réussis, 2 échoués,
34 non atteints. Brut : `stack/legacy.log`.

Configuration de Playwright cassée. Mesure
`20261124T212533Z-60f4608-reference-candidate` (arbre `dirty` : le diff
ci-dessous). Diff exact appliqué, puis retiré par
`git checkout oracle/playwright.config.ts` :

```diff
diff --git a/oracle/playwright.config.ts b/oracle/playwright.config.ts
index e190c34..71016a2 100644
--- a/oracle/playwright.config.ts
+++ b/oracle/playwright.config.ts
@@ -25,3 +25,4 @@ export default defineConfig({
   },
   projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
 });
+throw new Error("oracle config broken on purpose (#68 proof)");
```

```sh
npm run stack:up   # l'empreinte du contexte a changé
npm run migrabench -- measure --candidate fixtures/reference-candidate
# Outcome: invalid (oracle-error)   (code de sortie 3)
git checkout oracle/playwright.config.ts && npm run stack:up
```

Preuve (abrégée) : `Playwright exited with code 1 without writing its
report:` / `Error: oracle config broken on purpose (#68 proof)`. Brut :
`oracle-playwright.log`. `oracle` vaut `{"executed": false}`.

Erreurs du runner avant et après `npm ci`, sous un faux `docker` :

```sh
npx vitest run --project runner-errors
# Test Files  1 passed (1)
# Tests  4 passed (4)
```

Les quatre cas, au commit `60f4608` :

- préparation : `runner-error-before-candidate`, code 3 ;
- `fetch` dont l'état est inconnu : `runner-error-before-candidate`, code 3 ;
- `install` dont l'état est inconnu : `stack-down-while-candidate`, code 0 ;
- erreur à la recréation de la pile : `stack-down-while-candidate`, code 0.

Sur la CI de la PR #106 (head 524606f), tous les jobs sont passés :

- « Tests du banc » : `Test Files 78 passed (78)`, `Tests 675 passed | 1 skipped (676)`, de 21:28:16Z à 21:32:16Z, https://github.com/karAmmi12/migrabench/actions/runs/45491414388 ;
- « Fiche de formation » : « Fiche trouvée pour #68. » et « Chaque case cochée chiffrée cite un état. », https://github.com/karAmmi12/migrabench/actions/runs/45491414417 ;
- « Étalonnage » : `Calibration: results/calibration/20261124T212950Z-524606f-ci45491414350.1-1.json`, de 21:28:16Z à 21:32:36Z, https://github.com/karAmmi12/migrabench/actions/runs/45491414350 ;
- « Oracle » : « Proof holds on 5 results. », de 21:28:16Z à 21:36:00Z, https://github.com/karAmmi12/migrabench/actions/runs/45491414214.

## Pour aller plus loin

- #74 : le job de CI qui mesure les candidats défectueux sur la vraie pile.
  Il automatisera les preuves faites ici en session, dont le candidat
  défectueux 7.
- L'interruption (`SIGINT`, `SIGTERM`) a son propre ticket de l'étape 3 ; la
  clôture qui tourne toujours, posée ici, lui sert de base.
- Note pour l'étape 5 : le score devra gérer un `oracle.summary` absent,
  quand Playwright n'a pu ni exécuter ni lister les scénarios. La mesure
  n'a alors aucun compte de scénarios, et aucun ne doit être inventé.
- ADR 0007, exécution du candidat : pourquoi la construction est découpée
  en `fetch`, `install` et `build`, et pourquoi seul `fetch` peut rendre une
  mesure invalide.
