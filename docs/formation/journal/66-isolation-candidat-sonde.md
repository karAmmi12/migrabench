# #66 · Étape 3 · Isolation du candidat et sonde d'isolation

## Objectif

Le candidat est du code produit par un agent : le banc le fait tourner sans
lui faire confiance (ADR 0007). Avant ce ticket, le service `candidate` tournait
déjà sous un utilisateur non-root, avec sa copie en lecture seule. Mais il
gardait les capacités Linux par défaut de Docker et n'avait aucune limite de
mémoire, de CPU ni de processus. Ce ticket durcit le démarrage. Il ajoute le
candidat défectueux 5, « sonde d'isolation », qui tente ce qui est interdit et
rend le constat de chaque tentative, pour prouver sur une vraie pile que chaque
protection tient.

## Notions à connaître

- **Capacités Linux et `cap_drop`** : root est découpé en capacités
  (`CAP_NET_ADMIN`, `CAP_CHOWN`…), et Docker en accorde un jeu par défaut à
  tout conteneur. `cap_drop: [ALL]` les retire toutes. —
  [Docker Compose : services, `cap_drop`](https://docs.docker.com/reference/compose-file/services/#cap_drop)
- **`no-new-privileges`** : empêche un processus d'acquérir des privilèges
  qu'il n'a pas au départ, par exemple par un binaire setuid. —
  [Docker : `docker run --security-opt`](https://docs.docker.com/reference/cli/docker/container/run/#security-opt)
- **Limites de ressources d'un service** : `mem_limit` (mémoire), `memswap_limit`
  (mémoire plus échange ; égale à `mem_limit`, elle interdit l'échange), `cpus`
  et `pids_limit` (nombre de processus et de fils d'exécution). —
  [Docker Compose : services](https://docs.docker.com/reference/compose-file/services/)
  > À vérifier : les ancres exactes de chaque clé dans cette page.
- **Lire un socket Unix** : un socket n'est pas un fichier ordinaire. Le lire
  comme un fichier échoue même quand il est là. Seul `stat` dit s'il existe. —
  [open(2), erreur ENXIO](https://man7.org/linux/man-pages/man2/open.2.html)
  Observé dans la session sur l'image d'exécution, socket Docker monté :
  `EACCES` sous l'uid 501, `ENXIO` en root (voir « Vérifier soi-même »).
- **Conteneur sans réseau (`--network none`)** : il n'a que l'interface de
  bouclage `lo`. C'est ce qu'utilise la construction depuis #65. —
  [Node.js 22 : `os.networkInterfaces()`](https://nodejs.org/docs/latest-v22.x/api/os.html#osnetworkinterfaces)

## Ce qui a été construit

- `runner/limits.ts` : `startLimits`, les limites du démarrage tirées de celles
  de la construction, plus 256 processus (`START_PIDS`). Elles sont enregistrées
  dans `environment.limits.start` avec `provisional: true` et
  `source: "build-limits"`.
- `runner/candidate-compose.ts` : la composition complémentaire du service
  `candidate` gagne `cap_drop`, `security_opt`, `mem_limit`, `memswap_limit`,
  `cpus` et `pids_limit`. `runner/candidate-runtime.ts`, `runner/measure.ts` et
  `runner/calibrate.ts` lui passent les limites.
- `fixtures/defective-candidates/isolation-probe/` : le candidat défectueux 5.
  - `build.js` tente de joindre `legacy:8081` pendant la construction ;
  - `server.js` tente d'écrire dans `/candidate`, cherche le socket Docker,
    lit `ARCHIVE_SALT` et regarde son uid.

  Le constat sort sur une ligne `migrabench start report <JSON>`.
- `fixtures/reference-candidate/server.js` : au démarrage, écrit dans `/tmp` et
  donne les *noms* des variables reçues, jamais leurs valeurs.
- `scripts/start-report.ts` (fonctions pures) et `scripts/check-start-report.ts`
  (`npm run start-report:check -- <probe|reference> <start.log>`) : la
  vérification du constat dans le brut `start.log` d'une mesure.
- Tests : `tests/runner/limits.test.ts`, `tests/runner/candidate-compose.test.ts`,
  `tests/start-report.test.ts`.
- `docs/specs/03-candidate-runner.md` : précision « (précisé par #66) ».

## Les choix faits et pourquoi

- **Limites du démarrage = limites de la construction, 256 processus.**
  L'option de les tirer des relevés du démarrage × 2 a été écartée. Le dernier
  étalonnage de CI (`results/calibration/20261123T225559Z-6a135fe-ci45284030833.1-1.json`)
  relève 20 361 216 octets et 0,288 CPU, mais seulement jusqu'à la
  disponibilité : ce serait environ 40 Mo sous la charge de 38 scénarios, et un
  candidat sain risquerait d'échouer. Des constantes indépendantes ont aussi
  été écartées. Décision de Karim : c'est une limite provisoire de conception,
  pas un relevé, écrite comme telle dans la spec. L'étalonnage sous la charge
  de l'oracle est l'issue #100.
- **Le constat passe par la sortie du candidat, pas seulement par `PORT`.**
  Le service `candidate` est supprimé à la clôture de la mesure. En revanche,
  le runner ajoute ses sorties au brut `start.log` à chaque arrêt : c'est donc
  là que le constat survit à la mesure et que le test le lit.
- **Le constat de la construction est écrit dans la copie.** La copie est la
  seule écriture permise pendant la construction. `server.js` le reprend au
  démarrage, où la copie n'est plus lisible qu'en lecture seule.
- **Une tentative n'est comptée refusée que sur la preuve du refus** : `EROFS`,
  `EACCES` ou `EPERM` pour l'écriture, `ENOENT` pour le socket, aucune interface
  hors de `lo` pour le réseau. Toute autre erreur compte comme non refusée. La
  première version prenait toute exception pour un refus (voir « Difficultés »).
- **Pas de worktree.** La session de #67 travaillait en parallèle dans
  `../migrabench-67`. Karim a demandé de rester dans le dossier principal, de
  ne pas toucher `docker-compose.yml`, et de ne changer dans `runner/measure.ts`
  que la ligne de l'appel à `candidateService`.

## Difficultés rencontrées

- **La première sonde pouvait conclure à tort au refus.**
  - Symptôme : relevé par la revue de la spec. Un socket Docker monté aurait
    été compté refusé, et l'appel réseau de la construction a été coupé par le
    délai de 5 s, pas par un échec net.
  - Cause : toute exception valait refus, et lire un socket monté échoue aussi
    (`EACCES` ou `ENXIO`, observés dans la session).
  - Résolution : commit 91053f7, chaque tentative a sa preuve de refus. La
    sonde a été remesurée à ce commit.
- **`npm test` a échoué deux fois sans défaut du code.**
  - Symptôme : à 16:22:08, `4 failed | 603 passed` (sel de l'archivage
    différent, `ECONNREFUSED` sur le port `8081`) ; à 16:23:22,
    `13 failed | 594 passed`.
  - Cause : une mesure de la session de #67 a pris le verrou du banc et recréé
    la pile pendant la suite. `pretest` ne vérifie le verrou qu'au départ.
  - Résolution : attendre la fin de la mesure, `npm run stack:up`, puis relancer
    `npm test`, qui a donné `607 passed | 1 skipped`. Le cas est cité sur #94,
    passée en `ready-for-agent` avec la décision : `npm test` prendra le verrou
    du banc et le gardera jusqu'à la fin.

## Vérifier soi-même

Mesure de la sonde (mesure de diagnostic, verrou du banc libre). Observée au
commit 91053f7, avant que 7ec2c2c ne change seulement un commentaire de la sonde :

```sh
npm run migrabench -- measure --candidate fixtures/defective-candidates/isolation-probe
# Outcome: completed (ok)   (code de sortie 0)
npm run -s start-report:check -- probe .oracle-artifacts/<mesure>/start.log
# Start report of the probe candidate holds: …
```

Constat observé (abrégé) : `write-code` refusé (`EROFS: read-only file system`),
`read-docker-socket` refusé (`ENOENT … stat '/var/run/docker.sock'`),
`reach-internal-api-during-build` refusé (`The operation was aborted due to
timeout; no network interface but lo`), `read-archive-salt` refusé
(`ARCHIVE_SALT is not set`), `run-as-root` refusé (`uid 501`).

Mesure du candidat de référence, observée au commit d405e8b :

```sh
npm run migrabench -- measure --candidate fixtures/reference-candidate
# Outcome: completed (ok) ; oracle : 38 passed, 0 failed, 0 unreached
npm run -s start-report:check -- reference .oracle-artifacts/<mesure>/start.log
# Start report of the reference candidate holds: …
```

Variables vues par la référence : `ARCHIVE_TOKEN`, `ARCHIVE_URL`, `HOME`,
`HOSTNAME`, `LEGACY_API_URL`, `NODE_VERSION`, `PATH`, `PORT`, `PWD`, `SHLVL`,
`USERS_FILE`, `YARN_VERSION`, et `tmpWrite: "ok"`.

La composition générée, citée par empreinte dans `environment.composeOverride`
(`sha256:f1ea7ec5…` pour la mesure de la sonde au commit d405e8b), relue par
Docker Compose :

```sh
docker compose --file docker-compose.yml --file .oracle-artifacts/<mesure>/compose.candidate.yml config candidate
# cap_drop: [ALL] ; cpus: 2 ; mem_limit: "665845760" ; memswap_limit: "665845760" ;
# pids_limit: 256 ; no-new-privileges:true
```

Pourquoi la sonde ne lit pas le socket pour le chercher :

```sh
docker run --rm --user 501:20 -v /var/run/docker.sock:/var/run/docker.sock migrabench-runtime \
  node -e 'const fs=require("fs");try{fs.readFileSync("/var/run/docker.sock")}catch(e){console.log(e.code)}'
# EACCES   (avec --user 0:0 : ENXIO)
```

Tests et types :

```sh
npm run typecheck && npm test
# Tests  607 passed | 1 skipped (608)
```

Sur la CI de la PR #101 (head 9e5f5c0), tous les jobs sont passés :

- « Tests du banc » : `Test Files 68 passed (68)`, `Tests 607 passed | 1 skipped (608)`, de 15:28:37Z à 15:31:37Z, https://github.com/karAmmi12/migrabench/actions/runs/45425945598 ;
- « Fiche de formation » : « Fiche trouvée pour #66. » et « Chaque case cochée chiffrée cite un état. », https://github.com/karAmmi12/migrabench/actions/runs/45425945634 ;
- « Étalonnage » : cinq relevés du candidat d'étalonnage, démarré sous les nouvelles limites, sans erreur, de 15:28:37Z à 15:32:50Z, https://github.com/karAmmi12/migrabench/actions/runs/45425945385.

## Pour aller plus loin

- #100 : étalonner le démarrage sous la charge de l'oracle, pour remplacer la
  limite provisoire de conception.
- #74 : le job de CI qui mesure la sonde et lit son constat. Il vérifiera aussi
  `saltImposed: false` dans `oracle.json`, et, après #67, que la sonde ne
  trouve pas le marqueur dans son environnement.
- #94 : `npm test` gardera le verrou du banc pendant toute la suite.
- ADR 0007 : exécution du candidat, et ce que le banc détecte sans le fermer.
