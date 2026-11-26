# #156 · Exclure .claude/ du contexte de construction de la pile

## Objectif

Le contexte de construction de la pile est la racine du dépôt. Son empreinte
sert de label à chaque image (#102), et une mesure refuse une pile dont
l'empreinte ne correspond pas à la copie (`stack-not-from-this-copy`). Or
`.dockerignore` n'excluait pas `.claude/`, le dossier de Claude Code, qui
change sans cesse. Pendant #129, un fichier d'état de session y est apparu,
et quatre mesures locales ont été refusées. Ce ticket exclut le dossier
entier.

## Notions à connaître

- **Contexte de construction et `.dockerignore`** : Docker envoie au
  constructeur tous les fichiers du dossier de contexte, moins ceux que
  `.dockerignore` exclut. Le banc calcule son empreinte sur ce même ensemble
  (`contextDigest`, `oracle/stack-images.ts`). Un fichier qu'aucun `COPY` ne
  cite la change donc quand même. —
  [Docker, Build context](https://docs.docker.com/build/concepts/context/)

Lien ouvert le 2026-11-27 (`curl -L`) : il répond `200` et a une section
« .dockerignore files ».

## Ce qui a été construit

- **`.dockerignore`** : la ligne `.claude/settings.local.json` est remplacée
  par `.claude`, le dossier entier (réglages, hooks, skills et fichiers
  d'état des sessions).
- **`tests/oracle/stack-images.test.ts`** : deux tests qui partent du vrai
  `.dockerignore` du dépôt.
  - L'empreinte ne bouge pas quand des fichiers de `.claude/` changent ou
    apparaissent : `scheduled_tasks.lock`, `settings.json`,
    `settings.local.json` et un skill.
  - Le témoin : l'empreinte bouge pour un fichier hors de `.claude/`.

## Les choix faits et pourquoi

- **Le dossier entier**, plutôt que les seuls fichiers d'état (Karim).
  Aucune image n'a besoin de ce dossier. Une liste de fichiers serait à
  compléter à chaque nouvel outil de Claude Code.
- **Test sur le vrai `.dockerignore`**, plutôt qu'un `.dockerignore` écrit
  pour le test comme dans les tests existants. Un test sur un faux fichier ne
  prouverait pas que celui du dépôt exclut le dossier.

## Difficultés rencontrées

Aucune difficulté relevée pendant la session.

## Vérifier soi-même

```sh
npx vitest run tests/oracle/stack-images.test.ts
```

Avant la modification de `.dockerignore` (arbre de travail au-dessus du
commit `901d7a2`, test écrit) : `× does not change when a file of .claude/
changes or appears`, et `Tests  1 failed | 9 passed (10)`. Le témoin
passait déjà. Après : `Tests  10 passed (10)`.

```sh
node scripts/stack-context-env.ts; echo '{}' > .claude/probe.tmp; node scripts/stack-context-env.ts; rm .claude/probe.tmp
```

Observé sur le commit `ed39f64` : les deux sorties sont identiques (`cmp`),
avec `MB_LEGACY_CONTEXT_DIGEST=sha256:0805b779…7314` avant et après.

```sh
npm run stack:up && npm test
```

Observé sur le commit `ed39f64`, arbre propre : `Tests  1105 passed (1105)`.
`npm run typecheck` est vert sur le même commit.

En CI, sur la tête de la PR `023c1e9` :

- oracle, [exécution 45910518564](https://github.com/karAmmi12/migrabench/actions/runs/45910518564) :
  `Scenarios: 38, passed: 38, failed: 0, unreached: 0` ;
- `tests`, [exécution 45910518566](https://github.com/karAmmi12/migrabench/actions/runs/45910518566) : `Tests  1105 passed (1105)` ;
- `typecheck`, [exécution 45910518563](https://github.com/karAmmi12/migrabench/actions/runs/45910518563) : vert.

## Pour aller plus loin

- **#129** : la fiche `129-porte-xss-trois-ecrans.md` raconte l'incident qui
  a fait ouvrir ce ticket.
- **#102** : l'empreinte de contexte et le refus `stack-not-from-this-copy`.
- **Limite** : tout autre dossier d'outil local, à la racine et hors de
  `.dockerignore`, ferait de même bouger l'empreinte.
