# #149 · CI · Cache du dépôt Maven pour la construction du legacy

Niveau de rigueur : allégé (CI).

## Objectif

L'image du legacy se construit avec Maven, qui télécharge ses dépendances et
ses plugins sur Maven Central. En CI, chaque job repartait d'un dépôt Maven
vide : le 26/11, une panne de Maven Central a fait échouer deux fois la
construction (#145, #147), et seule une relance a débloqué la CI. Le ticket
garde le dépôt Maven d'une exécution de CI à l'autre, sous l'empreinte du
`pom.xml`, pour que la construction n'ait plus besoin de Maven Central tant
que le `pom.xml` ne change pas.

## Notions à connaître

- **Cache de montage de BuildKit** (`RUN --mount=type=cache`) : un dossier
  monté pendant une instruction `RUN`, gardé par le builder d'une
  construction à l'autre, et jamais copié dans l'image. Documentation
  officielle : <https://docs.docker.com/reference/dockerfile/> (section
  `RUN --mount`) et <https://docs.docker.com/build/cache/optimize/>.
- **`actions/cache/restore` et `actions/cache/save`** : les deux moitiés de
  `actions/cache`, appelées comme étapes séparées. `restore` rend
  `cache-hit` (`true` seulement si la clé exacte est trouvée) et
  `cache-primary-key`. Documentation de la version épinglée (v6.1.0) :
  <https://github.com/actions/cache/blob/55cc8345863c7cc4c66a329aec7e433d2d1c52a9/restore/README.md>
  et
  <https://github.com/actions/cache/blob/55cc8345863c7cc4c66a329aec7e433d2d1c52a9/save/README.md>.
- **Sorties d'une construction** (`--output type=local`, `type=cacheonly`) :
  `type=local` écrit le système de fichiers de la dernière étape dans un
  dossier de l'hôte ; `type=cacheonly` ne produit rien, la construction ne
  sert qu'à ses effets sur le cache. Documentation officielle :
  <https://docs.docker.com/build/exporters/local-tar/>.

## Ce qui a été construit

- `fixtures/legacy-app/Dockerfile` : les deux appels à `mvn` montent le dépôt
  Maven local (`/root/.m2/repository`) en cache de BuildKit,
  `id=migrabench-maven-repository`. L'image finale ne change pas : elle ne
  reçoit toujours que `ROOT.war` et `tomcat-users.xml`. Ni versions ni
  pièges du legacy ne sont touchés.
- `scripts/maven-cache.sh` : `import <dossier>` verse un dossier dans ce
  cache, `export <dossier>` en copie le contenu dans un dossier de l'hôte.
  Chacun passe par une construction jetable sur l'image Maven du stage
  `build` du legacy. Le script vérifie que le Dockerfile a bien ce stage et
  monte bien ce cache.
- `tests/maven-cache.test.ts` : les gardes du script (usage, stage Maven
  absent, cache non monté), avec un témoin qui passe les gardes sur le vrai
  Dockerfile.
- `.github/workflows/{tests,oracle,measures,calibration}.yml` : dans chacun
  des cinq jobs qui construisent l'image du legacy (tests, oracle, proof,
  measures, calibration), quatre étapes autour de la construction :
  restauration (clé `maven-repository-<OS>-<empreinte du pom.xml>`),
  versement si la clé est trouvée ; sinon, après la construction, extraction
  puis sauvegarde.

## Les choix faits et pourquoi

- **Cache de montage plutôt que cache des couches Docker** (`cache_from`
  `type=gha`) : le cache des couches aurait aussi réutilisé la compilation du
  war et le reste de l'image, et demandé un builder `docker-container`. Le
  cache de montage ne garde que le dépôt Maven, comme demandé ; tout le reste
  de l'image est reconstruit à chaque fois.
- **Dossier du dépôt dans `$RUNNER_TEMP`**, pas dans le dépôt Git : il
  serait entré dans le contexte de construction, et donc dans l'empreinte de
  contexte qu'une mesure vérifie (#102).
- **Clé : empreinte du `pom.xml`**, préfixée par l'OS du runner, comme
  demandé par Karim. Le Dockerfile n'entre pas dans la clé (voir « Pour aller
  plus loin »).
- **Restauration et sauvegarde séparées** (`restore` puis `save`) plutôt que
  l'action combinée : la sauvegarde doit suivre l'extraction, juste après la
  construction, et non arriver en fin de job.
- **`continue-on-error` sur l'extraction et la sauvegarde**, à la suite de la
  revue « spec » : un incident du cache ne doit jamais rendre un job rouge,
  puisque le ticket existe pour éviter des relances.
- **Une étape par job, sans action composite locale** : une action
  `uses: ./…` serait refusée par le contrôle d'épinglage
  (`docs/agents/pinned-actions.md`). Les quatre étapes sont donc répétées
  dans les cinq jobs.
