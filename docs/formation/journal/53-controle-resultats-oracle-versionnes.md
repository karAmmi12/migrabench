# #53 · Contrôle des résultats d'oracle versionnés : arbre propre, Node de .nvmrc, sel tiré, commit connu, aucun chemin machine

## Objectif

Pendant l'étape 2, un résultat d'oracle invalide a été écrit quatre fois dans
`results/oracle/`, puis repéré à la main avant le commit. Il y a eu un arbre
`dirty`, un mauvais Node et des chemins de la machine (relevé dans l'issue). La
collecte (`oracle/collect.ts`) refuse ces chemins au moment d'écrire. Mais rien
ne refusait un fichier déjà versionné : écrit par une version antérieure de la
collecte, modifié à la main ou produit sous un mauvais Node.

Ce ticket ajoute un contrôle lancé par `npm test`, donc par la CI « Tests du
banc ». Il parcourt chaque résultat versionné et exige cinq règles. Le message
d'échec nomme le fichier et la règle violée.

## Notions à connaître

- **Fusion en squash** : GitHub réunit les commits d'une PR en un seul commit
  sur `main`. Les commits de la branche, dont celui où un résultat a été
  obtenu (`benchCommit`), ne sont donc pas des ancêtres de `main`. Après la
  suppression de la branche, seule la référence `refs/pull/<N>/head`, que
  GitHub garde, les rend joignables. —
  [GitHub Docs : About merge methods on GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github) ;
  [GitHub Docs : Checking out pull requests locally](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/checking-out-pull-requests-locally)

  > À vérifier : les deux liens GitHub Docs n'ont pas été ouverts pendant la session.
- **`git cat-file -e <sha>^{commit}`** : réussit si l'objet existe dans le
  dépôt local et si c'est un commit, sans rien afficher. C'est le test
  « commit connu ». — [Git : git-cat-file](https://git-scm.com/docs/git-cat-file)
- **`fetch-depth` de `actions/checkout`** : par défaut, le checkout ne
  récupère qu'un commit. `fetch-depth: 0` récupère tout l'historique des
  branches et des tags, mais pas `refs/pull/*`. —
  [actions/checkout : README](https://github.com/actions/checkout#usage)

  > À vérifier : le README n'a pas été ouvert pendant la session. Que `fetch-depth: 0` ne récupère pas `refs/pull/*` n'a pas été vérifié. L'essai sur clone neuf (`git clone`, toutes les branches) montre seulement que les branches ne suffisent pas.
- **Union discriminée en TypeScript** : un type comme
  `{ kind: "prefix"; prefix } | { kind: "parent"; path }`. Le champ `kind`
  permet au compilateur de savoir quel cas il traite. C'est la forme de
  `MachinePath`. —
  [TypeScript Handbook : Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- **Test négatif d'une porte** (`CLAUDE.md`) : chaque règle a un résultat
  factice défectueux qui doit la faire échouer. Ici, il y en a un par règle,
  sous `tests/oracle/fixtures/results/`.

## Ce qui a été construit

- **`oracle/result-check.ts`** : `checkResult(result, environment)` rend la
  liste des violations `{ rule, detail }`, vide si le résultat est valide.
  `formatViolation(file, violation)` en fait le message
  `<fichier>: rule <règle>: <détail>`. Les règles sont :
  - `worktree` : vaut `clean` ;
  - `node` : vaut la version de `.nvmrc` ;
  - `saltImposed` : vaut `false`, un champ absent est refusé ;
  - `benchCommit` : un SHA complet de 40 caractères, objet du dépôt ;
  - `machine-path` : une violation par chemin machine trouvé.

  C'est l'unique définition d'un résultat valide.
- **`oracle/collect.ts`** : `machinePathsIn(result)` et `describeMachinePath`
  sont partagés par la collecte et par le contrôle. `/Users/`, `/home/` et
  `/var/folders/` sont refusés n'importe où dans le fichier. `../` n'est
  cherché que dans les champs de chemin (`PATH_KEYS` : `file`, `path`, `argv`,
  `rootDir`…). La collecte refuse donc désormais aussi `/var/folders/`, et
  liste tous les chemins machine dans son erreur.
- **`oracle/repository.ts`** : `repositoryEnvironment(root)` lit `.nvmrc` et
  vérifie un commit avec `git cat-file`. `FETCH_PULL_HEADS` rappelle la
  commande qui récupère les têtes de PR.
- **`oracle/proof.ts`** : `checkProof(inputs, environment)` applique
  `checkResult` à chaque résultat. Elle n'ajoute que ce qui est propre à une
  preuve :
  - `ciRun` présent ;
  - 38 scénarios réussis sur 38 ;
  - rangs 1 à 5 d'une même exécution de CI ;
  - environnement partagé ;
  - sels tous différents.

  Les manquements citent le fichier, plus le rang.
  `scripts/check-oracle-proof.ts` lui passe l'environnement du dépôt.
- **`tests/oracle/result-check.test.ts`** et
  **`tests/oracle/fixtures/results/*.json`** : un résultat valide, un factice
  par règle (`dirty-worktree`, `other-node`, `salt-imposed`,
  `salt-imposed-missing`, `unknown-commit`, `short-commit`, `home-path`,
  `linux-home-path`, `temp-path`, `parent-path`), un `../` dans une sortie
  texte accepté (`parent-in-text`), et un résultat qui cumule cinq violations
  (`several-violations`).
- **`tests/oracle/versioned-results.test.ts`** : un test par fichier de
  `results/oracle/`, avec la liste nommée des exceptions (`EXEMPTIONS`) et
  un test qui vérifie que chaque exception nomme un résultat versionné.
- **`package.json`** : script `fetch:pull-heads`
  (`git fetch --no-tags origin '+refs/pull/*/head:refs/remotes/origin/pull/*'`).
- **`.github/workflows/tests.yml`** : `fetch-depth: 0` sur le checkout, puis
  `npm run fetch:pull-heads`, avec la raison en commentaire.

## Les choix faits et pourquoi

- **« Commit connu » = objet présent dans le dépôt, pas ancêtre de `main`.**
  L'issue demandait « un commit présent dans l'historique du dépôt ». Aucun
  des dix `benchCommit` versionnés n'est un ancêtre de `main` (`git
  merge-base --is-ancestor` : `exists-not-ancestor` pour les 14 fichiers), à
  cause de la fusion en squash. Options écartées :
  - « ancêtre de `main` ou d'une tête de PR » : plus strict, mais plus coûteux ;
  - « ancêtre de `HEAD` » : les 14 résultats échouent.

  Décision de l'humain.
- **Le résultat du fil traceur (#32) est dispensé de `saltImposed`, pas
  réécrit.** `20261121T164222Z-6c34da6.json` a été écrit avant que la collecte
  enregistre ce champ. ADR 0005 : un résultat versionné n'est pas modifié.
  Options écartées :
  - supprimer le fichier : on perd la trace du fil traceur ;
  - tolérer un champ absent : un fichier modifié à la main pourrait passer.

  Décision de l'humain.
- **`benchCommit` doit être un SHA complet.** Ajout non demandé par l'issue :
  `git cat-file -e` accepte aussi un SHA abrégé ou `HEAD`, qui passeraient
  sans rien prouver.
- **Violations typées `{ rule, detail }`, mises en forme à la fin.** La
  première version rendait des chaînes. Le test des résultats versionnés les
  relisait avec `startsWith` et `includes` pour appliquer l'exception :
  changer le format les aurait cassés sans bruit. Relevé par la revue de code
  (standards), corrigé sur demande de l'humain (`386e126`).
- **Un seul exemplaire de la commande `git fetch`.** Elle existait dans
  `tests.yml` et dans le message local, et les deux copies divergeaient déjà
  (`--no-tags`). Elle vit dans `package.json`, la CI lance
  `npm run fetch:pull-heads` et le message la rappelle. Relevé par la revue
  de code, corrigé sur demande de l'humain (`386e126`).
- **`../` seulement dans les champs de chemin.** Sinon, une sortie de test
  légitime qui cite `../` ferait échouer le résultat. Relevé par la revue de
  code (spec), règle fixée par l'humain : `/Users/`, `/home/` et
  `/var/folders/` restent interdits partout (`be13bd6`).
- **Toutes les violations signalées.** La première version ne nommait que le
  premier chemin machine trouvé. Demande de l'humain (`eded4c6`).
- **`proof.ts` reprend `checkResult`.** Les règles `worktree` et
  `saltImposed` existaient en double dans `proof.ts`, avec un autre format de
  message. Une preuve est désormais aussi refusée sous un autre Node, sur un
  commit inconnu ou avec un chemin machine. Demande de l'humain (`e9efd93`).

## Difficultés rencontrées

- **La règle « commit dans l'historique » de l'issue échouait sur tous les
  résultats de `main`.**
  - Symptôme : avant d'écrire le test, `git merge-base --is-ancestor` a
    répondu `exists-not-ancestor` pour les 14 résultats.
  - Cause : la fusion en squash. `git ls-remote --heads origin` ne
    montrait plus que trois branches, donc les commits ne restaient
    joignables que par `refs/pull/*/head`.
  - Résolution : la règle a été redéfinie avec l'humain (voir les choix).
- **Le test passait en local, mais aurait échoué en CI.**
  - Symptôme : en local, les 16 tests de `versioned-results.test.ts`
    passaient. Sur un clone neuf, 7 des 10 commits manquaient
    (`MISSING MISSING MISSING MISSING ok ok ok MISSING MISSING MISSING`).
  - Cause : le clone local gardait des refs `origin/*` périmées, de branches
    déjà supprimées sur GitHub, qui retenaient ces commits.
  - Résolution : sur ce même clone neuf, après
    `git fetch origin '+refs/pull/*/head:refs/remotes/origin/pull/*'`, les
    10 étaient présents (`ok` × 10). D'où `fetch-depth: 0` et
    `npm run fetch:pull-heads` dans `tests.yml`.
- **Une boucle shell sans effet.** La première vérification du clone neuf
  n'a tourné qu'une fois : sous zsh, `for c in $C` ne découpe pas une
  variable. Relancée sous `bash -c`.
- **Le premier résultat ne portait pas `saltImposed`.**
  - Symptôme : le relevé de `config.metadata` des 14 fichiers donnait
    `undefined` pour `20261121T164222Z-6c34da6.json`.
  - Résolution : l'exception nommée, décidée par l'humain.

### Les tests rouges vus dans la session

Pour la première version, une tranche par règle, chacune rouge avant son code.
État : `b2ec9d8` (main), avec le test et les fichiers factices non commités :

- `worktree` : échec à l'import, `oracle/result-check.ts` n'existait pas
  encore (`Tests  no tests`) ;
- `node` : `Tests  1 failed | 2 passed (3)` ;
- `saltImposed` (`true`, absent) : `2 failed | 3 passed (5)` ;
- `benchCommit` (inconnu, abrégé) : `2 failed | 5 passed (7)` ;
- chemins (`/Users/`, `/home/`, `/var/folders/`, `../`) :
  `4 failed | 7 passed (11)`.

Contre les résultats versionnés, l'exception a été retirée à la main, puis
restaurée. L'état était `b2ec9d8` avec tout le travail non commité, qui est
devenu `e85aed3`. Le test a échoué :
`results/oracle/20261121T164222Z-6c34da6.json: rule saltImposed: missing,
expected false`, `Tests  2 failed | 14 passed (16)`. Le second échec est le
test qui vérifie que chaque exception nomme un résultat versionné.

Pour les trois changements de règle demandés après la revue :

1. **`../` seulement dans les champs de chemin.** État : `386e126`, avec
   `result-check.test.ts`, `collect.test.ts`, `parent-path.json` (`../`
   déplacé dans `argv`) et `parent-in-text.json` modifiés et non commités,
   `oracle/collect.ts` inchangé. `npx vitest run
   tests/oracle/result-check.test.ts tests/oracle/collect.test.ts` donnait
   `Tests  4 failed | 29 passed (33)`. La collecte répondait encore
   `...a path above the repository root (../)`.
2. **Toutes les violations.** État : `be13bd6`, avec le test « reports every
   violation of a result, not only the first » et `several-violations.json`
   non commités. On obtenait `Tests  1 failed | 12 passed (13)` : seul
   `/Users/` était rendu, `/var/folders/` et `../` manquaient.
3. **`proof.ts` reprend les règles.** État : `eded4c6`, avec
   `tests/oracle/proof.test.ts` réécrit et non commité, `oracle/proof.ts`
   inchangé. On obtenait `Tests  14 failed (14)`. Ce rouge vient en partie
   de la nouvelle signature (`{ file, result }`), qui fait échouer aussi le
   test d'acceptation. Les règles `node`, `benchCommit` et `machine-path`
   par résultat étaient, elles, réellement absentes de `checkProof`.

## Vérifier soi-même

```sh
npx vitest run tests/oracle/result-check.test.ts
```

Attendu (observé sur `e9efd93`) : `Tests  13 passed (13)`.

```sh
npx vitest run tests/oracle/versioned-results.test.ts
```

Attendu (observé sur `e9efd93`) : `Tests  16 passed (16)`. Il y a 14 résultats,
le test « il y a des résultats » et celui des exceptions. Sur un clone qui n'a
pas les têtes de PR, un test échoue sur `rule benchCommit`, et le message
rappelle `npm run fetch:pull-heads`.

```sh
npx vitest run tests/oracle/proof.test.ts
```

Attendu (observé sur `e9efd93`) : `Tests  14 passed (14)`.

```sh
npm run -s oracle:proof -- results/oracle/*-ci45041781224.1-*.json
```

Attendu (observé) : `Proof holds on 5 results.`

```sh
npm test
```

Attendu (observé sur `e9efd93`, pile Docker démarrée) :
`Test Files  33 passed (33)`, `Tests  229 passed (229)`.

> À vérifier après l'exécution de la CI de la PR : le lien de l'exécution
> « Tests du banc », son head SHA, le résultat de l'étape « Récupération des
> têtes de PR » et la ligne `Tests` de l'étape « Tests ».

## Pour aller plus loin

- [ADR 0005](../../adr/0005-conservation-des-resultats-bruts.md) : pourquoi un
  résultat versionné n'est jamais réécrit, d'où l'exception nommée.
- Limite connue : « commit connu » prouve que le commit existe, pas qu'il
  vient de la PR qui a versionné le résultat. La règle plus stricte (ancêtre
  d'une tête de PR) a été écartée.
- Limite connue : `fetch:pull-heads` récupère toutes les têtes de PR. Le
  coût grandit avec le nombre de PR du dépôt.
- Piste pour l'étape 6 : faire passer les résultats des runs mesurés par le
  même `checkResult`, pour garder une seule définition d'un résultat valide.
