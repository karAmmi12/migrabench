# #67 · Étape 3 · Journal d'accès du legacy, marqueur et requêtes témoins

## Objectif

La porte du relais (étape 4) aura besoin de savoir quelles requêtes ont
atteint le legacy pendant une mesure. Ce ticket donne au legacy un journal
d'accès du port `8080`, conservé comme brut de chaque mesure. Il prouve que ce
journal était actif pendant toute la période où le candidat tournait, grâce à
deux requêtes témoins qui portent un marqueur que le candidat ne connaît pas.
Il fixe aussi le moyen du marqueur du Seam A (commentaire de l'issue,
décision Q14) : un `npm test` lancé pendant une mesure rend la mesure
invalide, au lieu de compter contre le candidat.

## Notions à connaître

- **Valve d'accès de Tomcat (`AccessLogValve`)** : un composant du pipeline de
  Tomcat qui écrit une ligne par requête, selon un motif (`%t`, `%r`, `%s`,
  `%{User-Agent}i`, `%{nom}r` pour un attribut de requête). `conditionUnless`
  n'écrit la ligne que si l'attribut de requête nommé est absent. Les valves se
  posent sur `Engine` ou `Host`, pas sur un connecteur. —
  [Tomcat 9, Access Logging](https://tomcat.apache.org/tomcat-9.0-doc/config/valve.html#Access_Logging)
- **`RewriteValve` de Tomcat** : l'équivalent de `mod_rewrite`. Une règle
  `RewriteRule .* - [E=nom:valeur]` ne réécrit rien (`-`) et pose seulement
  une variable, que la valve d'accès lit comme attribut de requête.
  `RewriteCond %{SERVER_PORT} =8081` restreint la règle au connecteur `8081`. —
  [Tomcat 9, The rewrite Valve](https://tomcat.apache.org/tomcat-9.0-doc/rewrite.html)
- **Montage d'un dossier de l'hôte (bind mount)** : un dossier de l'hôte
  apparaît dans le conteneur, et ce qui y est écrit survit à la recréation du
  conteneur. `${VAR:-défaut}` dans `docker-compose.yml` choisit le dossier
  selon l'environnement de la commande. —
  [Docker, Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)
- **`globalSetup` et `provide`/`inject` de Vitest** : un fichier exécuté une
  fois avant tous les tests, qui peut fournir une valeur aux tests
  (`project.provide`, lue par `inject`). —
  [Vitest, globalSetup](https://vitest.dev/config/globalsetup)
- **Projets et `sequence.groupOrder` de Vitest** : les projets d'un même
  `groupOrder` tournent en parallèle ; les groupes tournent l'un après
  l'autre, dans l'ordre croissant. Exception relevée dans le code de
  Vitest 5 (`groupSpecs`) : avec un seul worker, les fichiers d'un projet en
  `groupOrder` 0 vont dans un groupe séquentiel placé après tous les autres. —
  [Vitest, sequence](https://vitest.dev/config/sequence),
  [Vitest, Test Projects](https://vitest.dev/guide/projects)

Liens ouverts le 2026-11-24 (`curl`) : chaque page répond `200`. L'ancre
`Access_Logging` existe, la page de la valve d'accès cite `conditionUnless`,
celle de la réécriture cite `env|E=` et `SERVER_PORT`, et la page `sequence`
de Vitest cite `groupOrder`.

## Ce qui a été construit

- **Legacy, instrumentation du banc** (`fixtures/legacy-app/access-log/`,
  `Dockerfile`, `TRAPS.md`) :
  - `rewrite.config` pose deux attributs de requête. `mbLocalPort` reçoit le
    port du connecteur, et `mbInternalApi` est posé seulement pour `8081` ;
  - `access-log-valve.xml` est inséré dans le `<Host>` de `server.xml`. Il
    écrit `logs/migrabench/access.log`, sans rotation ni tampon, et écarte
    `8081` ;
  - `ENV UMASK=0022` rend le fichier lisible par le runner ;
  - `TRAPS.md` ajoute la section « Hors pièges : journal d'accès du banc ».
- **`docker-compose.yml`** monte `${MB_ACCESS_LOG_DIR:-./.access-log}` sur
  `/usr/local/tomcat/logs/migrabench` (`.access-log/` ignoré par Git et par
  Docker).
- **`runner/access-log.ts`** : fonction pure `checkAccessLog`, réutilisée par
  la porte du relais. Elle rend `ok`, `access-log-inactive` ou
  `marker-out-of-place`, avec le nombre de lignes, la position des requêtes
  témoins, et les lignes en preuve. `witnessPath` et `isWitnessLine` donnent
  le chemin `/migrabench-witness/<marqueur>/<moment>`.
- **`runner/witness.ts`** :
  - `sendWitness` envoie la requête témoin depuis l'hôte sur `127.0.0.1:8080`,
    puis relit le journal jusqu'à y voir sa ligne (5 s au plus). L'adresse et
    le délai sont des options, pour les tests ;
  - `closeAccessLog` fait la clôture : requête témoin `end`, contrôle, et
    journal figé dans `access.log` des bruts.
- **`runner/measure.ts`** :
  - à la préparation, le marqueur est tiré et `access-log/` est créé dans les
    bruts ;
  - `MB_ACCESS_LOG_DIR` est transmis à la recréation de la pile
    (`oracle/execute.ts`, option `accessLogDir`) ;
  - dans le rappel `onStackReady` : requête témoin `start-N`, puis contrôle.
    Si elle manque : `access-log-inactive` en phase `start` ;
  - à la clôture : `closeAccessLog` ;
  - `marker` et `accessLog` sont écrits dans `measure.json`
    (`runner/measure-record.ts`).
- **Marqueur du Seam A** :
  - `shared/seam-a-marker.ts` (enregistrement, relecture, purge après sept
    jours) ;
  - `tests/seam-a-marker.setup.ts` (`globalSetup`) ;
  - `BENCH_STATE_DIR`, exporté par `shared/bench-lock.ts` ;
  - `tests/seam-a/legacy-client.ts` (`legacyFetch`, `SEAM_A_HEADERS`), et les
    tests du Seam A qui appellent le port `8080`, dont le relais de
    référence.
- **Tests** :
  - `tests/runner/access-log.test.ts` (13 tests) ;
  - `tests/runner/witness.test.ts` (5 tests), contre un faux legacy HTTP qui
    écrit sa ligne de journal après avoir répondu ;
  - `tests/seam-a-marker.test.ts` (4 tests) ;
  - `tests/runner/measure-record.test.ts` (+2) ;
  - `tests/seam-a/access-log.test.ts`, dans le projet Vitest
    `legacy-restart`.
- **`vitest.config.ts`** : trois projets aux `groupOrder` explicites,
  `default` (1), `bench-tools` (2, #90), `legacy-restart` (3).
- **Spec** (`docs/specs/03-candidate-runner.md`) :
  - la « Limite connue, jusqu'à #67 » est remplacée ;
  - le moyen du marqueur du Seam A est décrit ;
  - le chemin des requêtes témoins et le champ `accessLog` aussi.

## Les choix faits et pourquoi

- **Marqueur du Seam A dans le `User-Agent`**, plutôt qu'en paramètre d'URL.
  La réponse du legacy ne change pas, et le relais de référence transmet ses
  en-têtes tels quels. Choix validé par l'humain au moment du plan.
- **Marqueurs du Seam A dans le dossier d'état du banc**, à côté du verrou du
  banc, plutôt que dans le dépôt ou dans une variable d'environnement. La pile
  est commune à la machine, et le candidat ne voit pas ce dossier : il ne peut
  ni recevoir ni fabriquer un marqueur reconnu.
- **Filtre du `8081` par `RewriteValve`**, plutôt qu'une valve Java écrite
  pour le banc, ou qu'un second `<Service>`. Un second service déploierait
  deux fois l'application, donc deux jeux de données en mémoire. La
  `RewriteValve` est livrée avec Tomcat, et une sonde a montré qu'elle suffit.
- **Requête témoin reconnue par son chemin exact** : une requête témoin au
  marqueur inventé ne compte pas (test demandé par l'humain). Le contrôle ne
  repose donc pas seulement sur l'ignorance du marqueur par le candidat.
- **Ordre des contrôles** :
  1. marqueur du Seam A d'abord ;
  2. puis requêtes témoins manquantes ;
  3. puis marqueur hors de son moment.

  Un `npm test` pendant la mesure est la cause la plus précise.
- **Journal figé à la clôture** dans les bruts, plutôt que de citer le journal
  vivant, qui continue de grossir (voir les difficultés).
- **Test du redémarrage dans son propre groupe Vitest** (`legacy-restart`,
  `groupOrder: 3`), distinct de `bench-tools` (`groupOrder: 2`, #90) : deux
  projets d'un même groupe tourneraient en parallèle. Consigne de l'humain.
- **`default` en `groupOrder: 1` plutôt que 0** : en 0, il passe en dernier
  avec un seul worker (voir les difficultés). Aucun projet ne reste en 0, et
  l'ordre déclaré vaut quel que soit le nombre de workers.
- **Fusion de `main` après #66** (PR #101) : fusion sans conflit textuel.
  #66 modifiait seulement l'appel `candidateService({ …, limits })` de
  `runner/measure.ts` (et de `runner/calibrate.ts`), loin du rappel et de la
  clôture. La ligne de #66 est gardée telle quelle, à côté des ajouts de ce
  ticket.
- **Image de la pile d'un autre commit : issue #102 plutôt que correctif ici.**
  La mesure invalide de `58a4759` (voir les difficultés) montre qu'une mesure
  peut tourner contre des images construites ailleurs. La correction touche
  la préparation de toutes les mesures, hors du périmètre du journal d'accès.
  Ouverte sur consigne de l'humain.
- **#94 non corrigée** : seulement un commentaire sur #94, qui cite le
  redémarrage du legacy par `npm test` (consigne de l'humain).
- **Valve d'accès d'origine de l'image Tomcat laissée en place** : modification
  minimale du legacy. Elle écrit dans le conteneur seulement.

## Difficultés rencontrées

- **Échappement de `sed`** :
  - *Symptôme* : à la première sonde, Tomcat refuse de démarrer
    (`Parse fatal error at line [181]`).
  - *Cause* : dans le remplacement de `sed`, `&` vaut le texte trouvé, et
    `&quot;` devenait donc `</Host>quot;`.
  - *Résolution* : le fragment XML est copié comme fichier et inséré avec la
    commande `e` de GNU `sed`.
- **`%p` et `%{local}p` écrivent le port de l'en-tête `Host`** :
  - *Symptôme* : une requête vers `127.0.0.1:18080` est journalisée `:18080`,
    et une requête avec `Host: foo:7777` est journalisée `:7777`.
  - *Constat* : la sonde a aussi montré que `%{SERVER_PORT}` de la
    `RewriteValve` est le vrai port du connecteur. Une requête vers `8080`
    avec `Host: legacy:8081` est journalisée, et une requête vers `8081` avec
    `Host: legacy:8080` ne l'est pas.
  - *Résolution* : `mbLocalPort` est posé par la `RewriteValve` et écrit par
    `%{mbLocalPort}r`.
- **Fichier du journal en `0640`** :
  - *Symptôme* : la première sonde crée `access.log` en `-rw-r-----`.
  - *Cause* : le umask par défaut de Tomcat.
  - *Résolution* : `ENV UMASK=0022` donne `-rw-r--r--`. Sans lui, le runner ne
    pourrait pas lire un fichier créé par root sur un hôte Linux.
- **Le port `8081` répond `401`, pas `404`, sur un chemin inconnu** : le test
  du Seam A échouait (`expected 401 to be 404`). Il vérifie maintenant le
  `401` observé.
- **Pile partagée avec une autre session** (#66, en parallèle) :
  - **Refus du verrou du banc** : `stack:up`, puis la mesure, ont été refusés
    plusieurs fois (`refused-lock`, détenteurs `measure` et `stack-up`).
    Chaque commande a été relancée jusqu'à la libération du verrou du banc.
  - **Image du legacy sans la valve** : le `stack:up` de l'autre session avait
    reconstruit le legacy depuis sa branche, et la mesure recrée la pile en
    `--no-build`. La mesure `20261124T152254Z-58a4759-reference-candidate`
    (commit `58a4759`, arbre propre) a donc rendu `access-log-inactive` en
    phase `start`, avec la preuve
    `Missing witness request start-1 in the access log (0 lines).`
    `docker compose exec legacy grep -c mbInternalApi conf/server.xml` rendait
    `0`, puis `1` après un nouveau `stack:up`. C'est une vérification négative
    réelle de la requête témoin de début.
- **Empreinte du journal périmée après la mesure** :
  - *Symptôme* : la mesure `20261124T152329Z-58a4759-reference-candidate`
    cite 195 lignes. Relu ensuite, le journal en comptait 197, et son
    empreinte ne correspondait plus.
  - *Cause* : le legacy reste en marche, et le `healthcheck` continue d'écrire.
  - *Résolution* (commit `b980f53`) : le journal contrôlé est figé dans
    `access.log` des bruts, et c'est lui qui est cité.
- **Ordre des projets invisible** : sans terminal, le rapporteur par défaut de
  Vitest n'affiche que le résumé. L'ordre a été relevé avec
  `--reporter=verbose`.
- **Tests de `witness.ts` et du journal figé ajoutés après coup** : la
  relecture des normes a relevé que le correctif `b980f53` et
  `runner/witness.ts` n'avaient pas de test, contre la règle « TDD sur le
  runner » de `CLAUDE.md`. Les tests ont été écrits ensuite (`1534f75`), et
  chacun a été vérifié par un défaut volontaire, retiré après :
  - défaut n° 1, plus d'attente de la ligne dans `sendWitness` (boucle
    désactivée) : 2 tests échouent, `waits for the witness line that the
    legacy writes after its response` et `cites the access log as checked,
    frozen…` ;
  - défaut n° 2, le journal vivant cité au lieu d'être figé (plus de copie
    dans les bruts) : 1 test échoue, celui du journal figé, avec
    `ENOENT: no such file or directory, open '…/mb-raw-…/access.log'` ;
  - les défauts retirés (fichier comparé à sa copie avec `cmp`), les 5 tests
    repassent.
- **CI de la PR #103 en échec, seulement sous Linux** :
  - *Symptôme* : les jobs `tests` et `oracle` échouent avec
    `EACCES: permission denied, mkdir '/home/runner/work/migrabench/migrabench/.oracle-artifacts/…'`
    (exécutions https://github.com/karAmmi12/migrabench/actions/runs/45430426095
    et https://github.com/karAmmi12/migrabench/actions/runs/45430426232). Dans
    le job `tests`, 2 tests de `bench-lock-tools` échouent.
  - *Cause* : le dossier par défaut du journal était
    `./.oracle-artifacts/access-log`. En CI, `docker compose up` tourne avant
    toute création de `.oracle-artifacts/`, et le démon Docker, qui tourne en
    root, crée lui-même la source manquante d'un montage. Le dossier
    `.oracle-artifacts/` appartenait donc à root. Sur macOS, Docker Desktop
    crée ces dossiers au nom de l'utilisateur : l'échec ne se voyait pas en
    local.
  - *Résolution* : le dossier par défaut devient `./.access-log/`, ignoré par
    Git et par Docker. Une mesure crée elle-même le dossier de son journal
    avant de recréer la pile.
- **Ordre des projets différent en CI** :
  - *Symptôme* : dans le job `tests` de la deuxième exécution
    (https://github.com/karAmmi12/migrabench/actions/runs/45431413514, head
    393b092), Vitest démarre à 15:59:05. `bench-tools` finit à 15:59:13,
    `legacy-restart` à 15:59:18, puis les fichiers de `default` de 15:59:22 à
    16:00:38. C'est l'ordre inverse de celui relevé en local.
  - *Cause* : `groupSpecs` de Vitest 5
    (`node_modules/vitest/dist/chunks/index.Di8au7q4.js`). Quand `maxWorkers`
    vaut 1, ce qui est le cas sur le runner de la CI, les fichiers d'un projet
    isolé en `groupOrder` 0 vont dans un groupe séquentiel ajouté après tous
    les groupes numérotés. Les groupes ne se chevauchaient pas : l'isolement
    tenait. Mais `bench-lock-tools`, comme `legacy-restart`, tournait avant
    `default` en CI, contrairement à ce que disent le commentaire de #90 et sa
    fiche.
  - *Reproduction* : `npm test -- --maxWorkers=1 --reporter=verbose` en
    local, au commit 393b092 : 6 `|bench-tools|`, puis 1 `|legacy-restart|`,
    puis 626 `|default|`.
  - *Résolution* : `groupOrder` explicites, 1, 2 et 3. Même commande ensuite :
    626 `|default|`, puis 6 `|bench-tools|`, puis 1 `|legacy-restart|`, et le
    même ordre sans `--maxWorkers=1`.
- **Relecture** :
  - la relecture de la spec craignait trois marqueurs par `npm test` (un par
    projet). Compté : un marqueur par exécution, avec un projet comme avec
    deux ;
  - la relecture des normes a relevé deux façons de reconnaître une ligne de
    requête témoin. Elles sont maintenant une seule, `isWitnessLine`
    (`d20fb06`).

## Vérifier soi-même

Prérequis : `npm run stack:up` depuis ce worktree, verrou du banc libre.

```sh
npx vitest run tests/runner/access-log.test.ts
```

Observé : `Tests  13 passed (13)`.

```sh
npm test -- --reporter=verbose
```

Observé après la correction des `groupOrder` : `Tests  632 passed | 1 skipped (633)`.
Ordre réel des projets, en trois blocs contigus, compté par projet dans la
sortie : 626 lignes `|default|`, puis 6 `|bench-tools|`, puis 1
`|legacy-restart|`.

```sh
npm test -- --maxWorkers=1 --reporter=verbose
```

Observé, comme sur le runner de la CI (un seul worker) : le même ordre, 626,
puis 6, puis 1. Avant la correction : 6 `|bench-tools|`, 1 `|legacy-restart|`,
puis 626 `|default|`.

```sh
npx vitest run tests/runner/witness.test.ts
```

Observé : `Tests  5 passed (5)`.

```sh
docker compose exec -T legacy grep -c mbInternalApi conf/server.xml
```

Observé : `1` avec l'image de cette branche (`0` avec une image sans la valve).

```sh
npm run migrabench -- measure --candidate fixtures/reference-candidate
```

Observé au commit `1534f75`, arbre propre, mesure
`20261124T155020Z-1534f75-reference-candidate` :

- sortie : `Outcome: completed (ok)`, code `0` ;
- oracle : 38 scénarios réussis, 0 non atteint ;
- `accessLog` : `{"log":"sha256:8666d6fe…","lines":195,"witnesses":[{"name":"start-1","line":2},{"name":"end","line":195}]}` ;
- `shasum -a 256` de `.oracle-artifacts/<mesure>/access.log` rend la même
  empreinte, `8666d6fef1c9…` ;
- avec `M` = le `marker` de `measure.json`, `grep -c $M` sur ce fichier
  rend `2`, `grep -vc $M` rend `193` (requêtes hors marqueur), et
  `grep -c $M` sur `compose.candidate.yml` rend `0`.

## Pour aller plus loin

- **#74** : la mesure du candidat de référence et des candidats défectueux en
  CI. La mesure de ce ticket a été faite en local, en diagnostic.
- **#102** : la mesure doit tourner contre une pile construite depuis son
  propre commit.
- **#94** : `npm test` ne tient pas le verrou du banc. Le commentaire ajouté
  par ce ticket montre que le test du redémarrage du legacy peut faire perdre
  un run.
- **Porte du relais (étape 4)** : elle réutilisera `checkAccessLog` et les
  lignes hors marqueur. Il lui faudra écarter les lignes du `healthcheck`
  (`curl`, adresse `0:0:0:0:0:0:0:1`), relevées dans le journal pendant ce
  ticket.

> À vérifier après l'exécution de la CI de la PR : le job des tests (`tests.yml`) passe avec le test `legacy-restart` sur la pile de CI ; relever le lien de l'exécution, son head SHA et la ligne `Tests` du résumé.
