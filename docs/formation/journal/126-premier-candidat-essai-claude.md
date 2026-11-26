# #126 · Étape 4 · Premier candidat d'essai (Claude Code)

## Objectif

Les portes de l'étape 4 doivent écrire leurs fixtures à partir d'un vrai
candidat, pas du relais JSP de référence (ADR 0010). Karim a fait produire
une nouvelle application par Claude Code, isolé dans un conteneur, à partir
de la copie expurgée du legacy (#125). Le ticket versionne cette sortie avec
sa provenance, la mesure une fois en diagnostic, et applique le critère de
repli.

## Notions à connaître

- **`claude -p` et `--output-format stream-json`** : Claude Code sans
  interface, qui écrit chaque événement de la session sur une ligne JSON
  (`system/init`, messages, `result` avec le coût et les tokens). —
  [Claude Code, headless](https://code.claude.com/docs/en/headless)
- **Jeton d'abonnement** : `claude setup-token` produit le jeton lu dans
  `CLAUDE_CODE_OAUTH_TOKEN` ; il n'est jamais versionné, et `trial:redact`
  vérifie son absence. —
  [Claude Code, authentication](https://code.claude.com/docs/en/authentication)
- **Fusion en merge commit** : contrairement au squash, elle garde chaque
  commit de la branche dans l'historique de `main`, avec son SHA. —
  [GitHub Docs, about merge methods](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github),
  [`gh pr merge`](https://cli.github.com/manual/gh_pr_merge)

Liens ouverts le 2026-11-26 (`curl`) : chaque page répond `200` et contient
le terme cité (`stream-json`, `setup-token`, `--merge`).

## Ce qui a été construit

- **`fixtures/trial-candidates/claude-code-20261126/candidate/`** : la
  sortie brute de l'agent (React et Vite, couche serveur Express 5).
- **`…/provenance/`** : `PROVENANCE.md` (outil, modèle, empreinte de la
  copie, coût et tokens, corrections, mesure, critère de repli), `prompt.md`
  et `brief.md` du kit à `2f457d7`, journaux expurgés avec leurs
  `.redaction.json`, et `measure/` (`measure.json`, `oracle.json`).
- **`tests/trial-candidates.test.ts`** : aucun fichier du dossier ne
  contient `/Users/` ni `/home/`, avec un témoin.
- **`scripts/redact-log.ts`** : `replacementsFor` et le marqueur
  `<CONTAINER_HOME>` pour le `$HOME` de l'image de l'agent, avec un test
  qui le garde aligné sur `CLAUDE_CONFIG_DIR` du Dockerfile.
- **`CLAUDE.md`, ADR 0010** : une PR de candidat d'essai se fusionne en merge
  commit. **`docs/candidat-essai.md`** : le nouveau marqueur.

## Les choix faits et pourquoi

- **Valeurs de `trial:copy` recalculées** plutôt que demandées : la sortie de
  Karim n'avait pas été gardée. `trial:copy` à `2f457d7` dans un dossier vide,
  puis `diff -r` avec son répertoire de travail : identiques. Cela prouve
  aussi que l'agent n'a pas touché `legacy-app/`.
- **Mesure lancée sur le commit de la sortie brute** (`cbaf6bd`), avant toute
  correction : aucune correction au contrat n'a été nécessaire.
- **`/home/node` remplacé par le script, pas à la main** (décision de Karim) :
  le remplacement à la main (`3e13586`) n'entrait dans aucune des deux
  sortes de corrections permises par l'ADR 0010. L'option d'exempter ce
  chemin dans le test a été écartée, car le test de la spec doit rester
  strict.
- **Merge commit** (décision de Karim) : le squash aurait fondu le commit de
  la sortie brute et les corrections en un seul, alors que la spec les veut
  séparés et que la provenance cite leurs SHA.

## Difficultés rencontrées

- **Test rouge sur `/home/node`** : les journaux contenaient le `$HOME` de
  l'image de l'agent (`memory_paths`, `shell-snapshots`), que l'expurgation
  ne visait pas. Résolu par le marqueur `<CONTAINER_HOME>`, puis une seconde
  expurgation par Karim, qui a produit des journaux identiques octet pour
  octet.
- **`PROVENANCE.md` faisait échouer son propre test** : la phrase qui disait
  « aucun `/Users/` » contenait le chemin interdit. Reformulée.
- **Un commit a embarqué `provenance/measure/` par erreur** (`git add` du
  dossier entier) ; refait avant toute poussée.
- **`dist/` absent de la sortie** alors que l'agent dit avoir construit :
  le journal montre qu'il l'a supprimé lui-même (ligne 192), comme
  `node_modules/` (ligne 197).

## Vérifier soi-même

```sh
npm test -- tests/trial-candidates.test.ts tests/legacy-copy/redact-log.test.ts
```

Observé sur `ad792d7` : `Tests  9 passed (9)`.

```sh
shasum -a 256 fixtures/trial-candidates/claude-code-20261126/provenance/*.jsonl
```

Observé : `545e8bf7…7591e5` pour `probe.jsonl`, `a19dc7eb…c74aee3` pour
`session.jsonl`, les valeurs de `PROVENANCE.md`.

```sh
git diff --stat cbaf6bd HEAD -- fixtures/trial-candidates/claude-code-20261126/candidate
```

Observé sur `ad792d7` : aucune sortie, le candidat mesuré est celui versionné.

```sh
npm run stack:up
npm run migrabench -- measure --candidate fixtures/trial-candidates/claude-code-20261126/candidate
```

Observé sur `cbaf6bd` (mesure
`20261126T160304Z-cbaf6bd-trial-candidates-claude-code-20261126-candidate`) :
`38 passed`, puis `Outcome: completed (ok)`.

## Pour aller plus loin

- La vague 2 de l'étape 4 (#134 à #138 : Lighthouse, bundle, `tsc`, audit,
  analyse statique) peut maintenant écrire ses fixtures sur ce candidat.
- #127 : un second candidat d'essai avec Gemini CLI, facultatif.
- Limite : la sonde 3a et les heures du lancement ne reposent que sur le
  relevé de Karim, leur sortie n'étant pas versionnée.
