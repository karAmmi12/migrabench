# #115 · Convertir les fixtures écrites à la main en copies de vrais fichiers produits

## Objectif

Deux contrôles faux sont passés parce que leurs fixtures avaient été écrites de
mémoire : `saltImposed` cherché à la racine d'`oracle.json` au lieu de
`config.metadata` (#73, #110), et `originMain` cherché sous `environment` au
lieu de la racine de `measure.json` (exécution 45624689673, corrigé par #114).
Le ticket #114 a ajouté à `CLAUDE.md` la règle : une fixture qui imite un fichier produit
par le banc est copiée d'un vrai fichier produit, avec sa provenance. Ce ticket
convertit les quatorze fixtures écrites avant cette règle, avant que les
artefacts de CI qui les contiennent n'expirent (2026-12-01 et 2026-12-02).

## Notions à connaître

- **Artefact d'une exécution GitHub Actions.** Les fichiers qu'un job publie
  restent téléchargeables un temps limité, puis expirent ; `gh run download
  <exécution> -n <nom>` les récupère. Ici, les bruts des mesures et de
  l'étalonnage n'existaient que dans deux artefacts.
  Documentation : <https://cli.github.com/manual/gh_run_download> et
  <https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/storing-and-sharing-data-from-a-workflow>.
- **Rapport JSON de Playwright.** Le reporter `json` écrit `config`, `suites`
  (avec leurs `specs`, `tests` et `results`), `errors` et `stats`, avec les
  chemins absolus de la machine. C'est l'entrée de `collect()`
  (`oracle/collect.ts`), qui en tire l'`oracle.json` versionné.
  Documentation : <https://playwright.dev/docs/test-reporters#json-reporter>.
- **Préfixe des journaux de Docker Compose.** Les journaux d'un service sont
  préfixés par le nom du conteneur (`candidate-1  | `). C'est ce préfixe que
  l'ancienne fixture de `start.log` n'avait pas.
  Documentation : <https://docs.docker.com/reference/cli/docker/compose/logs/>.
- **Journal d'accès de Tomcat.** La valve `AccessLogValve` écrit une ligne par
  requête, au format fixé par le legacy (`fixtures/legacy-app/access-log.xml`) ;
  le banc y repère ses requêtes témoins.
  Documentation (Tomcat 9) : <https://tomcat.apache.org/tomcat-9.0-doc/config/valve.html#Access_Log_Valve>.
- **Fichiers `cpu.stat` et `memory.peak` du cgroup v2.** Le premier donne le
  temps CPU consommé (`usage_usec`, en microsecondes), le second le pic de
  mémoire en octets. L'étalonnage les lit pour chaque étape.
  Documentation du noyau : <https://docs.kernel.org/admin-guide/cgroup-v2.html>.
- **Défaut volontaire (idée du test par mutation).** On modifie exprès le code
  de production pour vérifier qu'un test échoue, puis on remet le code. Un test
  qui reste vert sur un défaut ne protège pas contre lui. Source de référence
  (encyclopédie) : <https://en.wikipedia.org/wiki/Mutation_testing>.
- **`structuredClone`.** Copie profonde d'une valeur JavaScript : chaque
  variante modifie un clone, jamais la copie partagée.
  Documentation : <https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone>.

> À vérifier : les liens de cette section n'ont pas été ouverts pendant la session.

## Ce qui a été construit

- **`tests/fixtures/ci45624689673/`** : copies de l'artefact `measures` de
  l'exécution 45624689673 (job des mesures, `main`, commit `52303ae`) :
  `start.log`, `access.log`, rapports bruts `oracle/report.json`, `measure.json`
  et `oracle.json` de la mesure comptée, de la mesure interrompue, de la sonde
  d'isolation, du relais qui altère un libellé et du contrat invalide (sa liste
  `oracle-list/list.json`). Taille : 1,0 Mo.
- **`tests/fixtures/ci45509307133/`** : copies de l'artefact `calibration`
  (commit `aeb3037`) : le résultat d'étalonnage, identique à celui de
  `results/calibration/`, et les `cpu.stat` et `memory.peak` du relevé 1.
  Taille : 44 Ko.
- **`tests/fixtures/ci45041781224/`** : les cinq résultats de la preuve de
  l'oracle, copiés de `results/oracle/` (versionnés par #50). Taille : 564 Ko.
- **`PROVENANCE.md`** dans chacun de ces trois dossiers : exécution, commit,
  commande de téléchargement, chemin de chaque fichier dans l'artefact.
- **`tests/real-fixtures.ts`** : le seul point d'entrée des copies. Il donne
  les chemins (`MEASURES`, `CALIBRATION`, `PROOF_RESULTS`, `fixturePath`,
  `absoluteFixturePath`, `ciOracleDir`), les lecteurs (`readFixture`,
  `readJsonFixture`, `readMeasure`, typé comme le `measure.json` que le banc
  écrit) et `variant(copie, modification)`.
- **Quatorze tests convertis**, chacun partant d'une copie :
  `tests/start-report.test.ts`, `tests/runner/versioned-measures.test.ts`,
  `tests/oracle/measure-check.test.ts`, `tests/oracle/result-check.test.ts`,
  `tests/oracle/proof.test.ts`, `tests/oracle/collect.test.ts`,
  `tests/oracle/closing-lines.test.ts`, `tests/runner/access-log.test.ts`,
  `tests/runner/witness.test.ts`, `tests/runner/interrupted-measure.test.ts`,
  `tests/runner/calibration-check.test.ts`, `tests/runner/calibration.test.ts`
  et `tests/runner/resource-usage.test.ts`. `tests/measure-cases.test.ts` (#114)
  passe aussi par `tests/real-fixtures.ts`.
- **Supprimés** : `tests/fixtures/counted-measures/` (7 fichiers) et
  `tests/oracle/fixtures/results/` (13 fichiers), écrits à la main.
- **`scripts/start-report.ts`** : le préfixe de la ligne de constat est exporté
  sous le nom `START_REPORT_PREFIX`, au lieu d'être recopié par le test.

## Les choix faits et pourquoi

- **Une arborescence par exécution de CI, aux chemins de l'artefact**, plutôt
  qu'un dossier par test. La provenance se lit dans le chemin, et une même
  copie sert plusieurs tests. Exception : `.oracle-artifacts/` devient
  `oracle-artifacts/`, car `.gitignore` ignore ce nom à toute profondeur.
- **Variantes construites dans le test** (en mémoire, ou dans un dossier
  temporaire pour `versioned-measures`) plutôt que des fichiers de variantes
  versionnés. Le test montre exactement ce qu'il change, et rien d'autre ne
  s'écarte de la copie.
- **`collect.test.ts` part du rapport brut `oracle/report.json`**, et non de
  l'`oracle.json` que demandait l'issue. Le rapport brut est la vraie entrée de
  `collect()`, et `oracle.json` en est la sortie. Une sonde jetable a montré que
  `collect()` reproduit, octet pour octet, l'`oracle.json` de la référence, du
  relais et de la sonde à partir de leur rapport brut ; c'est devenu le test
  d'ancrage. Cela a demandé de copier des fichiers absents du tableau de
  l'issue (rapports bruts, `oracle.json` et `measure.json` du relais et de la
  sonde, liste du contrat invalide).
- **La copie de #114 reste dans `tests/fixtures/measure-cases/`** au lieu d'être
  déplacée sous `ci45624689673/`. Moins de changements, et la fiche de #74 qui
  la cite reste juste. Sa provenance est citée depuis
  `ci45624689673/PROVENANCE.md`, chemin dans l'artefact compris.
- **Les résultats de S2 et S3 sont copiés sous `tests/fixtures/`** alors qu'ils
  sont déjà dans `results/`. Le critère d'acceptation demande des copies
  versionnées sous `tests/fixtures/` ; `cmp` confirme qu'elles sont identiques.
- **`measure-check` : le cas « ancêtre de origin/main » devient une variante.**
  Dans la vraie mesure, `benchCommit` est `originMain` lui-même. Le cas
  « ancêtre » prend un `originMain` postérieur réel, `889e111`, dont `52303ae`
  est un ancêtre (vérifié avec `git merge-base --is-ancestor`).
- **`closing-lines` garde la source de l'issue (S1-ref)**, et non le relais.
  Le défaut essayé pour le rouge est donc l'inversion de `passed` et `failed` :
  un `passed` calculé comme `scenarios - failed` passe inaperçu sur 38/38/0/0.
- **`interrupted-measure` copie le rapport partiel tel quel**, sans réécrire
  ses chemins vers la machine locale. Les réécrire aurait demandé de remplacer
  aussi l'identifiant de mesure ; la limite qui en résulte est notée plus bas.
- **Preuve rouge par défaut volontaire dans le code de production**, remis en
  place avec `git checkout` après chaque essai. Seul le refactoring final de
  centralisation n'a pas de rouge : il ne change pas de comportement, la suite
  complète est restée verte.
- **Centralisation dans `tests/real-fixtures.ts`** (lecture du `measure.json`,
  `variant`, chemins), à la demande de la relecture humaine : à l'étape 4,
  chaque porte écrira ses fixtures depuis de vraies mesures, et ces lectures se
  seraient multipliées.

## Difficultés rencontrées

- **Les artefacts allaient expirer.** Symptôme : l'issue annonçait leur fin
  (2026-12-01 et 2026-12-02). Résolution : téléchargement immédiat, au début de
  la session, avant toute conversion.
- **`.oracle-artifacts/` ignoré par Git.** Symptôme : la copie miroir de
  l'artefact n'aurait pas été versionnée. Cause : le motif `.oracle-artifacts/`
  de `.gitignore` vaut à toute profondeur. Résolution : dossier renommé
  `oracle-artifacts/` dans les copies, noté dans chaque `PROVENANCE.md`.
- **Le vrai `start.log` a un préfixe que la fixture n'avait pas.** Symptôme :
  chaque ligne commence par `candidate-1  | `. Le parseur le tolérait déjà,
  mais un parseur qui suppose l'horodatage en tête passait l'ancien test
  (17 réussis) et échoue sur le vrai journal (13 échoués).
- **Défaut sans effet sur la vraie donnée (`closing-lines`).** Symptôme :
  `passed` calculé comme `scenarios - failed` restait vert. Cause : la mesure
  de référence a 0 non atteint. Résolution : autre défaut (inversion), noté
  dans « Défauts essayés ».
- **Défauts sans effet sur `interrupted-measure`.** Symptôme : retirer le
  garde-fou du signal, puis aussi faire lire le rapport malgré le signal, laisse
  le test vert. Cause : le rapport n'est lu par aucun code de production, et
  ses chemins de CI font échouer le hachage, erreur ignorée après
  l'interruption. Résolution : défaut sur ce que le test regarde (liste de la
  clôture écrite dans le dossier de l'oracle), et limite notée.
- **Variante d'arrondi au-delà du plafond CPU (`calibration`).** Symptôme : le
  test « rounds limits up » échoue. Cause : la vraie machine d'étalonnage a
  2 CPU, et 1,234 × 2 dépasse ce plafond. Résolution : 0,934 CPU (1,868 → 1,87).
- **Typage du rapport de Playwright (`collect`).** Symptôme : `error TS2339:
  Property 'stack' does not exist on type 'JSONReportError'`. Cause : la pile
  d'appels est dans `result.error`, pas dans `result.errors[]`. Résolution :
  assertion sur `result.error.stack`.
- **Variante macOS de `collect` sans empreintes.** Symptôme : `no digest for
  /Users/someone/migrabench/.oracle-artifacts/…`. Cause : les empreintes
  restaient indexées par les chemins du runner de CI. Résolution :
  `collectFrom(root, …)` déplace aussi les clés des empreintes.
- **`tests/seam-a/stack-images.test.ts` rouge après les changements.**
  Symptôme : 4 échecs, « Stack images not built from this copy of the
  repository ». Cause : le contexte de construction de la pile est toute la
  racine du dépôt (`.dockerignore`), donc toute modification change son
  empreinte. Résolution : `npm run stack:up`, le remède documenté, deux fois
  (après la conversion, puis après le refactoring).
- **Relectures.** La relecture « spec » a relevé que la provenance de la copie
  de #114 ne citait pas son chemin dans l'artefact (corrigé dans `8090f98`). La
  relecture humaine a demandé que les assertions sur `/Users/` et
  `/var/folders/` redeviennent explicites (garde-fou du bug des chemins machine
  de l'étape 2) : elles tournent sur les deux racines (`dcdd361`), vues rouges
  sur un défaut.

## Vérifier soi-même

Sur `f4ec9c2`, arbre propre, pile reconstruite par `npm run stack:up` :

```sh
npm test
```

Observé : `Test Files  82 passed (82)`, `Tests  735 passed (735)`.

Les copies de S2 et S3 sont identiques aux fichiers versionnés :

```sh
for f in tests/fixtures/ci45041781224/results/oracle/*.json; do cmp "$f" "results/oracle/$(basename "$f")" && echo "identique $(basename "$f")"; done
cmp tests/fixtures/ci45509307133/results/calibration/*.json results/calibration/20261124T232316Z-aeb3037-ci45509307133.1-1.json && echo identique-etalonnage
```

Observé : cinq lignes `identique 20261122T16…-a664b7b-ci45041781224.1-<rang>.json`,
puis `identique-etalonnage`.

Voir rouge le défaut que l'ancienne fixture de `start.log` laissait passer :

```sh
sed -i '' 's/\.map((line) => line\.slice(line\.indexOf(START_REPORT_PREFIX) + START_REPORT_PREFIX\.length));/.map((line) => line.split(" ").slice(4).join(" "));/' scripts/start-report.ts
npx vitest run --project default tests/start-report.test.ts
git checkout scripts/start-report.ts
npx vitest run --project default tests/start-report.test.ts
```

Observé : `Tests  13 failed | 5 passed (18)`, puis `Tests  18 passed (18)`.
(`sed -i ''` est la syntaxe de macOS ; sous Linux, `sed -i`.)

La mesure interrompue pendant l'oracle, avec le vrai rapport partiel :

```sh
npx vitest run --project interrupted tests/runner/interrupted-measure.test.ts -t "during the oracle"
```

Observé : `Tests  3 passed | 5 skipped (8)`.

> À vérifier après l'exécution de la CI de la PR : le lien de l'exécution, son head SHA et le résultat des jobs de test.

### Preuves : chaque test converti vu rouge, puis vert

État de chaque preuve : les tests tels qu'au commit cité (lancés juste avant
ce commit, sur son contenu exact), plus un seul fichier de production modifié
à la main pour y placer le défaut, puis remis en place avec `git checkout`.
Commande : `npx vitest run --project <projet> <fichier de test>`.

| Test | Commit | Défaut volontaire | Avec le défaut | Défaut retiré |
|---|---|---|---|---|
| `tests/start-report.test.ts` | `a162b4d` | `eachReport` découpe la ligne par `line.split(" ").slice(4)` : il suppose qu'aucun préfixe de compose (`candidate-1  \| `) ne précède l'horodatage | 13 échoués, 5 réussis. **L'ancien test, écrit à la main, passait : 17 réussis** | 18 réussis |
| `tests/runner/versioned-measures.test.ts` (tests sur fixtures) | `fe57f4a` | `checkResult` lit les métadonnées à la racine d'`oracle.json` (l'erreur de #73) | 3 échoués, 1 réussi | 7 réussis |
| `tests/oracle/measure-check.test.ts` | `7b1b44c` | `checkMeasureResult` lit `environment.originMain` (l'erreur corrigée par #114) | 13 échoués, 2 réussis | 15 réussis |
| `tests/oracle/closing-lines.test.ts` | `7b1b44c` | `passed` et `failed` inversés dans la ligne de résumé | 1 échoué, 2 réussis | 3 réussis |
| `tests/oracle/result-check.test.ts` | `f632430` | `/var/folders/` retiré de `MACHINE_PREFIXES` | 2 échoués, 11 réussis | 13 réussis |
| `tests/oracle/proof.test.ts` | `8f2c856` | les sels ne sont refusés que s'ils sont tous identiques (`size < 2`) | 1 échoué, 13 réussis | 14 réussis |
| `tests/oracle/collect.test.ts` | `5362b1a` | 1) `mb:reach` lu dans les seules annotations du test | 1 échoué, 22 réussis | 23 réussis |
| `tests/oracle/collect.test.ts` | `5362b1a` | 2) un chemin hors du dépôt gardé tel quel au lieu de son seul nom de fichier | 5 échoués, 18 réussis | 23 réussis |
| `tests/oracle/collect.test.ts` | `dcdd361` | 3) garde-fou des chemins machine (`/home/`, `/Users/`, `/var/folders/`), rendu explicite sur les deux racines : la racine n'est plus retirée des textes, et le refus des chemins machine de `collect()` est désactivé | 8 échoués, 16 réussis, dont les deux variantes de « makes every other absolute path relative » | 24 réussis |
| `tests/runner/access-log.test.ts` | `337758b` | requête témoin reconnue à l'inclusion de son chemin, pas au chemin exact de la requête | 1 échoué, 12 réussis | 13 réussis |
| `tests/runner/witness.test.ts` | `337758b` | l'expression du chemin de requête n'accepte que `HTTP/1.0` | 1 échoué, 4 réussis | 5 réussis |
| `tests/runner/interrupted-measure.test.ts` (`-t "during the oracle"`, 3 tests) | `88ca8cf` | la liste des scénarios de la clôture écrite dans le dossier de l'oracle interrompu | 1 échoué, 2 réussis | 3 réussis |
| `tests/runner/calibration-check.test.ts` | `31435dd` | l'étalonnage contrôlé avec la règle du sel | 6 échoués | 6 réussis |
| `tests/runner/calibration.test.ts` | `31435dd` | pic de mémoire du build pris à la dernière étape, pas à la plus gourmande | 1 échoué, 8 réussis. **L'ancien test passait : 9 réussis** (son étape la plus gourmande était aussi la dernière) | 9 réussis |
| `tests/runner/resource-usage.test.ts` | `fa740b2` | temps CPU lu dans `user_usec` au lieu de `usage_usec` | 2 échoués, 1 réussi | 3 réussis |

