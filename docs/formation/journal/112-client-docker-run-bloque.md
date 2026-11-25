# #112 · Délai de construction : le client docker run peut rester bloqué après le délai

## Objectif

La construction d'un candidat tourne sous un délai global. Pendant #74, une
mesure de diagnostic du candidat défectueux 4 (`never-ready`) est restée
954 s dans l'étape `fetch`, alors que son délai était de 48 970 ms (chiffres
de l'issue, mesure `20261125T001816Z-03d95f4-defective-candidates-never-ready`).
Au délai, le runner lançait `docker kill` sur le conteneur, en ignorant ses
échecs, puis attendait le client `docker run`. Or `docker kill` vise le
conteneur, pas ce client. Ce ticket fait tuer le client par le banc s'il ne rend pas la main, et
garde dans les bruts chaque essai de `docker kill`.

## Notions à connaître

- **Client `docker run` et conteneur** : `docker run` est un processus client
  qui demande au démon Docker de créer et de lancer un conteneur, puis attend
  sa fin. Ce sont deux choses distinctes. `docker kill` envoie un signal au
  conteneur ; le client, lui, peut rester en attente. —
  [Docker, docker container run](https://docs.docker.com/reference/cli/docker/container/run/),
  [Docker, docker container kill](https://docs.docker.com/reference/cli/docker/container/kill/)
- **`docker kill` sur un conteneur arrêté** : il échoue avec le code `1` et
  un message du démon. Relevé dans la session (client 28.3.3-rd, démon
  29.1.3) : `Error response from daemon: cannot kill container:
  migrabench-t-fetch: container f908…40c0 is not running`. Le démon cite le
  nom donné, puis l'identifiant du conteneur.
- **`AbortController` et `AbortSignal`** : l'API standard de Node pour
  annoncer qu'une opération doit être abandonnée. `abort()` déclenche
  l'événement `abort` du signal, et `AbortSignal.abort()` crée un signal déjà
  abandonné. —
  [Node.js, AbortController](https://nodejs.org/docs/latest-v22.x/api/globals.html#class-abortcontroller)
- **SIGKILL** : un signal qu'un processus ne peut ni ignorer ni intercepter,
  contrairement à SIGTERM. `subprocess.kill("SIGKILL")` arrête donc un
  processus qui a fait `trap '' TERM`. Un processus tué par un signal se
  ferme avec un code `null`, que `spawnCommand` rend comme `1`. —
  [Node.js, subprocess.kill](https://nodejs.org/docs/latest-v22.x/api/child_process.html#subprocesskillsignal)
- **Faux `docker` en tête du PATH** : la technique de test du runner sans
  Docker, déjà utilisée par `tests/runner/runner-errors.test.ts`. Un script
  nommé `docker`, placé dans un dossier ajouté au début du `PATH`, répond à la
  place de Docker. Node cherche la commande dans le `PATH` de l'environnement
  passé à `spawn`.

## Ce qui a été construit

- `shared/process.ts` : `spawnCommand` reçoit une option `abort` (un
  `AbortSignal`). Si le signal est abandonné, la commande est tuée par
  SIGKILL, et son code est rendu comme celui d'une commande en échec.
- `runner/build.ts`, fonction `runStep` :
  - au délai global, `docker kill` est lancé chaque seconde, comme avant ;
  - `BUILD_CLIENT_GRACE_MS` (5 000 ms) après le délai, si le client
    `docker run` n'a pas rendu la main, les essais de `docker kill` cessent
    et le client est tué par l'option `abort` ;
  - chaque essai de `docker kill`, avec son code et sa sortie, et la mise à
    mort du client sont notés, datés, dans le brut `<étape>-timeout.log`.
    Son empreinte entre dans `raw` seulement si le délai a expiré ;
  - quand l'étape rend la main, les `docker kill` encore en cours sont
    arrêtés, puis le conteneur est supprimé par `docker rm --force`, même si
    l'écriture du journal a échoué.
- `runner/build-outcome.ts` : `BuildStepRun` reçoit `clientKilled`. Quand le
  conteneur n'a jamais démarré, ou n'a pas pu être inspecté, le détail dit
  que le client `docker run` a été tué après le délai de construction, au
  lieu d'un code de sortie qui ne dit rien. La catégorie reste celle de #68.
- `docs/specs/03-candidate-runner.md` : un paragraphe « Précisé par #112 »
  dans « Exécution du candidat ».
- Tests :
  - `tests/runner/build-timeout.test.ts` : `buildCandidate` avec un faux
    `docker`, dans deux cas. Dans le premier, le client ne rend jamais la
    main et `docker kill` échoue ; dans le second, `docker kill` réussit ;
  - `tests/runner/build-outcome.test.ts` : les deux détails du client tué ;
  - `tests/process.test.ts` : l'option `abort`, testée directement.
- Ticket séparé #118 (`needs-triage`) : `docker inspect` et
  `docker rm --force` restent sans limite de temps si le démon bloque.

## Les choix faits et pourquoi

- **Tuer le client après une grâce, pas au délai même.** Écarté : tuer le
  client dès le délai. Retenu : laisser 5 s à `docker kill`. Tuer le client
  avant que le conteneur ait démarré donne une étape `never-started` ou
  `inspectFailed`, rangée en erreur du runner (#68) et non en
  `build-timeout`. La grâce rend ce cas rare. La valeur de 5 s est un
  paramètre déclaré du banc, pas une mesure.
- **SIGKILL plutôt que SIGTERM pour le client.** Le client bloqué du constat
  n'a pas rendu la main ; on ne peut pas compter sur lui pour traiter
  SIGTERM. Le faux `docker` du test ignore d'ailleurs SIGTERM.
- **Un brut par étape, `<étape>-timeout.log`, plutôt qu'un champ de
  `measure.json`.** Les sorties de `docker kill` sont des traces brutes, comme
  `fetch.log` ; le fichier est cité par son empreinte dans `raw`. Il n'existe
  que si le délai a expiré, ce qui évite un fichier vide à chaque mesure.
- **Arrêter les `docker kill` en cours à la fin de l'étape.** La première
  version attendait leur fin dans le `finally`. La revue de spec a relevé
  qu'un `docker kill` bloqué aurait alors bloqué la construction, soit le
  défaut du ticket déplacé ailleurs. Ils sont donc lancés avec l'option
  `abort`, et notés `stopped: the step had returned`.
- **Le détail du client tué, dans la catégorie de #68.** Écarté : laisser
  « docker run exited with code 1 », faux puisque le code vient de
  `code ?? 1` après SIGKILL. Écarté aussi : classer ce cas en
  `build-timeout`. Retenu, sur décision de Karim : le détail dit ce qui
  s'est passé, et la catégorie reste celle de #68.
- **Démon Docker bloqué : hors de ce ticket.** Sur décision de Karim, le cas
  part dans #118. En CI, le `timeout-minutes` du job borne déjà le run.

## Difficultés rencontrées

- **Le test rouge bloquait au lieu d'échouer sur une assertion.**
  - *Symptôme* : le premier cas de `tests/runner/build-timeout.test.ts` a
    dépassé ses 20 s.
  - *Cause* : c'est le défaut lui-même. Le faux client `docker run`
    (`trap '' TERM INT; exec sleep 60`) ne rendait jamais la main, et
    `docker kill` échouait.
  - *Résolution* : la correction le fait finir en 5,74 s. `exec` compte : sans
    lui, `sleep` serait un processus enfant qui garderait la sortie ouverte
    après la mort du shell, et `close` n'arriverait pas.
- **Le message de `docker kill` du faux `docker` était écrit de mémoire.**
  - *Symptôme* : la première version citait le nom du conteneur deux fois.
  - *Cause* : un message imaginé. La revue des normes l'a relevé, et Karim a
    demandé d'appliquer la règle des fixtures de `CLAUDE.md`.
  - *Résolution* : `docker kill` lancé sur un vrai conteneur arrêté. Le vrai
    message cite l'identifiant du conteneur, pas son nom. Il est copié tel
    quel, avec la commande et les versions de Docker en commentaire.
- **L'option `abort` n'avait pas eu de test rouge à elle.**
  - *Symptôme* : la revue des normes a relevé qu'elle n'était testée qu'à
    travers `buildCandidate`.
  - *Résolution* : `tests/process.test.ts` a été écrit après coup. Pour
    obtenir un vrai rouge, le câblage de l'option a été désactivé
    (`const stop = () => undefined;`). Trois tests sur quatre ont alors
    échoué par dépassement de 10 s, puis le fichier a été restauré : 4 tests
    passent.
- **Quatre échecs de `tests/seam-a/stack-images.test.ts` dans la suite
  complète.**
  - *Cause* : la pile Docker locale n'avait pas été reconstruite depuis
    cette copie. Les mêmes échecs apparaissaient sans les changements du
    ticket (`git stash`).
  - *Résolution* : `npm run stack:up`, puis `npm test` au commit `1f5f10a`,
    arbre propre : `Test Files 82 passed (82)`, `Tests 732 passed (732)`.
- **`gh issue create` a d'abord échoué** avec une erreur GraphQL de GitHub
  (« Something went wrong while executing your query »). Aucune issue
  n'avait été créée (`gh issue list` vide). La seconde tentative a créé #118.

## Vérifier soi-même

Observé au commit `1f5f10a`, arbre propre, sous macOS avec Docker Desktop.

```sh
npx vitest run tests/runner/build-timeout.test.ts
```

Attendu : `Tests  2 passed (2)`, `Duration  5.74s`. La durée vient surtout
de la grâce de 5 s du premier cas.

```sh
npx vitest run tests/runner/build-outcome.test.ts
```

Attendu : `Tests  16 passed (16)`.

```sh
npx vitest run tests/process.test.ts
```

Attendu : `Tests  4 passed (4)`.

```sh
docker run --name migrabench-t-fetch migrabench-runtime true
docker kill migrabench-t-fetch; echo "exit=$?"
docker rm migrabench-t-fetch
```

Attendu : `Error response from daemon: cannot kill container:
migrabench-t-fetch: container <identifiant> is not running`, puis `exit=1`.

```sh
npm run stack:up && npm test
```

Attendu : `Test Files  82 passed (82)`, `Tests  732 passed (732)`.

En CI, sur la PR #119 : [« Tests du banc », exécution 45652302699](https://github.com/karAmmi12/migrabench/actions/runs/45652302699),
head SHA `d88d29f`, verte, de 16:16:52Z à 16:20:54Z (4 min 2 s) :
`Test Files  82 passed (82)`, `Tests  732 passed (732)`.

## Pour aller plus loin

- #118 : borner `docker inspect` et `docker rm --force` si le démon Docker
  bloque.
- Le blocage du constat n'a pas été reproduit avec le vrai Docker. Une
  mesure de diagnostic de `never-ready` qui en reproduirait un montrerait
  dans `fetch-timeout.log` si `docker kill` échouait (« is not running »).
- ADR 0007 (exécution du candidat) et la spec de l'étape 3, « Exécution du
  candidat », pour le reste de la construction.
