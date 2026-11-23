# #65 · Étape 3 · Phase de construction : build, délais, limites et registre imposé

## Objectif

Jusqu'ici, le runner ne savait faire qu'un `npm ci` sans délai ni limite, et
refusait un candidat qui déclarait une commande `build`. Ce ticket ajoute la
phase de construction complète : `npm ci` puis `build`, dans des conteneurs
qui ne voient que le registre npm imposé, sous un délai global et des limites
de mémoire et de CPU. L'enjeu est la règle 7 de `PROTOCOL.md`. Une
construction trop longue ou trop gourmande est un échec du candidat. Une
mesure ne devient invalide (`registry-network-error`) que sur une preuve que
le candidat ne peut pas fabriquer.

## Notions à connaître

- **Journal de npm** : chaque commande npm écrit un journal de débogage
  (`<horodatage>-debug-0.log`) dans `logs-dir`. Les lignes sont numérotées et
  portent un niveau. L'erreur finale s'y lit en lignes `<n> error …`, dont
  `<n> error code <CODE>`. —
  [npm Docs : Logging](https://docs.npmjs.com/cli/v10/using-npm/logging)
- **Configuration de npm par variables d'environnement** : toute variable
  `npm_config_<clé>` règle la clé correspondante. Elle prime sur un `.npmrc`
  de projet, mais seulement pour les clés qu'elle nomme. —
  [npm Docs : config, Environment Variables](https://docs.npmjs.com/cli/v10/using-npm/config#environment-variables)
- **`npm ci --ignore-scripts` et `--offline`** : le premier installe sans
  lancer aucun script d'installation. Le second n'installe que depuis le
  cache, sans requête réseau. —
  [npm Docs : npm ci](https://docs.npmjs.com/cli/v10/commands/npm-ci) ;
  [npm Docs : config, offline](https://docs.npmjs.com/cli/v10/using-npm/config#offline)
- **Scripts d'installation** : `preinstall`, `install`, `postinstall` et
  `prepare` sont lancés par `npm ci`, pour le projet et pour ses dépendances.
  C'est du code choisi par le candidat. —
  [npm Docs : Scripts, life cycle](https://docs.npmjs.com/cli/v10/using-npm/scripts#life-cycle-operation-order)
- **Limites d'un conteneur Docker** : `--memory` (avec `--memory-swap` égal,
  sans échange), `--cpus`, et le réseau `none`, qui coupe tout accès réseau.
  Un conteneur tué par sa limite de mémoire a `State.OOMKilled` vrai dans
  `docker inspect`. —
  [Docker Docs : Resource constraints](https://docs.docker.com/engine/containers/resource_constraints/) ;
  [Docker Docs : None network driver](https://docs.docker.com/engine/network/drivers/none/)
- **`fs.cp` avec `filter`** : copie récursive de Node, avec une fonction qui
  décide pour chaque chemin. —
  [Node.js 22 : fsPromises.cp](https://nodejs.org/docs/latest-v22.x/api/fs.html#fspromisescpsrc-dest-options)

## Ce qui a été construit

- `runner/build-outcome.ts`, fonctions pures :
  - `registryNetworkError(log, registry)` : rend la ligne du journal de npm
    qui prouve une erreur réseau sur une requête vers le registre imposé.
    Sont reconnus : connexion refusée ou coupée, DNS, `5xx`. Sinon, rend
    `undefined` ;
  - `buildStepOutcome(run, registry)` : rend l'issue d'une étape. Le délai et
    la mémoire passent en premier ; `registry-network-error` n'est possible
    qu'à l'étape `fetch` ; tout le reste est `build-failed`.
- `runner/build.ts`, `buildCandidate` : les trois conteneurs de la
  construction, le délai global (`docker kill` à l'échéance), le relevé de
  `OOMKilled`, et les empreintes des bruts (`fetch.log`, `install.log`,
  `build.log`, `npm-logs/<étape>/*.log`).
- `runner/candidate-content.ts`, `isFetchedWith` : la copie du téléchargement
  laisse de côté le `.npmrc` de la racine.
- `runner/limits.ts` : le plafond de sécurité, et `measureLimits`, qui
  applique `--timeout-cap-ms` et rend la forme de `environment.limits`.
- `runner/measure.ts` et `runner/cli.ts` : la phase branchée, l'option
  `--timeout-cap-ms`, et le refus `refused-counted` d'une mesure prévue pour
  compter avec un plafond imposé.
- `shared/digest.ts`, `citedFileSha256` : l'empreinte citée d'un brut,
  partagée par le runner et la construction.
- `fixtures/defective-candidates/build-fails/` et `build-never-ends/` : les
  **candidats défectueux 2 et 3**. Ce sont des copies du candidat de
  référence, dont `build.js` sort avec le code `2` ou ne termine jamais.
- Tests :
  - `tests/runner/build-outcome.test.ts` : le repérage, à partir de journaux
    réels de npm ;
  - `tests/runner/limits.test.ts` : le plafond des délais ;
  - `tests/runner/candidate-content.test.ts` : la copie du téléchargement ;
  - `tests/runner/refused-usage.test.ts` : les refus de `--timeout-cap-ms`.
- `docs/specs/03-candidate-runner.md` : les trois étapes et le plafond des
  délais. `docs/PLAN.md`, étape 6 : la règle de construction donnée au prompt.

## Les choix faits et pourquoi

- **Trois conteneurs : téléchargement, installation, `build`.**
  - Docker ne sait pas limiter un conteneur à un seul hôte, et un conteneur
    unique sur `bridge` aurait laissé deux trous. Un script d'installation
    pouvait imprimer une fausse erreur du registre. Un `.npmrc` pouvait en
    provoquer une vraie, avec un proxy injoignable ou un `fetch-timeout`
    minuscule. Dans les deux cas, le candidat rendait sa propre mesure
    invalide.
  - Option retenue : seul `npm ci --ignore-scripts`, sans `.npmrc`, touche le
    réseau. Les scripts d'installation et `build` tournent avec
    `--network none`, depuis le cache rempli par le téléchargement.
  - Option écartée : surcharger chaque clé réseau de npm par une variable.
    La liste n'est pas fermée (un registre de portée `@x:registry`, par
    exemple).
  - Conséquence acceptée : un script ou un `build` qui télécharge échoue
    toujours. L'humain a validé le découpage, et a demandé que le prompt de
    l'étape 6 donne cette règle (`docs/PLAN.md`).
- **Le délai réseau n'est pas une erreur du registre.** `ETIMEDOUT` est
  exclu : la spec ne cite que « connexion refusée ou coupée, DNS, `5xx` ». Un
  registre lent consomme le délai global et donne `build-timeout`, au compte
  du candidat.
- **L'erreur lue dans l'erreur finale de npm, et sa ligne `error code`.**
  Les lignes `attempt N failed` intermédiaires ne comptent pas. Un script qui
  échoue donne `error code 1` : même s'il imprime une fausse ligne du
  registre, il n'est pas reconnu.
- **Délai global, limites par conteneur.** Le délai couvre les trois étapes.
  La mémoire et le CPU s'appliquent à chaque conteneur. Les valeurs (10 min,
  4 GiB, 2 CPU, 60 s pour la disponibilité) sont des paramètres déclarés,
  pas des mesures, et elles sont marquées `provisional`. L'étalonnage (#72)
  les remplacera.
- **`--timeout-cap-ms`, à la demande de l'humain.** Sans lui, le candidat
  défectueux 3 coûte 10 minutes à chaque mesure. L'option ne peut
  qu'abaisser les deux délais, jamais la mémoire ni le CPU. Elle est
  enregistrée comme valeur imposée (`imposedTimeoutCapMs`), et `--counted` la
  refuse. Le job de #74 l'utilisera.
- **Le code `125` de Docker reste `build-failed` pour l'instant.** C'est une
  panne du banc comptée contre le candidat. Un commentaire sur #68 le
  signale, à la demande de l'humain.
- **Relecture en deux axes.**
  - Corrigé :
    - l'en-tête des `server.js` copiés, qui se présentaient comme le candidat
      de référence ;
    - l'empreinte d'un brut, qui était calculée en double ;
    - l'état exact cité pour les journaux des tests.
  - Laissé : les mesures de bout en bout des candidats 2 et 3 dans
    `npm test`, qui reviennent au job de CI de #74.

## Difficultés rencontrées

- **Les erreurs du registre étaient impossibles à provoquer sur le vrai
  registre.**
  - Symptôme : il fallait des journaux réels pour chaque forme d'erreur.
  - Résolution :
    - connexion refusée : `--add-host registry.npmjs.org:127.0.0.1` ;
    - DNS : `--network none` ;
    - `503` et connexion coupée : un petit serveur Node, sur un réseau Docker
      de sonde.

    Les extraits des tests ont gardé le format observé, avec l'adresse du
    serveur remplacée par celle du registre imposé.
- **Les premiers journaux `503` et « connexion coupée » montraient
  `ENOTFOUND`.**
  - Cause : le serveur de sonde était monté comme fichier seul depuis
    `/private/tmp`, et Docker Desktop y avait créé un dossier. Le conteneur
    s'arrêtait aussitôt (`Cannot find module '/srv.js'`).
  - Résolution : monter un dossier qui contient le script.
- **npm interrogeait `registry.npmjs.org/npm`.** Les journaux de sonde
  montraient `http fetch GET https://registry.npmjs.org/npm`. C'est la
  vérification de mise à jour de npm, coupée dans le runner par
  `npm_config_update_notifier=false`.
- **Les tests négatifs du repérage passaient d'emblée.** L'implémentation du
  cycle précédent les couvrait déjà. Je les ai rendus rouges par une mutation
  temporaire (filtre des codes d'erreur retiré), puis le code a été restauré.
- **Retrait de `limitsRecord`.** Pendant le cycle rouge de `--timeout-cap-ms`,
  tous les tests de la CLI ont échoué, et pas seulement les nouveaux :
  `runner/measure.ts` importait encore la fonction remplacée. Ils sont
  repassés au vert une fois l'option branchée.

## Vérifier soi-même

Sorties observées au commit `763557f`, arbre propre, sauf mention. Ce commit
a été regroupé avant le push ; son arbre (`7174721`) est celui de la tête de
la branche. Environnement : Node 22.23.5, Docker Engine 29.1.3 et Compose
2.40.3-desktop.1, sous macOS.

Tests purs de la construction :

```sh
npx vitest run tests/runner/build-outcome.test.ts tests/runner/limits.test.ts tests/runner/candidate-content.test.ts
# Tests  21 passed (21)
```

Refus du plafond, sans Docker :

```sh
node runner/cli.ts measure --candidate fixtures/reference-candidate --timeout-cap-ms 600001; echo "exit=$?"
# refused-usage: --timeout-cap-ms only lowers the timeouts: at most 600000
# exit=4
```

Candidat défectueux 2 :

```sh
npm run migrabench -- measure --candidate fixtures/defective-candidates/build-fails; echo "exit=$?"
# Outcome: candidate-failure (build-failed)
# exit=0
# measure.json : build "build exited with code 2", oracle executed false, 38 non atteints
```

Candidat défectueux 3, avec le plafond :

```sh
npm run migrabench -- measure --candidate fixtures/defective-candidates/build-never-ends --timeout-cap-ms 5000; echo "exit=$?"
# Outcome: candidate-failure (build-timeout)
# Timeout cap imposed (5000 ms): diagnostic measure.
# exit=0
# measure.json : build 5218 ms ; environment.limits :
# {"provisional":true,"source":"safety-cap","buildTimeoutMs":5000,"readyTimeoutMs":5000,
#  "buildMemoryBytes":4294967296,"buildCpus":2,"imposedTimeoutCapMs":5000}
```

Sans le plafond, au commit `87f291c`, la construction s'arrête à 600 229 ms
avec la même issue.

Candidat de référence, sans régression :

```sh
npm run migrabench -- measure --candidate fixtures/reference-candidate
# 7 phases ok, verdict completed, 38 passed, 0 unreached
```

Sondes temporaires dans `candidates/`, au commit `db1f826`, arbre modifié,
puis supprimées. Toutes ont fini en `candidate-failure`, code `0` :

- **`build` qui affiche `env` et tente le réseau** : `build-failed`.
  `build.log` montre seulement `HOME`, les variables de l'image et des
  `npm_config_*`, puis `wget: bad address 'legacy:8081'` et
  `bad address 'registry.npmjs.org'`.
- **`.npmrc` avec `registry=http://127.0.0.1:9/` et la dépendance
  `is-number`** : la construction va au bout. Le journal du téléchargement
  montre `GET 200 https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz`,
  et `build.log` liste `is-number`.
- **`postinstall` qui fait un `wget`** : `build-failed`,
  `install exited with code 1`.
- **`build` qui alloue sans fin** : `build-resource-limit`,
  `build was killed: memory limit reached`.

Suite complète, après `npm run stack:up` :

```sh
npm test
# Test Files  47 passed (47)
#      Tests  344 passed (344)
```

## Pour aller plus loin

- #68 : un code `125` de Docker pendant la construction doit devenir une
  erreur du banc. Voir le commentaire sur ce ticket.
- #64 : le contrôle des sources du `package-lock.json`. Tant qu'il manque,
  le téléchargement suit un `resolved` vers un autre hôte. Une erreur sur cet
  hôte reste `build-failed`.
- #72 : l'étalonnage, qui remplace le plafond de sécurité provisoire.
- #74 : le job de CI qui mesure les candidats défectueux, dont le 3 avec
  `--timeout-cap-ms`.
- Limite connue : un arrêt sur la limite de tas de Node, sans que le
  conteneur soit tué, donne `build-failed` et non `build-resource-limit`.
