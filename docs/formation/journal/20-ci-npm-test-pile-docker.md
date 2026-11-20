# #20 · CI : exécuter npm test avec la pile Docker

## Objectif

Avant ce ticket, la CI lançait le typecheck (#23), mais pas `npm test` : les
tests du banc, dont ceux du seam A qui appellent le legacy et le service
d'archivage par HTTP, ne tournaient qu'en local. Ce ticket ajoute un
workflow qui construit la pile Docker, attend ses healthchecks, lance
`npm test` sous le Node de `.nvmrc`, puis publie les traces en artefact,
gardées 7 jours.

## Notions à connaître

- **`docker compose up --wait`** : démarre les services en arrière-plan et
  attend qu'ils soient `running` ou `healthy` ; la commande échoue si un
  healthcheck ne passe pas. Le legacy et le service d'archivage déclarent
  chacun un healthcheck dans `docker-compose.yml`. —
  [Docker Docs : docker compose up](https://docs.docker.com/reference/cli/docker/compose/up/)
- **Reporter JUnit de Vitest** : Vitest sait écrire un rapport XML au format
  JUnit, sans dépendance ajoutée (`--reporter=junit`, fichier choisi par
  `--outputFile.junit=…`). Garder `--reporter=default` conserve la sortie
  habituelle dans le journal. —
  [Vitest : Reporters](https://vitest.dev/guide/reporters)
- **`actions/upload-artifact`** : publie des fichiers du runner comme
  artefact de l'exécution de la CI, téléchargeable depuis GitHub.
  `retention-days` fixe sa durée de conservation ; `if-no-files-found: error`
  fait échouer l'étape si le chemin est vide. —
  [actions/upload-artifact (README)](https://github.com/actions/upload-artifact)
- **`if: always()`** : une étape marquée ainsi tourne même si une étape
  précédente a échoué. C'est ce qui permet de publier les traces d'une
  exécution rouge. —
  [GitHub Docs : Expressions (fonctions de statut)](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)
- **`timeout-minutes`** : durée maximale d'un job, 360 minutes par défaut. —
  [GitHub Docs : Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)

## Ce qui a été construit

- `.github/workflows/tests.yml` : le workflow « Tests du banc ». Sur chaque
  PR (`opened`, `reopened`, `synchronize`), sur `ubuntu-24.04`, un job borné
  à 30 minutes :
  1. `actions/checkout` (v7.0.1) et `actions/setup-node` (v7.1.0, avec
     `node-version-file: .nvmrc` et le cache npm), puis `npm ci` ;
  2. « Construction et démarrage de la pile » :
     `docker compose up -d --build --wait` ;
  3. « Tests » : `npm test -- --reporter=default --reporter=junit
     --outputFile.junit=test-results/junit.xml` ; le `pretest` vérifie la
     version de Node ;
  4. « Journaux de la pile », toujours exécutée : `docker compose ps --all`
     et `docker compose logs` écrits dans `test-results/` ;
  5. « Publication des traces », toujours exécutée :
     `actions/upload-artifact` (v7.0.2) publie `test-results/` sous le nom
     `traces-tests`, avec `retention-days: 7`.
- `README.md` : un paragraphe sous « Tests du banc » décrit le workflow et
  renvoie au fichier pour le nom de l'artefact et sa durée de conservation.

## Les choix faits et pourquoi

- **Les traces : rapport JUnit et journaux de la pile.** L'issue demande de
  « publier les traces », mais l'oracle Playwright n'existe pas encore. Les
  traces disponibles aujourd'hui sont la sortie de Vitest et celle des
  conteneurs. Le rapport JUnit dit quel test a échoué ; les journaux disent
  si le legacy ou le service d'archivage a mal démarré. Option écartée :
  ne publier que la sortie console, déjà visible dans le journal de
  l'exécution de la CI. Les traces Playwright s'ajouteront à l'étape 2.
- **Reporter JUnit intégré à Vitest**, sans dépendance ajoutée (règle de
  `CLAUDE.md`). Les options passent après `--` : `pretest` ne les reçoit
  pas, seul `vitest run` les lit.
- **`if: always()` sur les journaux et la publication**, pour que les traces
  existent surtout quand les tests échouent. L'étape des journaux crée
  `test-results/` (`mkdir -p`) : avec `if-no-files-found: error`, un
  artefact vide signalerait une étape cassée, pas une absence silencieuse.
- **`actions/upload-artifact` v7.0.2, épinglé sur
  `cf430e030ddbb5b0abf93d22962f4752f3646cd9`.** C'était la dernière version
  publiée (`gh api repos/actions/upload-artifact/releases/latest` a rendu
  `v7.0.2`) ; son étiquette est légère (`…/git/ref/tags/v7.0.2` a rendu
  `commit cf430e03…`). Son `action.yml` déclare `using: 'node24'`.
  Procédure : `docs/agents/pinned-actions.md`.
- **Pas de typecheck dans ce job** : décision de triage de l'issue, il est
  lancé par le workflow séparé de #23, sans Docker.
- **`timeout-minutes: 30`**, ajouté après la relecture « spec » : `--wait`
  est borné par les `retries` des healthchecks, mais un blocage ailleurs
  (build, tests) aurait tenu jusqu'au défaut de 360 minutes. La valeur est
  un plafond de configuration, pas une durée mesurée.
- **Le README renvoie au workflow** pour le nom de l'artefact et sa durée de
  conservation, après la relecture « standards » : la première version les
  recopiait, ce qui obligeait à changer deux fichiers ensemble.
- **Duplication gardée avec `typecheck.yml`** (checkout, setup-node,
  `npm ci`), relevée par la relecture « standards ». Une action composite
  locale (`uses: ./…`) serait refusée par `scripts/check-pinned-actions.sh`,
  qui n'accepte que `owner/repo@<SHA>`.
- **Pas de TDD.** Le ticket ne touche ni au runner, ni aux portes, ni au
  score ; un workflow n'a pas de test unitaire. La preuve est l'exécution
  de la CI sur la PR, verte, et une exécution rouge provoquée exprès.
- **Le test négatif prouve deux choses** (décision humaine) : le job échoue
  quand un test échoue, et l'artefact `traces-tests` est quand même publié,
  avec un rapport JUnit qui montre le test en échec.

## Difficultés rencontrées

- **`gh api` refusé par le shell.** Symptôme :
  `(eval):1: no matches found: repos/actions/upload-artifact/contents/action.yml?ref=v7.0.2`.
  Cause : zsh lit le `?` de l'URL comme un motif de fichiers. Résolution :
  mettre le chemin entre guillemets simples.
- **Codes de couleur dans le journal de la CI.** Symptôme : chercher
  `Tests +[0-9]+ passed` dans `gh run view --log` ne trouvait rien, car le
  journal contient `^[[1m^[[32m80 passed…`. Cause : Vitest colore sa
  sortie, et le journal garde les codes ANSI. Résolution : les retirer
  avant la recherche (`sed 's/\^\[\[[0-9;]*m//g'`).

## Vérifier soi-même

État observé : commit `3972a5d`, le 2026-11-20, sous Node `v22.23.5`, pile
déjà lancée.

```sh
bash scripts/check-pinned-actions.sh .github/workflows; echo "exit $?"
```

Observé : aucune sortie, puis `exit 0` (aussi sur `3132ed6`).

```sh
docker compose up -d --build --wait; echo "exit $?"
npm test -- --reporter=default --reporter=junit --outputFile.junit=test-results/junit.xml
```

Observé : `exit 0`, puis `Test Files  11 passed (11)`,
`Tests  80 passed (80)` et
`JUNIT report written to …/test-results/junit.xml`. La première ligne du
rapport : `<testsuites name="vitest tests" tests="80" failures="0" errors="0" …>`.

Sur la PR, le workflow « Tests du banc » doit passer.

Observé sur l'exécution de la CI
[44790602695](https://github.com/karAmmi12/migrabench/actions/runs/44790602695)
(PR #28, commit `d6661cd`) : `node: v22.23.5`, puis
`Container migrabench-archive-1  Healthy` et
`Container migrabench-legacy-1  Healthy`, puis
`Test Files  11 passed (11)` et `Tests  80 passed (80)` ; conclusion
`success`. Durée relevée avec
`gh run view 44790602695 --json startedAt,updatedAt` : `startedAt`
18:12:41Z, `updatedAt` 18:14:04Z, soit 83 s. Artefact `traces-tests` :
5326 octets (`gh api repos/karAmmi12/migrabench/actions/runs/44790602695/artifacts`),
expiration le 2026-11-27, 7 jours après sa création.

Test négatif : un test volontairement en échec doit faire échouer le job,
et l'artefact `traces-tests` doit être publié quand même, avec un rapport
JUnit qui montre l'échec.

Le commit `2b8fdea` ajoute `tests/deliberate-failure.test.ts`, qui attend
`expect(1 + 1).toBe(3)`. Observé sur l'exécution de la CI
[44790888300](https://github.com/karAmmi12/migrabench/actions/runs/44790888300)
(commit `2b8fdea`), conclusion `failure`, en 82 s (`startedAt` 18:14:29Z,
`updatedAt` 18:15:51Z). Les étapes, lues avec
`gh run view 44790888300 --json jobs` :

```
Construction et démarrage de la pile: success
Tests: failure
Journaux de la pile: success
Publication des traces: success
```

Le journal de l'étape « Tests » : `Tests  1 failed | 80 passed (81)`, puis
`##[error]Process completed with exit code 1.`

L'artefact `traces-tests` de cette exécution fait 5551 octets. Téléchargé
avec `gh run download 44790888300 -n traces-tests -D <dossier>`, il
contient `compose-logs.txt`, `compose-ps.txt` et `junit.xml`, dont :

```xml
<testsuites name="vitest tests" tests="81" failures="1" errors="0" …>
    <testsuite name="tests/deliberate-failure.test.ts" … tests="1" failures="1" …>
        <testcase classname="tests/deliberate-failure.test.ts" name="deliberately fails to prove the CI job fails" …>
            <failure message="expected 2 to be 3 // Object.is equality" type="AssertionError">
```

Le commit `0fc6b85` annule `2b8fdea`. Observé sur l'exécution de la CI
[44791193579](https://github.com/karAmmi12/migrabench/actions/runs/44791193579)
(commit `0fc6b85`) : `Tests  80 passed (80)`, conclusion `success`, en
84 s (`startedAt` 18:16:23Z, `updatedAt` 18:17:47Z) ; artefact
`traces-tests` de 5417 octets.

## Pour aller plus loin

- Étape 2, l'oracle Playwright : ses traces (`playwright-report/`, traces
  `.zip`) devront rejoindre l'artefact `traces-tests`.
- `tests/node-version-sync.test.ts` (#23) tourne désormais en CI : une
  montée de Node qui oublie `engines.node` ou le verrou fait échouer la PR.
- Limite connue : les tests du seam A écrivent sur les dossiers réservés et
  remettent leurs valeurs ; la pile est neuve à chaque exécution de la CI,
  mais pas forcément en local.
