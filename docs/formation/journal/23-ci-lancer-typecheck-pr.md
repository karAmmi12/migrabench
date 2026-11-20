# #23 · CI : lancer npm run typecheck sur chaque PR

## Objectif

Avant ce ticket, aucune CI ne lançait le typecheck : le seul workflow de
contrôle du code vérifiait la présence des fiches, et `npm run typecheck` ne
tournait qu'en local. Ce ticket ajoute un job séparé, sans Docker, qui lance
`npm ci` puis `npm run typecheck` sur chaque PR. En chemin, `.nvmrc` passe de
la majeure `22` à la version exacte `22.23.5`, pour que la CI et les
machines utilisent le même Node.

## Notions à connaître

- **`actions/setup-node` et `node-version-file`** : l'action installe Node
  sur le runner, à la version lue dans un fichier comme `.nvmrc`. Avec une
  majeure seule (`22`), elle peut prendre une 22.x déjà en cache sur le
  runner ; avec `check-latest: true`, elle prend la dernière 22.x publiée.
  Avec une version exacte, elle installe toujours la même. —
  [actions/setup-node (README)](https://github.com/actions/setup-node)
- **`npm ci`** : installe exactement les versions de `package-lock.json`,
  sans le modifier, et échoue s'il ne correspond pas à `package.json`. C'est
  la commande d'installation prévue pour la CI. —
  [npm Docs : npm ci](https://docs.npmjs.com/cli/v10/commands/npm-ci)
  (documentation de npm 10 ; npm `10.9.9` observé en local sous Node 22.23.5)
- **`tsc --noEmit`** : le compilateur TypeScript vérifie les types sans
  écrire de fichiers. C'est le script `typecheck` de `package.json`. —
  [TypeScript : noEmit](https://www.typescriptlang.org/tsconfig/#noEmit)
- **Script `pretest`** : npm lance `pretest` avant `test`, et s'arrête s'il
  échoue. Le banc y place `scripts/check-node-version.mjs`, qui refuse
  `npm test` sous un autre Node que celui de `.nvmrc`. —
  [npm Docs : scripts (Pre & Post Scripts)](https://docs.npmjs.com/cli/v10/using-npm/scripts)
- **`engine-strict`** (`.npmrc`) : `npm install` et `npm ci` refusent une
  version de Node hors de `engines` (`^22.21.0`). Il ne protège pas
  `npm test`, d'où le `pretest`. —
  [npm Docs : config, engine-strict](https://docs.npmjs.com/cli/v10/using-npm/config#engine-strict)

## Ce qui a été construit

- `.github/workflows/typecheck.yml` : le workflow « Vérification des
  types ». Sur chaque PR (`opened`, `reopened`, `synchronize`), sur
  `ubuntu-24.04` : `actions/checkout` (v7.0.1), `actions/setup-node`
  (v7.1.0) avec `node-version-file: .nvmrc` et le cache npm, puis
  `npm ci` et `npm run typecheck`. Les deux actions sont épinglées par SHA.
- `.nvmrc` : `22.23.5` au lieu de `22`.
- `scripts/check-node-version.mjs` : le `pretest` compare désormais la
  version complète de Node à celle de `.nvmrc` (préfixe `v` toléré), au lieu
  de la seule majeure.
- `tests/check-node-version.test.ts` : 4 tests Vitest du `pretest`. Ils
  copient le script dans un dossier temporaire à côté d'un `.nvmrc` du cas,
  écrit à partir de la version de Node qui exécute les tests. Les tests
  négatifs sont une autre version de la même majeure et une autre majeure.
- `README.md` : les prérequis parlent de la version exacte de `.nvmrc`.

## Les choix faits et pourquoi

- **Un workflow dédié, sans Docker.** Décision de triage de l'issue : un
  retour rapide et lisible, indépendant de la pile ; #20 lancera `npm test`
  avec la pile, pas le typecheck. Option écartée : une étape dans le futur
  workflow de #20.
- **`actions/setup-node` v7.1.0, épinglé sur
  `949feb2413d6458794dcd2491c4babbbce0c15c1`.** C'était la dernière version
  publiée (`gh api repos/actions/setup-node/releases/latest` a rendu
  `v7.1.0`) ; son étiquette est légère (`gh api …/git/ref/tags/v7.1.0` a
  rendu `commit 949feb24…`), donc ce SHA est celui du commit. Procédure :
  `docs/agents/pinned-actions.md`.
- **La version exacte dans `.nvmrc`, pas `check-latest: true`.** Après la
  relecture, `check-latest: true` avait été ajouté pour que la CI prenne
  une 22.x conforme à `engines` (`^22.21.0`) plutôt qu'une 22.x plus
  ancienne en cache. L'humain l'a fait retirer : il fait changer la version
  de Node d'une exécution à l'autre, contrairement à l'esprit de #10.
  Retenu à la place : `.nvmrc` à `22.23.5`, la version utilisée en local.
- **Le `pretest` exige la version exacte, pas seulement la majeure.** Avec
  une version complète dans `.nvmrc`, comparer la majeure à tout le fichier
  ferait échouer tout `npm test`. Comparer la version complète va dans le
  sens du ticket : les tests locaux tournent sous le même Node que la CI.
  Option écartée : continuer à ne comparer que la majeure, ce qui laisserait
  les machines et la CI diverger sur la version mineure.
- **Noms en français** pour le workflow et ses étapes, comme « Fiche de
  formation » et « Actions épinglées » ; point relevé par la relecture
  « standards ». Le nom de l'étape « Typecheck » reste celui du script.
- **`cache: npm`** sur `setup-node`, que l'issue ne demandait pas : il
  réutilise le cache npm entre les exécutions, sans changer ce qui est
  installé (`npm ci` suit `package-lock.json`).

## Difficultés rencontrées

- **`npm test` refusé en local sous Node 24.** Symptôme : le premier
  `npm test` de la session a affiché
  `npm test requires Node 22 (.nvmrc), found v24.12.0.` Cause : le shell
  n'avait pas activé la version de `.nvmrc`. Résolution : `nvm use`, puis
  la suite est passée (9 fichiers, 74 tests). Le `pretest` a fait son
  travail.
- **Le `pretest` refusait une version complète.** Symptôme : le test
  « accepte la version exacte de .nvmrc » est rouge (2 tests en échec sur 4)
  avec le script d'origine. Cause : le script comparait
  `process.versions.node.split(".")[0]` (`22`) à tout le contenu de
  `.nvmrc` (`22.23.5`). Résolution : comparer la version complète, sans le
  préfixe `v` (`0282e43`).
- **`git revert -q` refusé.** Symptôme : `git revert --no-edit HEAD -q` a
  affiché l'aide de `git revert` sans rien faire. Cause : `git revert`
  n'accepte pas l'option `-q`. Résolution : `git revert --no-commit HEAD`,
  puis un commit (`302f507`).
- **Un réglage retiré après la relecture.** `check-latest: true` (commit
  `49fa85d`) répondait au risque relevé par la relecture « standards », mais
  introduisait une version de Node mouvante. Retiré dans `0ba4365`, au
  profit de la version exacte dans `.nvmrc`.

## Vérifier soi-même

État observé : commit `0ba4365`, le 2026-11-20, sous Node `v22.23.5`.

```sh
nvm use && npm run typecheck; echo "exit $?"
```

Observé : `tsc --noEmit` sans sortie, puis `exit 0`.

```sh
npx vitest run tests/check-node-version.test.ts
```

Observé : `Tests  4 passed (4)`.

```sh
npm test
```

Observé sous `v22.23.5` : `Test Files  10 passed (10)`,
`Tests  78 passed (78)`. Sous `v24.12.0` :
`npm test requires Node 22.23.5 (.nvmrc), found v24.12.0.`

```sh
bash scripts/check-pinned-actions.sh .github/workflows; echo "exit $?"
```

Observé : aucune sortie, puis `exit 0`.

Sur la PR, le workflow « Vérification des types » doit passer.

Observé sur l'exécution
[44785462516](https://github.com/karAmmi12/migrabench/actions/runs/44785462516)
(PR #27, commit `2589020`) : `setup-node` affiche
`Found in cache @ /opt/hostedtoolcache/node/22.23.5/x64` puis
`node: v22.23.5` ; l'étape « Typecheck » lance `tsc --noEmit`, conclusion
`success`, en 13 s (`startedAt` 17:40:00Z, `updatedAt` 17:40:13Z).

Test négatif : une erreur de type volontaire doit faire échouer le job.

Le commit `c39fd09` ajoute `tests/type-error.ts`, qui contient
`export const deliberate: number = "not a number";`. Observé sur
l'exécution
[44785577656](https://github.com/karAmmi12/migrabench/actions/runs/44785577656)
(commit `c39fd09`), conclusion `failure` :

```
##[error]tests/type-error.ts(2,14): error TS2322: Type 'string' is not assignable to type 'number'.
##[error]Process completed with exit code 1.
```

Le commit `302f507` annule `c39fd09`. Observé sur l'exécution
[44785666272](https://github.com/karAmmi12/migrabench/actions/runs/44785666272)
(commit `302f507`) : conclusion `success`.

## Pour aller plus loin

- #20, « CI : exécuter npm test avec la pile Docker » : il pourra lire le
  même `.nvmrc`, et le `pretest` y vérifiera la version exacte.
- Monter Node demande désormais de changer `.nvmrc` et, si besoin,
  `engines` dans `package.json` ; la CI et le `pretest` suivent `.nvmrc`.
- Limite connue : `engines` (`^22.21.0`) reste plus large que `.nvmrc`.
  `npm install` accepte donc une 22.x que `npm test` refuse.
