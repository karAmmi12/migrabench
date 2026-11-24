# #102 · La mesure doit tourner contre une pile construite depuis son propre commit

## Objectif

Les images du legacy et du service d'archivage sont communes à toute la
machine (projet Compose `migrabench`). La dernière copie du dépôt qui a lancé
`npm run stack:up` les a construites, et rien ne garantissait que ce soit
celle qui mesure. Pendant #67, une mesure lancée depuis un worktree a tourné
contre un legacy construit depuis une autre branche. Une telle mesure peut
rester valide alors qu'elle cite un commit qui n'est pas celui du legacy
mesuré, ce qui contredit la règle « une preuve cite l'état exact où elle a
été obtenue ». Le ticket fait refuser à la mesure, à l'oracle et à
l'étalonnage une pile dont les images ne viennent pas de leur propre copie,
avec une cause nommée et son remède.

## Notions à connaître

- **Contexte de construction et `.dockerignore`** : `docker build` envoie au
  constructeur un dossier, le contexte (ici, la racine du dépôt). Les motifs
  de `.dockerignore` en retirent des fichiers. Ils sont ancrés à la racine du
  contexte (`*.har` ne vise pas `sous-dossier/x.har`). `**` traverse les
  dossiers. Un dossier exclu l'est avec tout son contenu, et `!` réintroduit
  un fichier. —
  [Docker, Build context, `.dockerignore` files](https://docs.docker.com/build/concepts/context/#dockerignore-files)
- **Labels d'image posés par Compose** : la clé `build.labels` de
  `docker-compose.yml` ajoute des labels à l'image construite. Une valeur
  `${VARIABLE:-}` est lue dans l'environnement du shell au moment du build. —
  [Compose file reference, Build, `labels`](https://docs.docker.com/reference/compose-file/build/#labels)
- **`docker inspect`** : rend la configuration d'une image ou d'un conteneur.
  `--format` en extrait des champs (`{{.Image}}`, `{{json .Config.Labels}}`).
  La configuration d'un conteneur reprend les labels de son image. C'est ce
  que le banc lit, et la session l'a observé sur les conteneurs de la pile. —
  [Docker CLI, `docker inspect`](https://docs.docker.com/reference/cli/docker/inspect/)
- **`@balena/dockerignore`** : bibliothèque Node, version 1.0.2, licence
  Apache-2.0, sans dépendance. D'après son README, c'est un portage en
  JavaScript de l'implémentation Go de `.dockerignore` utilisée par Docker,
  comparé au comportement réel de `docker build`. —
  [balena-io-modules/dockerignore](https://github.com/balena-io-modules/dockerignore)
  (dépôt source ; la session a lu le README de la copie installée).

Liens ouverts le 2026-11-24 (`curl`) : les trois pages de Docker et le dépôt
GitHub répondent `200`. Les ancres `dockerignore-files` et `labels` existent
sur leur page. La page npm du paquet répond `403` à `curl` : elle n'est donc
pas citée.

## Ce qui a été construit

- **`oracle/stack-images.ts`**, nouveau :
  - `contextDigest(contextDir)` calcule l'empreinte d'un contexte de
    construction. Il parcourt tout le contexte, retire ce que `.dockerignore`
    exclut (sémantique de Docker, par `@balena/dockerignore`), puis hache la
    liste triée « chemin, nature (fichier ou lien symbolique), empreinte du
    contenu ou de la cible » ;
  - `stackContextDigests()` donne l'empreinte de chaque service de la pile
    (`legacy`, `archive`), et `contextDigestEnv()` les variables
    `MB_LEGACY_CONTEXT_DIGEST` et `MB_ARCHIVE_CONTEXT_DIGEST` qui les
    portent jusqu'au label ;
  - `verifyBuiltImages()` vérifie les images taguées `migrabench-legacy` et
    `migrabench-archive`, et `verifyStackImages()` les conteneurs en cours.
    Les deux lèvent `StackNotFromCopy`, dont le message nomme chaque service,
    l'image, le label trouvé et l'empreinte attendue, puis donne le remède :
    ``Remedy: run `npm run stack:up` from this copy of the repository.``
- **`docker-compose.yml`** : `build.labels` pose
  `org.migrabench.context-digest` sur chaque image. Sans variable, le label
  est vide, et la pile est refusée.
- **`.dockerignore`** : il exclut aussi les sorties du banc écrites dans la
  copie (`results`, `.oracle-artifacts`, `.dev-archive-salt`, `.probes`) et
  des fichiers locaux (`**/dist`, `**/.DS_Store`,
  `.claude/settings.local.json`).
- **`oracle/execute.ts`** : `recreateStack` recrée la pile sans la
  reconstruire (`--no-build`), vérifie les conteneurs et rend les empreintes.
  L'environnement relevé gagne `imageContexts`, à côté de `images`.
- **`runner/measure.ts`** : la préparation vérifie les images construites,
  avant tout code du candidat. Un refus en préparation ou à la recréation de
  la pile devient l'issue `stack-not-from-this-copy`.
  **`runner/verdict.ts`** : cette cause rejoint la liste fermée, comme issue
  possible de la préparation et du démarrage.
- **`runner/calibrate.ts`** : il relève `imageContexts`. Son refus est celui
  de `recreateStack`.
- **`scripts/stack-up.ts`** pose les labels. **`scripts/stack-context-env.ts`**,
  nouveau, écrit les deux variables pour un `docker compose build` lancé
  ailleurs : la CI l'ajoute à `$GITHUB_ENV` avant chaque construction, dans
  `tests.yml`, `oracle.yml` (deux jobs) et `calibration.yml`.
- **Tests** :
  - `tests/oracle/stack-images.test.ts` : l'empreinte change avec un fichier
    qu'aucun `COPY` ne cite, et ignore ce que `.dockerignore` exclut. Les
    motifs sont ancrés à la racine, et une exception est prise en compte ;
  - `tests/seam-a/stack-images.test.ts` (pile réelle) : une copie identique
    du dépôt donne l'empreinte du label. La même copie, avec un fichier du
    legacy modifié, est refusée par les deux vérifications, et le refus ne
    nomme que le legacy ;
  - `tests/runner/stack-not-from-this-copy.test.ts` : une mesure réelle sous
    un faux `docker` qui rend un label étranger est invalide,
    `stack-not-from-this-copy`, dès la préparation. Le faux `docker` ne reçoit
    ni `run` ni `compose`. Ce test a son propre groupe dans
    `vitest.config.ts` ;
  - `tests/runner/verdict.test.ts` : la nouvelle cause, en préparation et en
    démarrage.
- **Documentation** : `GLOSSARY.md` (« Mesure invalide »), la spec de
  l'étape 3 (table des phases, règle de la cause, empreinte du contexte et
  sa raison, liste fermée, candidat de test n° 8), la spec de l'étape 2
  (pas de reconstruction, et pourquoi), et le `README.md` (« Images de la
  pile et copie du dépôt »).

## Les choix faits et pourquoi

- **Vérifier et refuser, plutôt que reconstruire à chaque mesure.** L'issue
  laissait le choix. La reconstruction a été essayée en premier (`up
  --build`), puis écartée : sur la machine de la session (Docker 29.1.3), deux
  `docker compose build` successifs, entièrement en cache, ont rendu deux
  identifiants d'image différents. Les cinq exécutions d'une preuve de
  l'oracle ne partageraient plus `images.legacy`, que `oracle/proof.ts`
  exige. Contrepartie : il faut relancer `npm run stack:up` depuis la copie
  qui mesure.
- **Tout le contexte de construction, pas les fichiers des `COPY`.** La
  première version (commit `e76f5f4`) lisait les `COPY` des Dockerfile pour
  savoir quels fichiers hacher. Karim a demandé de prendre tout le contexte,
  moins `.dockerignore` : un contrôle plus large qui refuse parfois pour rien
  vaut mieux qu'un contrôle qui rate un fichier sans le dire. Conséquence
  assumée et écrite dans la spec : une modification de la documentation
  demande aussi un `npm run stack:up` avant de mesurer.
- **Exclure les sorties du banc par `.dockerignore`.** Avec l'empreinte sur
  tout le contexte, une mesure qui écrit sous `results/` et
  `.oracle-artifacts/` changerait l'empreinte de sa propre copie. Les
  exclure de `.dockerignore` les retire du contexte de Docker lui-même :
  l'empreinte reste celle de ce que Docker reçoit.
- **`@balena/dockerignore` plutôt qu'un analyseur écrit à la main.** La
  première version gérait un sous-ensemble (`**/`, `*`, sans exception `!`).
  Karim a demandé la sémantique de Docker, ou une bibliothèque qui
  l'implémente. La dépendance est justifiée : sans dépendance, licence
  Apache-2.0, portage de l'implémentation de Docker.
- **Une cause à part, `stack-not-from-this-copy`.** La première version
  réutilisait `stack-failed-before-candidate`. La revue de la spec a relevé
  qu'une image étrangère peut être saine, et qu'on ne distinguait plus
  « pile malade » de « pile étrangère » sans lire la preuve. Karim a tranché
  pour une cause à part dans la liste fermée, définie dans le glossaire et la
  spec, avec son remède.
- **Deux vérifications.** La première version ne vérifiait qu'à la
  recréation de la pile, en phase 4. La revue de la spec a relevé que la
  construction du candidat (`npm ci`, `build`) avait alors déjà tourné, alors
  que l'issue demande « avant tout code du candidat ». La mesure vérifie
  donc aussi les images construites en préparation (commit `8f85f56`). La
  vérification des conteneurs reste : elle sert à l'oracle et à
  l'étalonnage, et couvre une reconstruction faite entre-temps.
- **Un faux `docker` pour tester le passage à la cause**, demandé par Karim.
  Le test lance la vraie commande `migrabench measure`, sans toucher à la
  pile, sur le modèle de `bench-lock-tools.test.ts`.
- **L'étape de CI recopiée dans quatre jobs** : gardée telle quelle,
  décision de Karim après la revue des normes.

## Difficultés rencontrées

- **Un identifiant d'image neuf à chaque reconstruction.**
  - Symptôme : avec `recreateStack` en `up --build`, deux `docker compose
    build legacy archive` de suite, en cache, ont rendu `sha256:b5c20c28…`
    puis `sha256:5c10cb68…` pour le legacy, avec la même date de création.
  - Cause : non établie. La session n'a pas cherché plus loin.
    > À vérifier : cause du changement d'identifiant (attestations de
    > construction, stockage d'images de containerd ?), non étudiée.
  - Résolution : la reconstruction est abandonnée au profit de la
    vérification (voir les choix).
- **`No such image` dans `npm test`.**
  - Symptôme : après ces reconstructions d'essai, `verifyStackImages` a
    échoué sur `docker image inspect … sha256:18d04594… exited with code 1:
    No such image`.
  - Cause : la vérification lisait les labels sur l'image d'un conteneur en
    cours. Cette image avait été remplacée sous son tag, puis supprimée.
  - Résolution : les labels sont lus sur le conteneur, dont la configuration
    reprend ceux de l'image.
- **Le premier test de la seam A était rouge.**
  - Symptôme : `verifyStackImages` refusait la pile en cours,
    `promise rejected "StackNotFromCopy: Stack images not built …" instead of
    resolving`.
  - Cause : les images de la pile avaient été construites avant le ticket,
    sans label.
  - Résolution : après `npm run stack:up`, qui pose les labels, le test est
    passé. C'est exactement le cas que le ticket doit refuser.
- **L'import de `@balena/dockerignore` ne compilait pas.**
  - Symptôme : `error TS2349: This expression is not callable`.
  - Cause : c'est un paquet CommonJS. Sous `"module": "NodeNext"`, ses types
    placent la fabrique sous `default`.
  - Résolution : `dockerignoreModule.default`. La session a vérifié qu'au
    runtime, l'import par défaut et son `.default` sont tous deux la
    fonction.

## Vérifier soi-même

Depuis une copie propre au commit `770eb25` ou après :

```sh
npm run stack:up
node scripts/stack-context-env.ts
docker inspect --format '{{index .Config.Labels "org.migrabench.context-digest"}}' $(docker compose ps --quiet legacy)
```

Observé au commit `770eb25`, arbre propre : les deux variables valent
`sha256:356684420bd4271b015303a4f3f44d9b60e6e85456204ef7476548e9abda21ae`
(les deux services ont le même contexte), et le label du conteneur `legacy`
est la même valeur.

```sh
npx vitest run tests/oracle/stack-images.test.ts tests/runner/stack-not-from-this-copy.test.ts tests/seam-a/stack-images.test.ts tests/runner/verdict.test.ts
```

Observé au commit `770eb25` : `Test Files  4 passed (4)`, `Tests  50 passed (50)`.

Mesure négative : une image du legacy qui porte un label étranger.

```sh
MB_LEGACY_CONTEXT_DIGEST=sha256:$(printf '0%.0s' $(seq 64)) \
MB_ARCHIVE_CONTEXT_DIGEST=$(node scripts/stack-context-env.ts | sed -n 's/MB_ARCHIVE_CONTEXT_DIGEST=//p') \
  docker compose build legacy archive
npm run migrabench -- measure --candidate fixtures/reference-candidate
```

Observé : mesure `20261124T201034Z-770eb25-reference-candidate`, commit
`770eb25`, `worktree: "clean"`, code de sortie `3`. Verdict `invalid`,
`stack-not-from-this-copy`, avec la preuve `Stack images not built from this
copy of the repository: legacy image sha256:92316990… carries
sha256:0000…0000, this copy gives sha256:35668442…. Remedy: run `npm run
stack:up` from this copy of the repository.` Phases : `preparation` en
`stack-not-from-this-copy`, puis `contract`, `build`, `start`, `oracle` et
`gates` en `not-run`, et `closing` en `ok`.

Mesure positive :

```sh
npm run stack:up
npm run migrabench -- measure --candidate fixtures/reference-candidate
```

Observé : mesure `20261124T201045Z-770eb25-reference-candidate`, commit
`770eb25`, `worktree: "clean"`, code de sortie `0`. Verdict `completed`,
38 scénarios passés sur 38. `environment.imageContexts.legacy` vaut
`sha256:35668442…`, à côté de `images.legacy` `sha256:ebc5319a…`.

Les mesures faites pendant la session avec un arbre modifié ne comptent pas
comme preuves. Elles ne sont pas citées ici.

Suite complète : `npm test` a rendu `Test Files  75 passed (75)` et
`Tests  654 passed | 1 skipped (655)`. L'arbre était celui commité ensuite
en `770eb25`, sans modification entre la suite et le commit.

CI de la PR #105, au commit `5e187e6` (head SHA
`5e187e6b1d44d47d451416b87cf395fe3dc2069f`), tous les jobs sont verts :

- [Tests du banc, exécution 45478549578](https://github.com/karAmmi12/migrabench/actions/runs/45478549578),
  de 20:13:37Z à 20:16:58Z : `Test Files  75 passed (75)`,
  `Tests  654 passed | 1 skipped (655)`. On y trouve
  `tests/seam-a/stack-images.test.ts (5 tests)` et, dans le groupe
  `foreign-stack`, `tests/runner/stack-not-from-this-copy.test.ts (1 test)`.
- [Oracle, exécution 45478549695](https://github.com/karAmmi12/migrabench/actions/runs/45478549695),
  de 20:13:37Z à 20:21:53Z : jobs `oracle` et `proof` verts. La preuve, sur
  des images construites une fois avec leur label, rend
  `Proof holds on 5 results.` Les cinq exécutions partagent donc
  `images.legacy`.
- [Étalonnage, exécution 45478549814](https://github.com/karAmmi12/migrabench/actions/runs/45478549814),
  de 20:13:37Z à 20:17:58Z : construction avec
  `MB_LEGACY_CONTEXT_DIGEST: sha256:05e5e61c…`, puis
  `Calibration: results/calibration/20261124T201507Z-5e187e6-ci45478549814.1-1.json`.
  L'empreinte diffère de celle observée en local (`sha256:35668442…`) : le
  commit `5e187e6` ajoute cette fiche, qui fait partie du contexte.

## Pour aller plus loin

- **#68 (pannes de la pile et erreurs du runner)** : une erreur imprévue
  pendant la vérification (Docker injoignable) remonte encore comme une
  exception, sans issue nommée.
- **#97 (provenance des mesures comptées)** : `imageContexts` relie les
  images aux fichiers d'une copie propre. Une mesure comptée pourrait exiger
  ce lien.
- **Limite connue** : l'empreinte couvre aussi des fichiers que les images
  n'utilisent pas (documentation, tests). Une modification de ces fichiers
  demande un `npm run stack:up` avant de mesurer. C'est volontaire (voir les
  choix). Les élargir dans `.dockerignore` réduirait ces refus, sans risque
  de rater un fichier : un fichier exclu n'atteint plus Docker.