Défauts essayés qui ne rendent pas le test rouge :

- `closing-lines` : `passed` calculé comme `scenarios - failed`. Le vrai résumé
  de la mesure comptée (38 réussis, 0 échoué, 0 non atteint) ne distingue pas
  ces champs.
- `interrupted-measure` : `launch` qui lit le rapport malgré le signal, et le
  garde-fou du signal retiré. Voir « Limites connues ».

## Pour aller plus loin

- **Étape 4 : les portes.** Chaque porte aura un test négatif sur une fixture.
  Elle partira de vraies mesures par `tests/real-fixtures.ts` (`readMeasure`,
  `variant`, `fixturePath`) ; une nouvelle exécution copiée prend son propre
  dossier `tests/fixtures/ci<exécution>/` avec son `PROVENANCE.md`.
- **Hors du ticket, à relire.** Les faux `docker` de `runner-errors`,
  `stack-not-from-this-copy` et `interrupted-measure` imitent des sorties
  d'outils au format choisi par le runner (`--format`). L'issue les laisse
  hors de la règle à la lettre.
- **Les deux limites ci-dessous** pourraient être levées en copiant aussi les
  HAR et traces d'une mesure (pour des empreintes calculées), ou en réécrivant
  le rapport partiel vers la racine et l'identifiant de la mesure locale.

### Limites connues

- **`interrupted-measure` : chemins du runner de CI dans le rapport partiel.**
  Le faux Playwright copie le vrai `report.json` partiel de la mesure
  interrompue de l'exécution 45624689673. Ses pièces jointes citent des chemins
  absolus du runner (`/home/runner/work/migrabench/migrabench/.oracle-artifacts/20261125T133512Z-…`),
  absents de la machine qui lance le test. Un runner défectueux qui lirait ce
  rapport après le signal échouerait au hachage des pièces jointes, et cette
  erreur, levée après l'interruption, est ignorée : le test reste vert. L'ancien
  rapport fabriqué (`suites: []`) aurait été collecté, et le test serait passé
  au rouge.
- **`collect.test.ts` : comparaison circulaire des empreintes HAR et trace.**
  Les HAR et les traces ne sont pas copiés. Les empreintes passées à
  `collect()` sont tirées des annotations `mb:har` et `mb:trace` de
  l'`oracle.json` auquel le résultat est ensuite comparé. Sur ces deux
  annotations, la comparaison ne prouve donc que l'ordre et l'emplacement des
  annotations, pas les empreintes. C'est acceptable parce que `collect()`
  reçoit les empreintes sans les calculer (`oracle/execute.ts` les calcule).
