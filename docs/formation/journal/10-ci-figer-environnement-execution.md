# #10 · CI : figer l'environnement d'exécution

## Objectif

Le workflow `.github/workflows/fiche-ticket.yml` tournait sur
`ubuntu-latest` avec `actions/checkout@v4`. Le run 44118322036 (PR #9)
affichait deux annotations non bloquantes : un *warning* parce que
`checkout@v4` vise Node.js 20, qui est déprécié, et une *notice* qui
annonçait le passage d'`ubuntu-latest` à Ubuntu 26. Ce ticket fige le runner
et l'action, pour que la CI parte du même état à chaque exécution, dans
l'esprit de la règle 1 de `PROTOCOL.md`.

## Notions à connaître

- **Label de runner hébergé** : `runs-on` choisit l'image de la machine
  virtuelle. `ubuntu-latest` est un alias que GitHub fait glisser d'une
  version à l'autre. `ubuntu-24.04` désigne une version précise. —
  [GitHub Docs : GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- **Mise à jour des images** : même une image nommée par sa version change.
  GitHub met à jour le logiciel des images chaque semaine (« Images are
  updated on a weekly cadence »). —
  [actions/runner-images : README](https://github.com/actions/runner-images)
- **Runtime d'une action JavaScript** : le champ `runs.using` de
  l'`action.yml` d'une action dit sous quelle version de Node.js le runner
  l'exécute (`node20`, `node24`). —
  [actions/checkout : action.yml à l'étiquette v7](https://github.com/actions/checkout/blob/v7/action.yml)
- **Étiquette de version et SHA de commit** : `@v7` est une étiquette que
  les mainteneurs déplacent à chaque v7.x. Un SHA de commit complet ne bouge
  jamais. GitHub recommande ce second épinglage pour figer une action. —
  [GitHub Docs : Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)

## Ce qui a été construit

- `.github/workflows/fiche-ticket.yml`, deux lignes :
  - `runs-on: ubuntu-24.04` remplace `runs-on: ubuntu-latest` ;
  - `uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`
    remplace `uses: actions/checkout@v4`. Le commentaire donne la version
    lisible ; le SHA est ce que le runner exécute.

Le reste du workflow (la vérification des fiches) ne change pas.

## Les choix faits et pourquoi

- **v7 plutôt que v5 ou v6.** L'`action.yml` de chaque version majeure,
  lu avec `gh api`, déclare `node20` pour v4, puis `node24` pour v5, v6 et
  v7. v5 suffisait pour le critère. v7 est la dernière version majeure, et
  son seul changement cassant ne nous touche pas : elle bloque le checkout
  d'une PR venant d'un fork sous `pull_request_target` et `workflow_run`,
  alors que ce workflow ne se déclenche que sur `pull_request`.
- **Deux sources pour prouver Node.js 24.** Les notes de la v7.0.0 ne
  parlent pas de Node.js. C'est la
  [v5.0.0](https://github.com/actions/checkout/releases/tag/v5.0.0) qui
  annonce le passage (« Update actions checkout to use node 24 »).
  L'`action.yml` de la v7 confirme que la version retenue déclare toujours
  `node24`. La relecture « spec » a relevé qu'il fallait citer les deux.
- **Un SHA de commit plutôt que l'étiquette `@v7`.** Le premier commit
  (`11cfdf3`) utilisait `@v7`, ce qui suffit au ticket, qui demande une
  « version majeure ». Les deux relectures ont noté que `@v7` bouge à chaque
  v7.x, et l'humain a décidé de passer sur le SHA de la v7.0.1
  (`dff55f6`). `v7.0.1` est une étiquette légère : elle pointe directement
  sur le commit, sans objet *tag* intermédiaire à déréférencer.
- **Limite acceptée : l'image `ubuntu-24.04` reste mobile.** GitHub la met
  à jour chaque semaine, et un runner hébergé ne permet pas de choisir une
  version d'image plus précise. Pour aller plus loin, il faudrait un runner
  auto-hébergé ou un conteneur de job, ce que le ticket ne demande pas.

## Difficultés rencontrées

- **La relecture voyait un diff vide.** Symptôme : la modification était
  encore dans l'arbre de travail, et la relecture compare
  `git diff main...HEAD`. Cause : rien n'était commité sur la branche.
  Résolution : committer d'abord (`11cfdf3`), puis lancer la relecture.

## Vérifier soi-même

```sh
gh api repos/actions/checkout/git/ref/tags/v7.0.1 --jq '.object | "\(.type) \(.sha)"'
```

Observé : `commit 3d3c42e5aac5ba805825da76410c181273ba90b1`. Le type
`commit` montre que l'étiquette pointe directement sur le commit épinglé.

```sh
gh api "repos/actions/checkout/contents/action.yml?ref=3d3c42e5aac5ba805825da76410c181273ba90b1" --jq .content | base64 -d | grep -A1 '^runs:'
```

Observé : `runs:` puis `  using: node24`.

```sh
gh api "repos/actions/checkout/contents/action.yml?ref=v4" --jq .content | base64 -d | grep -A1 '^runs:'
```

Observé : `using: node20`, la cause du *warning* d'origine.

```sh
grep -nE 'runs-on|checkout@' .github/workflows/fiche-ticket.yml
```

Observé : `runs-on: ubuntu-24.04` et
`actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`.

Sur la PR, le run du workflow « Fiche de formation » doit passer sans
annotation. Pour lire les annotations d'un job :

```sh
gh api repos/karAmmi12/migrabench/check-runs/<id-du-job>/annotations --jq '.[] | "\(.annotation_level): \(.message)"'
```

Observé sur le run
[44773175821](https://github.com/karAmmi12/migrabench/actions/runs/44773175821)
(PR #21, commit `9cf8cb0`) : conclusion `success`, et aucune annotation,
donc ni le *warning* Node.js 20 ni la notice sur `ubuntu-latest`.

## Pour aller plus loin

- #20, « CI : exécuter npm test avec la pile Docker », à traiter en début
  d'étape 2. Son workflow pourra reprendre le même runner et le même
  épinglage par SHA.
- Pour mettre à jour le SHA sans le faire à la main, un outil comme
  Dependabot peut proposer les nouvelles versions des actions. Ce n'est pas
  décidé dans le dépôt.