- **Test des seules gardes du script en Vitest** ; les appels à Docker sont
  prouvés par une exécution réelle (voir plus bas) et par la CI. Ajouté à la
  suite de la revue « normes » (CLAUDE.md, « tests quand il y a de la
  logique »), avec la variable `MB_LEGACY_DOCKERFILE` pour donner au script
  un Dockerfile de test.

## Difficultés rencontrées

- **Extraction vide.** Symptôme : après une construction du legacy qui avait
  téléchargé ses dépendances (13,7 s sur `dependency:go-offline`),
  `scripts/maven-cache.sh export` rendait un dossier vide (`0B`), et un
  `RUN --mount=type=cache` de test voyait un cache vide à chaque
  construction. Cause : la première version du script construisait avec
  `--no-cache` pour forcer la copie ; une construction lancée avec
  `--no-cache` monte un cache vide à la place du cache nommé. Établi en
  lançant deux fois la même construction de test : avec `--no-cache`, la
  seconde voyait un cache vide ; sans, elle voyait le fichier de la première.
  Résolution : plus de `--no-cache` ; une valeur unique passée en argument de
  construction (`CACHE_BUST`) force la copie.
- **Preuve sans toucher au cache de la machine.** Pour un témoin sans
  dépôt, il fallait un builder sans cache. Plutôt que de purger le cache de
  Docker de la machine, la preuve a tourné sur un builder BuildKit neuf
  (`docker buildx create --driver docker-container`), supprimé ensuite.

## Vérifier soi-même

Preuve locale, faite dans cette session sur l'arbre du commit `d110270`
modifié par le seul ajout du cache (Dockerfile
`1f7e1774…6fa0ef`, script `5c0b6762…fe6ba6` en sha256, version avant le
renommage `RUN` → `CACHE_BUST`) :

```sh
docker buildx create --name mb-proof-149 --driver docker-container
export BUILDX_BUILDER=mb-proof-149
# témoin : sans versement, hors réseau
docker buildx build --network=none --target build --output type=cacheonly -f fixtures/legacy-app/Dockerfile .
# versement d'un dépôt extrait auparavant, puis même construction
scripts/maven-cache.sh import <dossier>
docker buildx build --network=none --target build --output type=cacheonly -f fixtures/legacy-app/Dockerfile .
docker buildx rm mb-proof-149
```

Observé : le témoin échoue (`exit=1`, `[ERROR] No plugin found for prefix
'dependency' …`) ; après le versement, la construction réussit hors réseau
(`exit=0`). Le dépôt extrait pèse 67 Mo.

Après le renommage (commit `eaae511`), un aller-retour `import` puis
`export` sur le builder de la machine rend `import=0`, `export=0` et 67 Mo.

```sh
npx vitest run tests/maven-cache.test.ts
```

Observé sur le commit `eaae511` : `Tests  6 passed (6)`.

En CI, sur la PR #150, au commit `2134545` (première exécution, aucune clé
encore sauvée) :

- job `oracle` (exécution
  <https://github.com/karAmmi12/migrabench/actions/runs/45867393553>) :
  `Cache not found for input keys:
  maven-repository-Linux-3ec5a7e7…cfad74`, construction de 17:24:48 à
  17:25:21 (`dependency:go-offline` : `DONE 15.1s`), extraction de
  `56.73MB`, puis `Cache saved with key: maven-repository-Linux-3ec5a7e7…` ;
- job `tests` (exécution
  <https://github.com/karAmmi12/migrabench/actions/runs/45867393619>),
  parallèle : `Failed to save: Unable to reserve cache with key …, another
  job may be creating this cache.` Simple avertissement : le job est vert ;
- job `proof`, lancé après `oracle` dans la même exécution : clé trouvée,
  versement en 12 s, construction de 17:26:36 à 17:26:44
  (`dependency:go-offline` : `DONE 3.3s`), extraction et sauvegarde sautées,
  puis `Proof holds on 5 results.`

Le cas « clé trouvée » est donc prouvé par `proof` dans la même exécution,
sans relance. Tous les jobs de la PR sont verts à ce commit (tests, oracle,
proof, calibration, measures, typecheck, pinned-actions, fiche-ticket).

## Pour aller plus loin

- La clé ne suit que le `pom.xml`. Si l'image Maven du Dockerfile change de
  version, les plugins par défaut peuvent changer ; le dépôt gardé reste
  incomplet, Maven télécharge le manque à chaque construction, et la clé ne
  change pas pour le sauver. Il faut alors modifier la clé (ou le
  `pom.xml`).
- Dans `tests.yml`, l'extraction suit `docker compose up --wait` : si un
  healthcheck échoue, rien n'est sauvé par ce job (relevé par la revue
  « spec ») ; les quatre autres jobs sauvent la même clé.
- #129 (porte XSS) est le ticket suivant ; sa CI relancera souvent la pile.
