# #92 · Verrou du banc : un verrou pris dans un worktree n'est pas vu depuis un autre

## Objectif

Le verrou du banc empêche deux outils du banc de partager la pile. Jusqu'ici,
son fichier `.bench-lock` était à la racine de la copie du dépôt qui exécutait
le code. Or la pile est commune à toute la machine : le projet Compose
s'appelle toujours `migrabench`, et les ports de l'hôte sont fixes. Deux
worktrees, par exemple `migrabench` et `../migrabench-70`, pouvaient donc
recréer la même pile en même temps, sans aucun refus. Le ticket place le
verrou du banc dans le dossier d'état de l'utilisateur, le même pour toutes
les copies du dépôt.

## Notions à connaître

- **Worktree Git** : un même dépôt peut avoir plusieurs copies de travail,
  chacune sur sa branche, qui partagent l'historique. Chaque worktree a ses
  propres fichiers, donc son propre `shared/bench-lock.ts`. —
  [git-worktree, Description](https://git-scm.com/docs/git-worktree#_description)
- **Nom de projet Compose** : Compose nomme les conteneurs et les réseaux
  d'après le nom du projet. Le champ `name:` de `docker-compose.yml` le fixe
  quel que soit le dossier. Ici, `name: migrabench` : toutes les copies du
  dépôt pilotent la même pile. —
  [Docker, Specify a project name](https://docs.docker.com/compose/how-tos/project-name/)
- **Dossier d'état XDG** : la spécification XDG Base Directory range les
  fichiers d'état d'un programme, qui doivent survivre à un redémarrage sans
  être des données ni du cache, sous `$XDG_STATE_HOME`. Si la variable est
  absente ou vide, le dossier par défaut est `$HOME/.local/state`. La
  spécification dit aussi : « All paths set in these environment variables
  must be absolute. If an implementation encounters a relative path in any of
  these variables it should consider the path invalid and ignore it. » —
  [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/latest/)
- **`os.homedir()` et `path.isAbsolute()` de Node** : le premier rend le
  dossier personnel, lu dans `HOME` sur macOS et Linux. C'est ce qui permet
  aux tests de le remplacer par un dossier temporaire. Le second dit si un
  chemin est absolu. —
  [Node 22, os.homedir()](https://nodejs.org/docs/latest-v22.x/api/os.html#oshomedir),
  [Node 22, path.isAbsolute()](https://nodejs.org/docs/latest-v22.x/api/path.html#pathisabsolutepath)

Liens ouverts le 2026-11-24 (`curl`) : chaque page répond `200`. Les ancres
`_description`, `oshomedir` et `pathisabsolutepath` existent, et la phrase
citée de la spécification XDG figure sur sa page.

## Ce qui a été construit

- **`shared/bench-lock.ts`** :
  - `BENCH_LOCK_FILE` vaut `$XDG_STATE_HOME/migrabench/bench-lock` quand
    `XDG_STATE_HOME` est un chemin absolu, sinon
    `~/.local/state/migrabench/bench-lock`. Il ne dépend plus de
    l'emplacement du module.
  - `acquireBenchLock` crée le dossier s'il manque. `inspectBenchLock`, utilisé
    par `pretest`, ne crée rien : un dossier absent veut dire que le verrou du
    banc est libre.
  - La garde de reprise reste `<verrou du banc>.takeover`, donc dans le même
    dossier.
  - Chaque refus se termine par la ligne `Bench lock: <chemin>`
    (`benchLockPathLine`), puisque le fichier est hors du dépôt.
- **`scripts/check-bench-lock.ts`** (`pretest`) : le refus de `npm test`
  donne aussi cette ligne.
- **`tests/bench-lock.test.ts`** : 19 tests, contre 13 avant.
  - Deux copies du module, comme deux worktrees, se refusent dans les deux
    sens.
  - L'emplacement : `XDG_STATE_HOME` absolu ; absent ; relatif ou vide, donc
    ignoré.
  - Le dossier créé à la prise, et la garde de reprise dans le même dossier.
  - Les tests de `pretest` sont adaptés.
  - Tous ces tests lancent de vrais processus Node sous un `HOME` et un
    `XDG_STATE_HOME` temporaires : ils ne touchent jamais au vrai dossier
    d'état.
- **`tests/runner/bench-lock-tools.test.ts`** : les outils du banc testés sous
  le faux `docker` prennent leur verrou du banc dans un `XDG_STATE_HOME`
  temporaire, supprimé à la fin du fichier.
- **`.gitignore`** : les entrées `.bench-lock` et `.bench-lock.*` sont
  retirées, car le fichier n'est plus dans le dépôt.
- **`README.md`**, **spec de l'étape 3** (« Verrou du banc ») et en-tête de
  `shared/bench-lock.ts` : le nouvel emplacement et sa raison.

## Les choix faits et pourquoi

- **Dossier d'état de l'utilisateur**, décision validée par Karim le 24/11.
  - Le dossier Git commun aux worktrees est écarté : il ne couvre pas deux
    clones séparés, et il obligerait le module à lancer `git`.
  - Le dossier de cache (`~/.cache/migrabench/`), première proposition, est
    écarté par Karim au profit du dossier d'état.
- **Un `XDG_STATE_HOME` relatif est ignoré**, ajouté par Karim d'après la
  spécification XDG. Un chemin relatif ferait dépendre le verrou du banc du
  dossier courant, c'est-à-dire de la copie du dépôt : le défaut corrigé
  reviendrait.
- **La garde de reprise suit le verrou du banc**, avec un test, ajouté par
  Karim. Sinon, deux worktrees pourraient encore se disputer une reprise.
- **Le test des deux copies dans les deux sens**, ajouté par Karim : un
  détenteur dans A refuse une prise depuis B, et l'inverse.
- **Un verrou du banc temporaire pour `bench-lock-tools.test.ts`**, choix de
  Karim parmi deux options. Avec le vrai verrou du banc, désormais commun à la
  machine, deux `npm test` lancés dans deux worktrees se seraient refusés l'un
  l'autre. Le vrai emplacement reste couvert par les tests de
  `tests/bench-lock.test.ts`. Le `beforeEach` qui exigeait un verrou du banc
  libre sur la machine n'a plus de raison d'être et a été retiré.
- **Une ligne `Bench lock: <chemin>` à la fin de chaque refus**, plutôt que
  de modifier `heldMessage`, que `pretest` et la mesure réutilisent dans
  d'autres phrases.
- **Entrées `.gitignore` retirées plutôt que gardées.** Un ancien
  `.bench-lock` laissé à la racine d'une copie du dépôt apparaît alors comme
  fichier non suivi. C'est un signal pour le supprimer : il ne protège plus
  rien.

## Difficultés rencontrées

- **Le test rouge, avant la correction.**
  - Symptôme : au commit `1b46e37` (le test seul, sur `main` `29e779b`),
    `npx vitest run tests/bench-lock.test.ts -t "shared by every copy"` échoue
    dans les deux sens :

    ```text
    × refuses a bench tool of copy B while a bench tool of copy A holds it
    × refuses a bench tool of copy A while a bench tool of copy B holds it
    AssertionError: expected +0 to be 4 // Object.is equality
     ❯ tests/bench-lock.test.ts:225:28
    Tests  2 failed | 13 skipped (15)
    ```

  - Cause : la seconde copie prend son propre `.bench-lock`, à sa racine, et
    se termine avec le code `0` au lieu d'être refusée (`4`).
  - Résolution : `f2251e1`. Les deux tests passent.
- **Les tests d'emplacement n'ont jamais été rouges.**
  - Symptôme : écrits après la correction, ils sont passés du premier coup.
  - Cause : la tranche précédente avait déjà écrit le code qu'ils couvrent.
  - Résolution : deux mutations temporaires du module, annulées ensuite :
    - accepter un `XDG_STATE_HOME` relatif fait échouer « lies in
      ~/.local/state/migrabench/ when XDG_STATE_HOME is not an absolute
      path » ;
    - placer la garde de reprise dans le dossier courant fait échouer « keeps
      its takeover guard next to it, in the same directory ».
- **Une assertion de `pretest` passait pour une mauvaise raison.**
  - Symptôme : `expect(outcome.stderr).toContain(file)` passait avant toute
    modification de `scripts/check-bench-lock.ts`.
  - Cause : le message cite la ligne de commande du détenteur,
    `node hold.ts <fichier> measure …`, qui contient déjà le chemin.
  - Résolution : exiger la ligne `Bench lock: <chemin>`. Le test est alors
    devenu rouge, avec aussi les deux tests des copies, puis vert après
    l'ajout de la ligne.
- **Le faux `docker` cherchait le verrou du banc à la racine.**
  - Symptôme : à la lecture de `bench-lock-tools.test.ts`, le faux `docker`
    notait `test -f .bench-lock`, relatif au dossier courant.
  - Cause : le chemin était écrit en dur pour l'ancien emplacement.
  - Résolution : il teste maintenant le chemin du verrou du banc temporaire.
- **Relecture : période de transition.** Une copie du dépôt restée sur un
  code antérieur à #92 prend toujours `<racine>/.bench-lock`. Elle ne voit pas
  le nouveau verrou du banc, et il ne la voit pas. Chaque copie doit intégrer
  `main` après la fusion, y compris le worktree `migrabench-70`.

## Vérifier soi-même

```sh
npx vitest run tests/bench-lock.test.ts
```

Observé sur `942c9a8` : `Tests  19 passed (19)`.

```sh
npm test
```

Observé sur `942c9a8` : `Test Files  60 passed (60)`, `Tests  501 passed (501)`.

**De bout en bout, avec Docker**, sur `40649ac`, avec un worktree temporaire
`../mb-92-check` du même commit (`git worktree add`), retiré ensuite :

1. Dans le dossier principal, `npm run migrabench -- measure --candidate
   fixtures/reference-candidate`. Pendant la mesure, dans le worktree,
   `node oracle/cli.ts` puis `node scripts/check-bench-lock.ts` :

   ```text
   oracle from worktree exit=4
   refused-lock: The bench lock is held by measure (PID 92770 on …, … measure 20261124T133844Z-40649ac-reference-candidate), taken at 2026-11-24T13:38:44.745Z
   Bench lock: /Users/…/.local/state/migrabench/bench-lock
   npm test refused: The bench lock is held by measure (PID 92770 …).
   pretest from worktree exit=4
   ```

   La mesure se termine : `Outcome: completed (ok)`, `measure exit=0`.
2. Dans le worktree, `node oracle/cli.ts`. Pendant l'oracle, dans le dossier
   principal, la même mesure :

   ```text
   refused-lock: The bench lock is held by oracle (PID 93863 …: node oracle/cli.ts), taken at 2026-11-24T13:39:08.547Z
   Bench lock: /Users/…/.local/state/migrabench/bench-lock
   measure from main exit=4
   ```

   L'oracle se termine : `Scenarios: 38, passed: 38, failed: 0, unreached: 0`.
   Ensuite, `npm run stack:up` remet la pile au sel de développement.

**Sur la CI de la PR** (workflow « Tests du banc », job `tests`, avec la
pile) : [exécution 45409105683](https://github.com/karAmmi12/migrabench/actions/runs/45409105683),
tête `31b5022`. Le `pretest` passe, puis :

```text
✓  bench-tools  tests/runner/bench-lock-tools.test.ts (6 tests)
✓  default  tests/bench-lock.test.ts (19 tests)
Test Files  60 passed (60)
     Tests  501 passed (501)
```

## Pour aller plus loin

- **#94** : `npm test` vérifie le verrou du banc mais ne le tient pas
  (voir « Hors étape »).
- **#73** : la mesure qui compte, qui s'appuie sur ce verrou du banc.
- Fiche [`69-verrou-du-banc.md`](69-verrou-du-banc.md) : prise, refus et
  reprise du verrou du banc. Les chemins `.bench-lock` qu'elle cite sont ceux
  d'avant #92.

## Hors étape

- **`npm test` ne tient pas le verrou du banc pendant qu'il utilise la vraie
  pile** (relevé par Karim pendant ce ticket, hors de son périmètre). `pretest`
  vérifie le verrou du banc au démarrage, puis `vitest run` tourne sans le
  tenir. Une mesure, une exécution complète de l'oracle ou `npm run stack:up`
  lancés ailleurs pendant un `npm test` ne sont donc pas refusés. La spec de
  l'étape 3 note déjà cette limite pour la mesure (« Limite connue, jusqu'à
  #67 »). #67 rendra une telle mesure invalide après coup, sans la refuser ni
  protéger les tests du Seam A. Issue ouverte : #94 (`needs-triage`).
