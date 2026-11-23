# #69 · Étape 3 · Verrou du banc

## Objectif

Le banc a trois outils qui recréent la pile : `migrabench measure`,
`npm run oracle` et `npm run stack:up`. Lancés en même temps, ils
redémarreraient le legacy l'un sous l'autre, et une mesure deviendrait fausse
sans que rien ne le dise. Ce ticket ajoute le verrou du banc. C'est un
fichier que chaque outil prend pour toute sa durée et que `pretest` vérifie
avant `npm test`. Un refus nomme le détenteur. Un verrou du banc laissé par
un processus mort est repris, sans jamais déposséder un détenteur vivant.

## Notions à connaître

- **Création exclusive d'un fichier** : avec le drapeau `wx`, l'ouverture
  échoue (`EEXIST`) si le fichier existe déjà. Un lien dur (`link`) vers un
  nom déjà pris échoue de la même façon, et le fichier apparaît d'un coup,
  complet. —
  [Node.js 22 : File system flags](https://nodejs.org/docs/latest-v22.x/api/fs.html#file-system-flags) ;
  [Node.js 22 : fs.linkSync](https://nodejs.org/docs/latest-v22.x/api/fs.html#fslinksyncexistingpath-newpath) ;
  [man7 : link(2)](https://man7.org/linux/man-pages/man2/link.2.html)
- **Identité d'un processus** : un PID peut être réattribué à un nouveau
  processus après la mort de l'ancien. L'heure de démarrage (`lstart`) et la
  ligne de commande (`args`) que donne `ps` distinguent l'ancien du nouveau. —
  [man7 : ps(1)](https://man7.org/linux/man-pages/man1/ps.1.html). C'est la
  page de procps (Linux, la CI). Sous macOS, `ps` est celui de BSD : mêmes
  colonnes `lstart` et `args`, option `-ww` comprise.
- **`pgrep -f`** : cherche un motif dans la ligne de commande complète des
  processus. Il ne rend rien, avec le code `1`, si aucun processus ne
  correspond. —
  [man7 : pgrep(1)](https://man7.org/linux/man-pages/man1/pgrep.1.html)
- **Scripts `pre` de npm** : `npm test` lance d'abord le script `pretest`. Un
  code non nul arrête `npm test`. —
  [npm Docs : Scripts, Pre & Post Scripts](https://docs.npmjs.com/cli/v10/using-npm/scripts#pre--post-scripts)

## Ce qui a été construit

- `shared/bench-lock.ts`, le module du verrou du banc. Il n'importe que des
  modules de Node, pour pouvoir être copié tel quel dans un dépôt temporaire
  par les tests de `pretest`.
  - `acquireBenchLock({ tool, measureId?, file? })` prend le verrou du banc,
    reprend un orphelin, ou rend le refus avec son message.
  - `inspectBenchLock()` rend l'état sans prendre le verrou du banc : libre,
    tenu ou orphelin.
  - `acquireBenchLockOrExit` sert aux outils en ligne de commande. Sur
    refus, il écrit `refused-lock: …` et sort avec le code `4`.
  - Le fichier `.bench-lock`, à la racine du dépôt, contient l'outil, le PID,
    l'heure de démarrage et la ligne de commande du processus, la machine,
    l'identifiant de la mesure s'il y en a un et l'heure de prise.
- `scripts/check-bench-lock.ts`, branché dans `pretest` après le contrôle de
  la version de Node : `npm test` refuse pendant qu'un outil du banc tient
  le verrou du banc.
- `runner/measure.ts` : la mesure prend le verrou du banc après les refus
  d'options, à son propre nom (identifiant de la mesure), et le libère dans
  un `finally`. `environment.lock` enregistre l'heure de prise et, s'il y en
  a eu une, la reprise (`takenOver` : outil, PID, heure de démarrage, ligne de
  commande).
- `oracle/cli.ts` et `scripts/stack-up.ts` : même prise, même libération.
  `stack:up` prend le verrou du banc avant d'écrire le sel de développement.
- `.gitignore` : `.bench-lock` et `.bench-lock.*` (brouillons, garde de
  reprise).
- Tests :
  - `tests/bench-lock.test.ts` couvre le Seam 3 avec de vrais processus
    Node (`tests/fixtures/bench-lock/hold.ts` tient le verrou du banc jusqu'à
    la fermeture de son entrée) : prise, refus, refus de `pretest`, reprises,
    refus de déposséder, restes d'un plantage ;
  - `tests/runner/bench-lock-tools.test.ts` teste les trois outils réels
    sous un faux `docker`.
- `README.md` (section « Verrou du banc ») et `docs/specs/03-candidate-runner.md` :
  la limite connue de `npm test` et la décision Q14 sur le marqueur du
  Seam A.

## Les choix faits et pourquoi

- **Un brouillon complet, puis un lien dur.**
  - Option retenue : `writeFileSync` du brouillon `.bench-lock.<pid>.draft`,
    puis `linkSync` vers `.bench-lock`.
  - Option écartée : `writeFileSync(file, …, { flag: "wx" })`. Entre la
    création et l'écriture, un autre outil peut lire un fichier vide.
- **L'identité lue par `ps`, en anglais et en UTC.**
  - Le processus qui prend le verrou du banc lit sa propre identité avec la
    même commande que celle qui vérifiera plus tard le détenteur
    (`LC_ALL=C`, `TZ=UTC`, `-ww`).
  - Comparer deux sorties de `ps` évite les écarts de format avec
    `process.argv`.
- **La reprise passe par une garde exclusive, `.bench-lock.takeover`.** Deux
  repreneurs simultanés ne suppriment jamais l'un le verrou du banc que
  l'autre vient de prendre. Le repreneur vérifie aussi, sous la garde, que
  le fichier est toujours l'orphelin qu'il a lu.
- **Une garde morte n'est jamais retirée par un outil.**
  - La première version la retirait. La relecture de la spec a montré une
    course possible, qui pouvait déposséder un détenteur vivant.
  - Option retenue, validée par l'humain : refuser, avec les deux commandes
    exactes, à lancer à la main. Vérifier qu'aucun outil du banc ne tourne
    (`pgrep -fl "runner/cli.ts|oracle/cli.ts|scripts/stack-up.ts"`), puis
    `rm` de la garde.
  - Prix accepté : un blocage, dans le cas très rare d'une mort pendant la
    reprise elle-même.
- **La libération ne supprime que son propre fichier.** Elle compare le
  contenu à ce que le processus a écrit. Un processus dont le verrou du banc
  a été repris ne supprime pas celui du repreneur. Un test le vérifie.
- **`pretest` laisse passer un orphelin**, sans le prendre ni le reprendre :
  le prochain outil du banc le reprendra.
- **`environment.lock` ne garde que l'heure de prise et la reprise.** Le
  détenteur courant est la mesure elle-même. Sa ligne de commande et sa
  machine n'apprennent rien, et un `measure.json` versionné ne doit pas
  porter de détail de la machine (règle de #53).
- **Le verrou du banc est pris avant la phase de préparation.** Un refus
  n'écrit rien, comme le veut la phase 0. La relecture a noté que la prise
  n'est donc pas chronométrée dans la phase 1. Écart accepté.
- **Les outils testés sous un faux `docker`.**
  - Contrainte de la session : ne lancer ni Docker ni la pile, partagée avec
    une autre session.
  - Un faux `docker` en tête du `PATH` bloque jusqu'à la mort de l'outil (il
    garde ainsi le verrou du banc) ou échoue aussitôt. Il note chaque appel,
    et si `.bench-lock` existait à ce moment.
  - Le vrai `npm run stack:up` n'est pas lancé comme détenteur : il
    réécrirait `.dev-archive-salt`, que relisent les autres tests. Ce
    détenteur est simulé.
- **Pas de fonction commune pour le `try/finally` de l'oracle et de
  `stack:up`.** La relecture la proposait. Mais `oracle/cli.ts` est
  asynchrone et `stack-up.ts` synchrone. Une fonction synchrone commune
  libérerait le verrou du banc avant la fin de l'oracle.
- **L'interruption reste à #71.** Sur `SIGINT`, un outil laisse aujourd'hui
  un verrou du banc orphelin, repris au lancement suivant.

## Difficultés rencontrées

- **Tests des outils en échec par délai.**
  - Symptôme : `Test timed out in 5000ms`.
  - Cause : l'attente de la prise du verrou du banc allait jusqu'à 10 s,
    au-delà du délai par défaut de Vitest.
  - Résolution : délai de 20 s sur le `describe`.
- **`ORACLE_SALT` vidé au lieu d'être retiré.**
  - Symptôme : relevé à la lecture du test.
  - Cause : `runner/cli.ts` traite `ORACLE_SALT=""` comme un sel imposé.
  - Résolution : la variable est retirée de l'environnement de l'outil.
- **Erreurs de typecheck dans les tests.**
  - Symptôme : `TS4104`, une constante `as const` en lecture seule passée à
    un paramètre `string[]`, et `TS2339` sur une union d'objets.
  - Résolution : un type `Tool` en lecture seule, et
    `Record<string, unknown>` pour le verrou du banc modifié.
- **Lancement de tous les fichiers de test refusé.**
  - Symptôme : la boucle sur tous les fichiers de test a été refusée par
    les permissions de la session, car certains peuvent avoir besoin de la
    pile.
  - Résolution : seuls les fichiers voisins du changement ont été lancés, un
    par un. `npm test` complet est laissé à la CI.
- **Point fixe de la relecture.**
  - Symptôme : le diff depuis `main` comptait 20 fichiers.
  - Cause : la branche `main` locale était en retard.
  - Résolution : la relecture a pris la base réelle de la branche, `7c5242c`.
- **Relecture en deux axes.**
  - Spec :
    - corrigé : la course sur une garde de reprise morte ;
    - corrigé : un brouillon laissé par un plantage, qui faisait échouer
      (`EEXIST`) un futur processus de même PID.
    - Chaque correction a eu son test rouge d'abord.
  - Standards : la section « Verrou du banc » du README coupait le texte sur
    le sel ; elle a été déplacée.
- **Une limite connue à formuler.**
  - La phrase demandée disait qu'une mesure lancée pendant un `npm test`
    serait « rendue invalide par les marqueurs du Seam A ».
  - Or les tests du Seam A n'envoient pas de marqueur. Et la spec comptait
    une requête sans marqueur contre le candidat (porte du relais).
  - Résolution, avec l'humain :
    - la limite connue décrit l'état actuel ;
    - la décision Q14 du cadrage (marqueur du Seam A, `marker-out-of-place`)
      est ajoutée à la spec ;
    - un commentaire sur #67 la met dans son périmètre.

## Vérifier soi-même

Sorties observées au commit `e27c91f`, arbre propre, sous macOS, Node 22.23.5,
sans la pile.

Seam 3 :

```sh
npx vitest run tests/bench-lock.test.ts
# Tests  13 passed (13)
```

Les trois outils sous un faux `docker` (aucune commande Docker réelle) :

```sh
npx vitest run tests/runner/bench-lock-tools.test.ts
# Tests  4 passed (4)
```

Refus de `pretest` pendant qu'un détenteur réel tient le verrou du banc :

```sh
(sleep 3 | node tests/fixtures/bench-lock/hold.ts .bench-lock measure 20261123T090507Z-454fb76-reference-candidate > /dev/null &)
sleep 1; node scripts/check-bench-lock.ts; echo "exit=$?"
# npm test refused: The bench lock is held by measure (PID 84978 on <machine>, started Mon Nov 23 22:24:11 2026: node tests/fixtures/bench-lock/hold.ts …, measure 20261123T090507Z-454fb76-reference-candidate), taken at 2026-11-23T22:24:11.671Z.
# Wait for it to end, or stop it, then run `npm test` again.
# exit=4
```

Trois secondes plus tard, le détenteur a libéré le verrou du banc :
`ls -a | grep bench-lock` ne rend rien.

Fichier ignoré par Git :

```sh
git check-ignore .bench-lock .bench-lock.takeover
# .bench-lock
# .bench-lock.takeover
```

Sur la pile, au commit `bcccdea`, arbre propre, après `npm run stack:up` :
une mesure du candidat de référence, puis une seconde lancée pendant qu'elle
tourne.

```sh
npm run migrabench -- measure --candidate fixtures/reference-candidate; echo "exit=$?"
# Measure: results/diagnostic/20261123T224324Z-bcccdea-reference-candidate
# Outcome: completed (ok)
# exit=0
# measure.json : 38 scénarios, 38 réussis, 0 non atteint ; worktree clean
# environment.lock :
# {
#   "takenAt": "2026-11-23T22:43:24.598Z"
# }

# pendant la première, depuis un autre terminal :
node runner/cli.ts measure --candidate fixtures/reference-candidate; echo "exit=$?"
# refused-lock: The bench lock is held by measure (PID 96775 on <machine>, started Mon Nov 23 22:43:24 2026: node runner/cli.ts measure --candidate fixtures/reference-candidate, measure 20261123T224324Z-bcccdea-reference-candidate), taken at 2026-11-23T22:43:24.598Z
# exit=4
# results/diagnostic/ : seulement le dossier de la première mesure
```

Après la mesure, `.bench-lock` n'existe plus. Cette mesure n'a pas eu de
reprise : `takenOver` n'apparaît que lorsqu'un verrou du banc orphelin est
repris, et ce cas est couvert par `tests/bench-lock.test.ts`.

> À vérifier après l'exécution de la CI de la PR : `npm test` complet vert sur la pile (workflow « Tests du banc »), avec le lien de l'exécution et son head SHA.

## Pour aller plus loin

- #71, mesure interrompue : sur `SIGINT` ou `SIGTERM`, écrire `measure.json`
  et libérer le verrou du banc au lieu de laisser un orphelin.
- #67, journal d'accès : le marqueur du Seam A (décision Q14) fera disparaître
  la limite connue de `npm test`, qui vérifie le verrou du banc sans le
  prendre.
- #74, critère de fin : la mesure lancée pendant qu'une autre tient le verrou
  du banc, sur la vraie pile, en CI.
- `PROTOCOL.md`, limites : le verrou du banc ne couvre que les outils du
  banc. Une requête envoyée à la main au legacy pendant une mesure reste
  comptée contre le candidat.
