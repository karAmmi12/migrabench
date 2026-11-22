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
- TDD sur le runner, les portes et le score : test rouge d'abord.
- Commits petits, au format Conventional Commits, en anglais.
- Code et identifiants en anglais. Documentation en français.
- Ne jamais pousser sur `main` directement.
- Avant d'ouvrir une PR de ticket, lancer `/fiche-ticket`.

## Règles propres à ce projet

- **Les chiffres viennent de mesures.** Ne jamais écrire un score, un
  pourcentage ou une durée qui ne sort pas d'un run enregistré.
- **Une preuve cite l'état exact où elle a été obtenue** : un commit, ou la
  session avec la description de l'état (fichiers présents, tests écrits).
- **L'oracle est écrit contre le legacy**, jamais à partir du code d'un candidat.
- **Les pièges du legacy sont volontaires.** Ne pas les corriger dans
  `fixtures/legacy-app`. Chacun est documenté dans `TRAPS.md`.
- **Chaque porte a un test négatif** : un candidat défectueux qui doit la faire échouer.
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
