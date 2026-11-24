# #71 · Étape 3 · Mesure interrompue

## Objectif

Avant ce ticket, un Ctrl+C ou un `SIGTERM` pendant `migrabench measure`
tuait le runner. Aucun `measure.json` n'était écrit : la mesure disparaissait,
et c'était un moyen d'écarter une mesure qui tourne mal. Le ticket fait
d'une interruption une mesure conservée, invalide pour la cause
`interrupted`, avec le code de sortie `3`. Il exige aussi que le candidat
soit arrêté et que le verrou du banc soit libéré, quelle que soit la phase
où le signal arrive.

## Notions à connaître

- **Signaux et gestionnaires de Node** : `process.on("SIGINT", …)` remplace
  le comportement par défaut (sortir). Tant que le gestionnaire est posé, le
  processus ne meurt plus sur ce signal et doit sortir de lui-même. —
  [Node 22, Signal events](https://nodejs.org/docs/latest-v22.x/api/process.html#signal-events)
- **`AsyncLocalStorage`** : une valeur attachée à une chaîne d'appels
  asynchrones. Elle est vue par tout ce que cette chaîne lance, y compris
  ses rappels et ses minuteries, et pas par le reste du programme. Le banc
  s'en sert pour savoir si une commande est lancée par une phase
  interrompue. —
  [Node 22, Class: AsyncLocalStorage](https://nodejs.org/docs/latest-v22.x/api/async_context.html#class-asynclocalstorage)
- **Groupe de processus** : `spawn(…, { detached: true })` fait de l'enfant
  le chef d'un nouveau groupe (déjà vu en #94). Un signal envoyé à `-pgid`
  atteint tout le groupe, même les processus que l'enfant a lancés : « If pid
  is less than -1, then sig is sent to every process in the process group
  whose ID is -pid. » —
  [Node 22, options.detached](https://nodejs.org/docs/latest-v22.x/api/child_process.html#optionsdetached),
  [kill(2), man7.org](https://man7.org/linux/man-pages/man2/kill.2.html)
  (page de manuel Linux ; macOS suit la même règle POSIX).
- **Shell et signaux** : un shell non interactif ne relaie pas un signal à
  la commande qu'il attend. Les commandes qu'il lance en arrière-plan
  ignorent `SIGINT` : « When job control is not in effect, asynchronous
  commands ignore SIGINT and SIGQUIT in addition to these inherited
  handlers. » —
  [Bash Reference Manual, Signals](https://www.gnu.org/software/bash/manual/html_node/Signals.html)
- **Annulation d'un job de GitHub Actions** : le runner envoie `SIGINT` au
  processus d'entrée de l'étape. S'il n'est pas sorti 7 500 ms plus tard, il
  envoie `SIGTERM`, puis tue l'arbre de processus 2 500 ms après. —
  [Workflow cancellation reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation)
- **Renommage atomique** : écrire dans un fichier temporaire, puis le
  renommer. Un lecteur voit soit l'ancien état, soit le fichier complet,
  jamais un fichier à moitié écrit. —
  [Node 22, fsPromises.rename](https://nodejs.org/docs/latest-v22.x/api/fs.html#fspromisesrenameoldpath-newpath)

Liens ouverts le 2026-11-24 (`curl`) : chaque page répond `200`. Les ancres
`class-asynclocalstorage`, `processkillpid-signal` et
`fspromisesrenameoldpath-newpath` existent. Les phrases citées de kill(2) et
du manuel de Bash figurent sur leur page. La phrase de GitHub a été lue sur
sa page pendant la session.

## Ce qui a été construit

- **`runner/interruption.ts`**, nouveau : guette `SIGINT` et `SIGTERM`
  pendant la mesure. Il donne le premier signal reçu et une promesse
  `cutShort`. Celle-ci se résout au second signal, ou 5 000 ms après le
  premier : c'est l'échéance de `measure.json`. Le même signal reçu moins
  d'une seconde après le premier est ignoré.
- **`shared/process.ts`** : `interruptibleCommands(run)` crée une portée de
  commandes pour une tâche :
  - `interrupt(signal)` relaie le signal aux commandes en cours et refuse
    toute commande lancée ensuite par la tâche ;
  - `kill()` arrête par `SIGKILL` ce qui reste ;
  - une commande lancée avec `processGroup: true` dans une portée a son
    propre groupe de processus, arrêté en entier.
- **`runner/measure.ts`** :
  - les phases 1 à 6 tournent dans une portée de commandes. Au signal, la
    phase en cours est fermée `interrupted` (preuve `Interrupted by <signal>`)
    et le suivi des phases n'accepte plus rien d'elles ;
  - les phases ont 2 secondes pour finir, puis ce qui reste est tué ;
  - la clôture tourne dans sa propre portée et rend son résultat au lieu de
    modifier la mesure. Abrégée par l'échéance ou le second signal, elle est
    fermée `interrupted` avec la raison, et `measure.json` est écrit
    aussitôt ;
  - le résultat de l'oracle n'est promu en `oracle.json` que dans un bloc
    synchrone, si aucun signal n'est arrivé ;
  - `measure.json` est écrit dans `measure.json.partial`, puis renommé.
- **`oracle/execute.ts`** : Playwright est lancé avec `processGroup: true`.
  Hors du runner (`npm run oracle`), l'option est sans effet : Ctrl+C doit
  l'atteindre par le groupe de premier plan.
- **`runner/build.ts`**, **`runner/build-outcome.ts`** :
  - `removeBuildContainers` supprime les conteneurs `fetch`, `install` et
    `build` d'une mesure ;
  - `BUILD_STEPS` est la liste des étapes, d'où se tire le type `BuildStep` ;
  - le `docker kill` du délai de construction ignore un refus, pour ne pas
    faire planter Node par un rejet non traité.
- **`runner/candidate-runtime.ts`** :
  - `stopCandidate(service, { immediately })` tue le candidat sans attendre
    son délai d'arrêt ;
  - `removeCandidate` le supprime sans relire ses sorties, pour le nettoyage
    qui suit une clôture abrégée.
- **`tests/runner/interrupted-measure.test.ts`**, nouveau, avec son groupe
  dans `vitest.config.ts` : de vraies mesures, de vrais signaux, sous deux
  jeux de faux outils.
  - `fake` : faux `docker` complet. Il couvre la construction, le
    démarrage, la clôture, l'échéance et le second signal.
  - `oracle` : faux `docker` qui laisse passer à Docker les lectures de la
    pile, et faux `npx` qui joue Playwright. Il couvre la phase de l'oracle.
- **`docs/specs/03-candidate-runner.md`** : la règle `interrupted` décrit
  la mise en œuvre.

## Les choix faits et pourquoi

- **Refuser les commandes d'une phase interrompue, plutôt que d'attendre sa
  fin.** Une phase interrompue continue de tourner en JavaScript : sans
  barrière, elle pourrait démarrer le candidat après sa suppression par la
  clôture. La portée de commandes (`AsyncLocalStorage`) refuse ses
  commandes, mais pas celles de la clôture. L'option écartée, passer un
  `AbortSignal` à chaque appel, aurait touché tous les appels de Docker et
  de Playwright du banc.
- **Résultat de l'oracle figé dans un bloc synchrone.** Un gestionnaire de
  signal de Node ne s'exécute pas au milieu de code synchrone. La
  vérification « pas de signal », le renommage en `oracle.json` et
  l'affectation du résultat se font donc sans `await` entre eux. Le résultat
  collecté d'un oracle interrompu reste dans les bruts (`oracle-result.json`).
- **5 000 ms pour écrire `measure.json`.** GitHub envoie `SIGTERM` 7 500 ms
  après `SIGINT` (voir les notions). 5 000 ms laissent 2 500 ms de marge. La
  grâce des phases interrompues passe de 10 s (premier commit) à 2 s : la
  relecture a montré que 10 s, plus la clôture, dépassaient ce budget.
- **Doublon d'un seul Ctrl+C.** Sous `npm run`, un Ctrl+C arrive deux fois
  au runner : du terminal, puis du relais de npm (#94). Compté comme second
  signal, il aurait abrégé chaque Ctrl+C. Le même signal reçu moins d'une
  seconde après le premier est donc ignoré. Un `SIGTERM` après un `SIGINT`,
  comme celui de GitHub, compte toujours.
- **Une liste des scénarios dans son propre dossier, `oracle-list/`.** La
  liste est lancée seulement quand l'oracle n'a pas rendu de résultat. Elle
  allait dans le dossier de l'oracle et y déposait son `list.json`. Option
  écartée : la lancer ailleurs seulement si l'oracle avait été lancé. Une
  seule règle est plus simple.
- **Playwright dans son propre groupe, seulement sous le runner.** Le
  runner relaie le signal au groupe. `npm run oracle`, qui ne relaie rien,
  garde Playwright dans le groupe de premier plan, sinon Ctrl+C ne
  l'atteindrait plus. Ce choix remplace le `process.exit` du premier commit,
  qui laissait vivre les enfants de Playwright.
- **Preuve de l'oracle sur la vraie pile, faite à la main.** Une vraie
  mesure dans Vitest recréerait la pile avec un autre sel au milieu de la
  suite. Le cas sur la vraie pile est confié au job de CI de #74 :
  [commentaire sur #74](https://github.com/karAmmi12/migrabench/issues/74#issuecomment-7146389526).

## Difficultés rencontrées

- **Première preuve réelle : `stack-not-from-this-copy`.** Symptôme : la
  mesure s'arrête seule en préparation, et la sonde attend Playwright
  pendant 600 s. Cause : les images de la pile ne portaient pas l'empreinte
  de la copie. Résolution : `npm run stack:up`, puis une sonde qui s'arrête
  si la mesure sort seule.
- **Le même incident dans le test de l'oracle.** Symptôme : la mesure du
  faux `oracle` rend `invalid (stack-not-from-this-copy)`. Cause : le
  contexte de construction de la pile est tout le dépôt (#102). Chaque
  fichier modifié change donc l'empreinte, et il faudrait relancer
  `stack:up` après chaque modification. Résolution : le faux `docker` rend
  lui-même le label de la copie pour les images et les conteneurs de la
  pile.
- **Clôture interrompue après une panne : mauvaise issue de départ.**
  Symptôme : `start:stack-failed-before-candidate` au lieu de
  `stack-down-while-candidate`. Cause : avec la recréation de la pile en
  échec, l'état relevé par le faux `docker` la disait malade, ce qui est
  déjà invalide. Le test ne montrait donc pas que l'interruption passe
  devant une issue valide. Résolution : le relevé de l'état échoue aussi
  (`compose [up][ps] *`), comme dans `runner-errors.test.ts`.
- **Test des bruts partiels vert du premier coup.** `playwright test --list`
  ne vide pas le dossier de l'oracle, mais y dépose `list.json`. Résolution :
  le test exige que ce dossier ne contienne que `partial-raw.txt` et
  `report.json`. Il est alors passé au rouge.
- **TypeScript et la raison de l'abrègement.** `exactOptionalPropertyTypes`
  refusait `detail: cutShort` : TypeScript gardait le rétrécissement
  `undefined` après un `await`. Résolution : la course rend directement la
  raison (une chaîne) ou le résultat de la clôture.
- **Le shell relaie-t-il le signal ?** Un premier essai,
  `bash -e -c 'node …'`, montrait `node` recevant `SIGINT`. Bash lance
  pourtant une commande unique de `-c` par `exec`. Avec deux commandes,
  `node` ne reçoit rien (« node received nothing »). Le commentaire sur #74
  a été corrigé en conséquence.
- **Relecture du premier commit.** Elle a relevé :
  - le budget de l'annulation de GitHub dépassé ;
  - un résultat de l'oracle qui dépendait du timing ;
  - `listOracle` lancée dans le dossier d'un oracle lancé ;
  - des processus de Playwright qui survivaient à `process.exit`.

  Le second commit (`aa0272a`) corrige ces quatre points, chacun avec son
  test.

## Vérifier soi-même

Les tests de l'interruption, sous faux outils (la pile doit tourner pour le
jeu `oracle`, qui lit ses conteneurs) :

```sh
npx vitest run tests/runner/interrupted-measure.test.ts
# Tests  8 passed (8)
```

La suite complète et le typecheck, avec la pile reconstruite depuis la copie :

```sh
npm run stack:up && npm run typecheck && npm test
# Test Files  79 passed (79)
#      Tests  683 passed | 1 skipped (684)
```

Une mesure réelle interrompue pendant l'oracle. Lancer la mesure, attendre
que `.oracle-artifacts/<identifiant>/oracle-playwright.log` contienne
`Running`, puis envoyer `SIGINT` au PID de `node` :

```sh
node runner/cli.ts measure --candidate fixtures/reference-candidate &
# … une fois Playwright lancé :
kill -INT <PID de node>; wait <PID de node>; echo "exit=$?"
# exit=3 after 1155 ms
# Outcome: invalid (interrupted)
```

Sur la mesure observée (`20261124T223230Z-d6f2e32-reference-candidate`) :

```sh
node -e 'const r=require("./results/diagnostic/<identifiant>/measure.json");console.log(JSON.stringify(r.verdict));for(const p of r.phases)console.log(p.name,p.outcome,p.durationMs)'
# {"category":"invalid","reason":"interrupted","evidence":"Interrupted by SIGINT"}
# start ok 5897
# oracle interrupted 1565
# gates not-run 0
# closing ok 1004
docker ps -a --filter label=com.docker.compose.service=candidate --format '{{.Names}}'
# (vide)
pgrep -f 'playwright test'
# (vide)
```

Le dossier des bruts garde `oracle/` (bruts partiels) et `oracle-list/`
(liste des scénarios) séparés, et le dossier de la mesure ne contient que
`measure.json`. Penser à relancer `npm run stack:up` ensuite : la mesure
laisse la pile avec son sel.

Une mesure lancée aussitôt après, interrompue par `SIGTERM` pendant la
construction, sur l'état du premier commit avant sa création
(`20261124T221757Z-de19857-reference-candidate`) :

```text
exit=3
{"category":"invalid","reason":"interrupted","evidence":"Interrupted by SIGTERM"}
preparation:ok contract:ok build:interrupted start:not-run oracle:not-run gates:not-run closing:ok
```

Dans la CI de la PR #107, sous Linux, au head SHA `0b81f54`
([tests, exécution 45502579313](https://github.com/karAmmi12/migrabench/actions/runs/45502579313),
de 22:36:55Z à 22:41:00Z) :

```text
✓  interrupted  tests/runner/interrupted-measure.test.ts (8 tests) 35850ms
Test Files  79 passed (79)
     Tests  683 passed | 1 skipped (684)
```

## Pour aller plus loin

- **#74** : le job de CI des mesures couvre la mesure interrompue pendant
  l'oracle sur la vraie pile. Une étape qui doit rester interruptible par
  l'annulation du job se lance avec `exec`.
- **Limite connue** : un signal reçu après la fermeture de la clôture,
  pendant l'écriture de `measure.json`, est ignoré. La mesure garde l'issue
  déjà écrite. `SIGKILL` arrête le runner sans mesure et laisse un verrou du
  banc orphelin, repris par le prochain outil du banc.
- **`migrabench calibrate`** n'a pas encore de mesure interrompue : une
  interruption y garde son effet par défaut.
- **ADR 0005**, conservation des résultats bruts : le résultat collecté
  d'un oracle interrompu (`oracle-result.json`) et ses bruts partiels
  restent dans `.oracle-artifacts/`, jamais cités par la mesure.
