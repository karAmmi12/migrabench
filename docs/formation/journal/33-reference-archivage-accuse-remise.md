# #33 · Étape 2 · Référence d'archivage sur l'accusé de remise

## Objectif

L'oracle doit vérifier qu'un candidat délivre le vrai accusé de remise, pas
une page qui lui ressemble. Le titre « Accusé de remise du dossier D-00xx »
ne suffit pas : un candidat peut l'écrire lui-même. Ce ticket ajoute à
l'accusé une **référence d'archivage**, calculée avec un **sel** que seuls le
service d'archivage et l'oracle connaissent (`TRAPS.md`, « Référence
d'archivage »). Le legacy et la couche serveur du candidat ne reçoivent
jamais ce sel : un faux accusé ne peut pas porter la bonne référence.

## Notions à connaître

- **HMAC** : un code d'authentification calculé à partir d'une fonction de
  hachage (ici SHA-256) et d'une clé. Sans la clé, on ne peut pas produire
  le bon code pour un message donné. Ici, la clé est le sel et le message le
  numéro du dossier. —
  [RFC 2104 : HMAC](https://www.rfc-editor.org/rfc/rfc2104)
- **`crypto.createHmac` de Node** : `createHmac("sha256", clé)`, puis
  `.update(message)` et `.digest("hex")`. Une clé passée en chaîne est prise
  comme du texte : ce sont les octets UTF-8 de la chaîne, comme
  `openssl dgst -sha256 -hmac <clé>`. —
  [Node.js 22 : Crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html)
- **`environment` d'un service Compose, variable sans valeur** : écrire
  `- ARCHIVE_SALT` sans `=` reprend la valeur « for the same variable in the
  shell in which Compose is run ». Si le shell ne l'a pas, la variable n'est
  pas transmise du tout. —
  [Compose : Set environment variables](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)
- **Fusion de fichiers Compose et `!reset`** : un second fichier
  (`--file … --file …`) complète le premier, et `ports: !reset []` efface les
  ports publiés hérités au lieu de s'y ajouter. —
  [Compose : Merge Compose files](https://docs.docker.com/reference/compose-file/merge/)
- **Nom de projet Compose (`-p`, `--project-name`)** : deux projets de noms
  différents ont des conteneurs et des réseaux distincts, même avec le même
  `docker-compose.yml`. —
  [Compose : Specify a project name](https://docs.docker.com/compose/how-tos/project-name/)
- **`GITHUB_ENV` et `::add-mask::` dans GitHub Actions** : une ligne
  `NOM=valeur` écrite dans `$GITHUB_ENV` rend la variable visible aux étapes
  suivantes du job ; `::add-mask::<valeur>` la remplace par `***` dans les
  journaux. —
  [GitHub Actions : Workflow commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)

## Ce qui a été construit

- `fixtures/archive-service/server.ts` : sous le titre de l'accusé, la ligne
  « Référence d'archivage : <référence> » : `HMAC-SHA256(clé = sel,
  message = numéro)`, 12 premiers caractères hexadécimaux, en majuscules. Le
  sel vient de `ARCHIVE_SALT` ; sans elle (ou vide), le service tire
  32 octets aléatoires au démarrage et ne les révèle pas. Le jeton (`200` ou
  `403`) n'a pas changé.
- `oracle/archive-reference.ts` : le calcul de la référence attendue, côté
  oracle, écrit à part de celui du service.
- `docker-compose.yml` : `environment: - ARCHIVE_SALT` sur le seul service
  `archive`. Rien dans `.env`, que lit aussi le legacy.
- `scripts/stack-up.ts` (`npm run stack:up`) et `scripts/dev-archive-salt.ts` :
  tirent un **sel de développement**, l'écrivent dans `.dev-archive-salt`
  (ignoré par Git, droits `0600`), puis lancent
  `docker compose up --detach --build --wait` avec. `resolveArchiveSalt` donne
  le sel que lisent les tests : `ARCHIVE_SALT` du shell d'abord, puis le
  fichier, sinon un échec explicite.
- `.github/workflows/tests.yml` : une étape tire un sel par job
  (`openssl rand -hex 32`), le masque, et l'écrit dans `GITHUB_ENV` avant le
  démarrage de la pile.
- Tests :
  - `tests/oracle/archive-reference.test.ts` : le calcul de l'oracle sur un
    exemple obtenu avec `openssl`, hors du banc ;
  - `tests/dev-archive-salt.test.ts` : ordre de lecture du sel, échec
    explicite sans sel, refus d'un sel non hexadécimal, fichier ignoré par Git ;
  - `tests/seam-a/archive-reference.test.ts` : la référence de l'accusé vaut
    le HMAC attendu et change avec le numéro ; test négatif : le sel, en
    hexadécimal et en base64, n'apparaît ni dans les corps ni dans les
    en-têtes des réponses `200`, `403` et `404` ; le sel est dans le conteneur
    `archive`, pas dans le conteneur `legacy`, pas dans `.env` ;
  - `tests/seam-a/archive-no-salt.test.ts` et `no-salt.compose.yml` : une
    seconde pile, démarrée sans `ARCHIVE_SALT`, délivre l'accusé avec une
    référence, et la variable n'est dans aucun des deux conteneurs.
- `oracle/collect.ts` et `oracle/execute.ts` : la collecte ajoute
  `saltImposed` aux métadonnées du résultat, juste après `salt`. Il vaut
  `true` quand `ORACLE_SALT` a imposé le sel (exécution de diagnostic), et
  `false` quand l'exécution l'a tiré. Testé dans `tests/oracle/collect.test.ts`
  pour les deux valeurs.
- Documentation : `README.md` (« Tests du banc » : `npm run stack:up`, la
  règle du sel de développement ; « Lancer l'oracle » : `saltImposed`),
  `docs/specs/02-oracle.md` (clé prise comme texte, sel de développement,
  `saltImposed` dans les métadonnées et dans le critère de fin).

## Les choix faits et pourquoi

- **La clé du HMAC est le sel pris comme texte**, pas ses octets décodés de
  l'hexadécimal. La spec écrivait seulement « clé = sel ». Le texte se
  vérifie avec `openssl dgst -sha256 -hmac <sel>`, sans décodage. Choix
  confirmé par l'humain et écrit dans la spec de l'étape 2.
- **Deux calculs écrits à part**, un dans le service et un dans l'oracle,
  plutôt qu'un module partagé. Le service est un fichier seul, construit dans
  son image sans dépendance, et l'oracle ne doit pas reprendre le code qu'il
  vérifie. L'exemple calculé avec `openssl` fixe la valeur attendue. Un
  commentaire du service renvoie à son pendant dans l'oracle.
- **`- ARCHIVE_SALT` sans valeur** dans la composition, plutôt que
  `ARCHIVE_SALT: ${ARCHIVE_SALT:-}`. La seconde forme passerait une chaîne
  vide quand le shell n'a pas la variable ; la première ne passe rien.
  Le service traite de toute façon une valeur vide comme une absence (`||`).
- **Échec explicite, pas de saut silencieux.** Sans sel connu, les tests de
  la référence échouent avec « No archive salt: run `npm run stack:up`… ».
  Un test sauté pourrait cacher l'absence de vérification en CI. Décision de
  l'humain, qui a demandé `npm run stack:up` pour garder `npm test` simple en
  local.
- **Le sel de développement ne sert jamais à une exécution mesurée.** Il est
  sur le disque en clair, lisible par tout ce qui tourne sur la machine.
  `npm run oracle` tire toujours le sien et recrée la pile avec
  (`oracle/execute.ts`). Règle écrite dans le README et la spec.
- **Le sel imposé se voit dans le résultat**, au lieu d'un ticket à part
  pour refuser le sel de développement. Sans `saltImposed`, rien ne
  distinguait un résultat de diagnostic d'une mesure : `ORACLE_SALT` aurait
  pu recevoir le contenu de `.dev-archive-salt` sans laisser de trace. Une
  mesure doit maintenant avoir `saltImposed: false`. C'est écrit dans le
  critère de fin de la spec et dans un commentaire sur #39, le ticket des
  5 exécutions de preuve. Choix de l'humain.
- **Le fichier est écrit avant le démarrage de la pile**, pour qu'il donne
  toujours le dernier sel passé à la pile, même si `docker compose up` échoue
  ensuite.
- **Une seconde pile pour le test sans sel**, plutôt que redémarrer la pile
  partagée. Vitest lance les fichiers de tests en parallèle : recréer
  `archive` sans sel au milieu de la suite ferait échouer les autres tests.
  La seconde pile porte un autre nom de projet, reprend les images
  `migrabench-legacy` et `migrabench-archive` sans les reconstruire
  (`--no-build --pull never`) et ne publie aucun port (`!reset`). Le service
  s'appelle lui-même depuis son conteneur.
- **Le test négatif exige un sel hexadécimal.** Il cherche aussi le sel
  décodé puis encodé en base64 : un sel non hexadécimal donnerait un décodage
  tronqué ou vide. Relevé par la relecture « spec ».
- **Relecture en deux axes** (standards et spec), retenu dans `eb19a19` :
  l'exemple `openssl` déplacé dans `tests/oracle/` (il ne demande pas la
  pile), une forme « hexadécimal en majuscules » retirée (la comparaison
  ignore déjà la casse), le renvoi entre les deux calculs, la clé écrite dans
  la spec. Laissé tel quel : le petit doublon de `docker compose exec` avec
  `internal-api-client.ts`.

## Difficultés rencontrées

- **Une valeur attendue écrite avant d'être mesurée.** Symptôme : la
  première version du test de l'exemple portait une valeur inventée. Cause :
  le test a été écrit avant de calculer l'exemple. Résolution : la valeur
  vient de `printf D-0007 | openssl dgst -sha256 -hmac 0011…eeff`
  (`F2930D5D9872`), et le calcul a fait apparaître la question de la clé
  (texte ou octets), tranchée ensuite.
- **`npm test` refusé.** Symptôme : « npm test requires Node 22.23.5
  (.nvmrc), found v24.12.0 ». Cause : le shell n'avait pas chargé `nvm`.
  Résolution : `nvm use`, puis la suite complète.
- **Pile et tests sans le même sel.** Symptôme : après un
  `docker compose up` lancé depuis un shell sans `ARCHIVE_SALT`, le conteneur
  `archive` n'avait plus de sel connu (lu par `printenv` : chaîne vide).
  Cause : chaque `up` qui recrée `archive` prend le sel du shell du moment.
  Résolution : relancer la pile avec un sel connu ; c'est ce qui a motivé
  `npm run stack:up` et son fichier relu par `npm test`. Le README rappelle
  de relancer `npm run stack:up` après un `npm run oracle`.
- **Un test qui ne trouve pas son fichier.** Symptôme : « No test files
  found ». Cause : la commande qui écrivait les deux fichiers du test sans
  sel avait échoué à l'analyse par zsh (`parse error near 'time'`), donc rien
  n'avait été écrit. Résolution : fichiers écrits, puis test relancé.
- **Vérifier que le test sans sel sait échouer.** Pour le voir échouer,
  `ARCHIVE_SALT: fuite` a été ajouté à la fin de `no-salt.compose.yml`. La
  ligne est tombée sous le service `archive`, le dernier du fichier, et non
  sous `legacy`. Le test a échoué sur `archive` (1 échec sur 3), ce qui
  suffit à le montrer discriminant ; le fichier a été restauré.
- **Une remarque de relecture inexacte.** La relecture « spec » affirmait
  que `npm run oracle` ne passe pas encore son sel à la pile. Vérifié dans
  `oracle/execute.ts` : `prepare` lance `docker compose up` avec
  `ARCHIVE_SALT: salt`. Commentaire de la composition gardé.

## Vérifier soi-même

Sorties observées au commit `6827cf3`, Node v22.23.5, Docker Compose
2.40.3-desktop.1.

```sh
npm run stack:up
# … Container migrabench-legacy-1  Healthy
# Stack up with a development salt, written to .dev-archive-salt: never use it for a measured run.

ls -l .dev-archive-salt && git check-ignore .dev-archive-salt
# -rw-------  1 …  65 … .dev-archive-salt
# .dev-archive-salt

curl -s 'http://localhost:8090/accuse-de-remise?jeton=mbtemoin-7c41e9a2b58d306f&numero=D-0007' | grep Référence
# <p>Référence d'archivage : 072A2D024CDA</p>

printf D-0007 | openssl dgst -sha256 -hmac "$(cat .dev-archive-salt)" | awk '{print toupper(substr($2,1,12))}'
# 072A2D024CDA
```

La référence change à chaque `npm run stack:up`, puisque le sel change : la
valeur `072A2D024CDA` n'est que celle de cette session. Ce qui doit se
retrouver, c'est l'égalité entre les deux lignes.

```sh
docker compose exec -T legacy env | grep -c ARCHIVE_SALT
# 0

npx vitest run tests/seam-a/archive-no-salt.test.ts tests/seam-a/archive-reference.test.ts \
  tests/oracle/archive-reference.test.ts tests/dev-archive-salt.test.ts
# Test Files  4 passed (4)
#      Tests  19 passed (19)

npm test
# Test Files  18 passed (18)
#      Tests  128 passed (128)
```

`npm test` a été observé sur l'arbre de travail de `6827cf3` avant son
commit (fichiers identiques).

Sans sel connu (ni `ARCHIVE_SALT`, ni `.dev-archive-salt`), les tests de la
référence échouent sans être sautés :

```sh
mv .dev-archive-salt /tmp/ && npx vitest run tests/seam-a/archive-reference.test.ts; mv /tmp/.dev-archive-salt .
# Error: No archive salt: run `npm run stack:up`, or start the stack and the tests with the same ARCHIVE_SALT (README)
# Tests  6 failed | 2 passed (8)
```

`saltImposed`, observé au commit `0d05d84` : le test, écrit d'abord, a
échoué pour les deux valeurs (`Tests  2 failed | 18 passed (20)`), puis :

```sh
npx vitest run tests/oracle/collect.test.ts -t "whether it was imposed"
# Tests  2 passed | 18 skipped (20)

npm test   # pile de npm run stack:up, sans ARCHIVE_SALT dans le shell
# Test Files  18 passed (18)
#      Tests  129 passed (129)
```

En CI, sur la PR #42, commit `7f5d4b5` : « Tests du banc », exécution
[44927732538](https://github.com/karAmmi12/migrabench/actions/runs/44927732538),
`success` en 98 s (17:01:20Z → 17:02:58Z). Le sel tiré par le job apparaît
masqué dans le journal (`ARCHIVE_SALT: ***`), et le test sans sel passe sur le
runner :

```text
✓ tests/seam-a/archive-no-salt.test.ts (3 tests) 14780ms
Test Files  18 passed (18)
     Tests  128 passed (128)
```

## Pour aller plus loin

- #39 : les 5 exécutions de preuve doivent toutes avoir `saltImposed: false`
  ([commentaire](https://github.com/karAmmi12/migrabench/issues/39#issuecomment-7066260970)).
- #38 : les scénarios M5 et M6 de l'oracle (`receipt-agent`,
  `receipt-instructeur`) vérifieront la référence avec
  `oracle/archive-reference.ts` et le sel de l'exécution.
- ADR 0004 : le sel s'ajoute aux valeurs que le banc ne transmet pas à la
  couche serveur du candidat.
- Limite connue : le test sans sel suppose les images déjà construites sous
  les noms `migrabench-legacy` et `migrabench-archive`, ce que font
  `npm run stack:up` et la CI.
