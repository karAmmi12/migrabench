# Tracker d'issues : GitHub

Les issues et les specs de ce dépôt sont des issues GitHub
(`karAmmi12/migrabench`). Toutes les opérations passent par la CLI `gh`.

## Conventions

- **Créer une issue** : `gh issue create --title "..." --body "..."`. Utiliser un heredoc pour un corps sur plusieurs lignes.
- **Lire une issue** : `gh issue view <numéro> --json number,title,body,labels,comments`.
- **Lister les issues** : `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`, avec les filtres `--label` et `--state` utiles.
- **Rattacher une sous-issue à un parent** : `gh issue create --parent <parent> ...`, ou après coup `gh issue edit <parent> --add-sub-issue <enfant>` (`gh` 2.94 et plus). Sans sous-issues, écrire `Fait partie de #<parent>` en tête du corps de l'enfant.
- **Commenter** : `gh issue comment <numéro> --body "..."`.
- **Ajouter / retirer un label** : `gh issue edit <numéro> --add-label "..."` / `--remove-label "..."`.
- **Fermer** : `gh issue close <numéro> --comment "..."`.

`gh` déduit le dépôt de `git remote -v` quand il tourne dans le clone.

## Pull requests comme surface de triage

**PRs comme surface de demande : non.** _(Passer à `oui` si le dépôt traite
les PR externes comme des demandes de fonctionnalité ; `/triage` lit ce
drapeau.)_

À `oui`, les PR suivent les mêmes labels et états que les issues, avec les
équivalents `gh pr` :

- **Lire une PR** : `gh pr view <numéro> --comments`, et `gh pr diff <numéro>` pour le diff.
- **Lister les PR externes à trier** : `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Commenter / étiqueter / fermer** : `gh pr comment`, `gh pr edit --add-label` / `--remove-label`, `gh pr close`.

GitHub partage la même numérotation entre issues et PR : un `#42` seul peut
être l'un ou l'autre. Essayer `gh pr view 42`, puis `gh issue view 42`.

## Quand un skill dit « publier dans le tracker »

Créer une issue GitHub.

## Quand un skill dit « récupérer le ticket concerné »

Le lire comme dans **Lire une issue**.

## Dépendances entre tickets

- **Bloqué par** : utiliser les dépendances natives de GitHub. Ajouter une
  relation avec `gh api --method POST repos/<owner>/<repo>/issues/<enfant>/dependencies/blocked_by -F issue_id=<id-bloquant>`,
  où `<id-bloquant>` est l'**identifiant de base de données** de l'issue
  bloquante (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`), pas son
  `#numéro` ni son `node_id`.
- **Repli** : si les dépendances ne sont pas disponibles, écrire une ligne
  `Bloqué par : #<n>, #<n>` en tête du corps de l'issue.
- Un ticket est débloqué quand toutes ses issues bloquantes sont fermées.
  GitHub expose les bloquants encore ouverts dans
  `issue_dependencies_summary.blocked_by`.

## Opérations de wayfinding

Utilisées par `/wayfinder`. La **carte** est une issue unique, et ses
tickets sont des issues **enfants**.

- **Carte** : une issue avec le label `wayfinder:map`, dont le corps contient
  Notes / Décisions prises / Brouillard. `gh issue create --label wayfinder:map`.
- **Ticket enfant** : une sous-issue de la carte (voir **Rattacher une
  sous-issue**). Sans sous-issues, l'ajouter à une liste de tâches dans le
  corps de la carte et écrire `Fait partie de #<carte>` en tête de l'enfant.
  Labels : `wayfinder:<type>` (`research` / `prototype` / `grilling` /
  `task`). Une fois pris, le ticket est assigné au développeur qui pilote.
- **Blocage** : voir **Dépendances entre tickets**.
- **Frontière** : lister les enfants ouverts de la carte, écarter ceux qui
  ont un bloquant ouvert ou un assigné. Le premier dans l'ordre de la carte
  l'emporte.
- **Prendre un ticket** : `gh issue edit <n> --add-assignee @me`, première
  écriture de la session.
- **Résoudre** : `gh issue comment <n> --body "<réponse>"`, puis
  `gh issue close <n>`, puis ajouter un renvoi (résumé + lien) aux Décisions
  prises de la carte.
