# migrabench — règles de travail

## Le projet

Banc de mesure pour migrations de front legacy assistées par agent.
Lire `PROTOCOL.md` (le pourquoi) et `docs/PLAN.md` (le comment) avant toute tâche.

## Stack

- Node 22, TypeScript strict, modules ES, npm.
- Tests : Vitest pour le code du banc, Playwright pour l'oracle.
- Legacy de test : Java 8, Struts 1.3.10, Maven, Tomcat 9, dans Docker.
- Pas de dépendance ajoutée sans la justifier dans la PR.

## Façon de travailler

- Une étape du plan = une spec. Un ticket = une branche = une PR.
- Une session par ticket, partie d'un contexte propre : tout l'état utile est
  écrit dans l'issue, la spec, la fiche et la PR. Garder la même session
  seulement pour les corrections du même ticket.
- TDD sur le runner, les portes et le score : test rouge d'abord.
- Commits petits, au format Conventional Commits, en anglais.
- Code et identifiants en anglais. Documentation en français.
- Ne jamais pousser sur `main` directement.
- Avant d'ouvrir une PR de ticket, lancer `/fiche-ticket`.

## Travail autonome

Décision de Karim le 25/11.

### Autonomie

- Sur un ticket, tu vas jusqu'à la fusion sans attendre Karim :
  implémentation, revue, `/fiche-ticket`, PR, suivi de la CI, levée des
  « À vérifier », puis `gh pr merge --squash --delete-branch`.
- Exception (décision de Karim du 26/11, #126) : une PR qui versionne un
  candidat d'essai se fusionne en merge commit (`gh pr merge --merge
  --delete-branch`), pour que le commit de la sortie brute et chaque commit
  de correction restent dans l'historique de `main` (ADR 0010). Toutes les
  autres PR restent en squash.
- Tu fusionnes seulement si toutes ces conditions sont remplies :
  - toute la CI est verte sur le dernier commit ;
  - `git grep "^> À vérifier"` ne trouve rien dans les fiches de la branche ;
  - aucune décision n'est ouverte ;
  - le plan de test de la PR est entièrement coché, avec ses preuves.
- Tu t'arrêtes et tu demandes (AskUserQuestion) uniquement pour :
  - une décision de conception que la spec ne tranche pas ;
  - un écart à la spec ;
  - une action irréversible hors fusion ;
  - une dépense notable de minutes de CI non prévue par le ticket.
- Après la fusion : `git switch main && git pull`, puis un rapport court
  (PR, commit, ce qui a été décidé seul, limites connues).

### Deux niveaux de rigueur

- **Complet** (runner, oracle, portes, score : tout ce qui produit un
  verdict) : TDD rouge d'abord, deux revues (normes et spec), fiche complète,
  preuve sur la vraie pile.
- **Allégé** (scripts, fixtures, CI, docs) : tests quand il y a de la
  logique, une revue, fiche courte (but, changements, preuves, limites).

### Règles de preuve

- **Une preuve cite l'état exact où elle a été obtenue** : commit, arbre
  propre, identifiant de la mesure ou de l'exécution. Une preuve sans commit
  cite la session avec la description de l'état (fichiers présents, tests
  écrits). Une mesure faite sur un arbre modifié n'est pas une preuve.
- Un contrôle qui n'a rien examiné est « non évaluable », jamais réussi ; un
  témoin montre qu'il sait détecter.
- Toute vérification d'une affirmation sur un outil externe se fait sur sa
  documentation ou sur une vraie exécution, jamais de mémoire.
- **Les chiffres viennent de mesures.** Aucun chiffre, heure, message ou
  durée n'est écrit avant d'avoir été relevé. Un score, un pourcentage ou une
  durée du banc sort d'un run enregistré.
- Une mesure comptée versionnée ne se retire jamais.

## Règles propres à ce projet

- Chiffres et preuves : voir « Règles de preuve » ci-dessus.
- **L'oracle est écrit contre le legacy**, jamais à partir du code d'un candidat.
- **Les pièges du legacy sont volontaires.** Ne pas les corriger dans
  `fixtures/legacy-app`. Chacun est documenté dans `TRAPS.md`.
- **Chaque porte a un test négatif** : un candidat défectueux qui doit la faire échouer.
- **Une fixture qui imite un fichier produit par le banc** (`measure.json`,
  `oracle.json`, constat, journal) est copiée d'un vrai fichier produit, avec
  sa provenance citée (mesure ou exécution). Jamais écrite de mémoire. Deux
  contrôles faux sont passés par des fixtures écrites de mémoire : `saltImposed`
  cherché à la racine d'`oracle.json` au lieu de `config.metadata` (#73, #110),
  et `originMain` cherché sous `environment` au lieu de la racine de
  `measure.json` (exécution 45624689673 sur `main`, #74).
- Les sélecteurs de l'oracle sont sémantiques (rôle, label), pas des id ou des classes.
- Le legacy est volontairement ancien : ne pas le moderniser, ne pas monter ses versions.
- Une sonde Playwright jetable s'écrit dans `.probes/` (ignoré par Git), jamais hors du dépôt.

## Vocabulaire

Legacy, oracle, candidat, run, porte, piège : définitions dans `PROTOCOL.md`.
Utiliser ces mots, et seulement ceux-là, dans le code et la documentation.

## Agent skills

### Tracker d'issues

Les issues et les specs vivent dans GitHub Issues (`karAmmi12/migrabench`),
manipulées avec `gh`. Voir `docs/agents/issue-tracker.md`.

### Labels de triage

Les cinq labels par défaut : `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. Voir `docs/agents/triage-labels.md`.

### Documentation du domaine

Disposition single-context : `GLOSSARY.md` et `docs/adr/` à la racine.
Voir `docs/agents/domain.md`.

### Actions des workflows

Toute action ajoutée ou mise à jour dans `.github/workflows/` est épinglée
par SHA : voir `docs/agents/pinned-actions.md`.
