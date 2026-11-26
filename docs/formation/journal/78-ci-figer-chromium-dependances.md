# #78 · CI : figer Chromium et ses dépendances système

## Objectif

Les jobs Playwright installaient Chromium et ses dépendances système à chaque
exécution (`npx playwright install --with-deps chromium`). Ces dépendances
suivaient le miroir apt d'Ubuntu, au lieu d'être figées comme le demande la
règle 1 de `PROTOCOL.md` (même état initial). Ce ticket fait tourner Chromium
dans un service de la pile, à partir de l'image officielle de Playwright
épinglée par empreinte. L'oracle, ses tests et les portes à venir s'y
connectent. Il a deux PR : #145 ferme d'abord une limite de l'ADR 0004, et
cette PR ajoute le navigateur.

## Notions à connaître

- **Image officielle de Playwright** : elle contient les navigateurs et leurs
  dépendances système, mais pas le paquet Playwright. Son étiquette doit suivre
  la version de Playwright du projet. —
  [Playwright, Docker](https://playwright.dev/docs/docker)
- **Serveur de Playwright et `connect`** : `run-server` lance un serveur de
  navigateurs, et le client s'y connecte par le protocole de Playwright
  (`chromium.connect`, `use.connectOptions.wsEndpoint`). Les versions majeure
  et mineure du client et du serveur doivent être les mêmes. —
  [Playwright, BrowserType.connect](https://playwright.dev/docs/api/class-browsertype),
  [Playwright, Docker](https://playwright.dev/docs/docker)
- **`connectOverCDP`, écarté** : selon la doc, c'est une connexion « significantly
  lower fidelity than the Playwright protocol connection via
  browserType.connect() ». —
  [Playwright, BrowserType](https://playwright.dev/docs/api/class-browsertype)
- **Empreinte d'index et empreinte de plateforme** : une image multi-plateforme
  a un index, qui référence une image par plateforme. L'index est épinglé, et
  chaque résultat relève l'image de la plateforme qui a réellement tourné. —
  observé avec `docker buildx imagetools inspect` (voir « Vérifier soi-même »).
- **Attribut `address` d'un connecteur Tomcat** : « specifies which address will
  be used for listening on the specified port ». —
  [Tomcat 9, HTTP Connector](https://tomcat.apache.org/tomcat-9.0-doc/config/http.html)

Les pages de Playwright et de Tomcat ont été lues le 2026-11-26 par un agent de
lecture, qui en a rapporté les citations. La page de référence de Compose sur
les adresses fixes a répondu 404. La syntaxe Compose utilisée (alias de
réseau) et la valeur par défaut d'une propriété Tomcat
(`${nom:-défaut}`) ont donc été vérifiées par une vraie exécution
(`.probes/78/`), avec Docker 29.1.3 et Tomcat 9.0.124.

## Ce qui a été construit

- **#145, l'API interne hors du réseau `default`** :
  - le connecteur `8081` de Tomcat écoute seulement sur l'adresse du legacy
    dans `mb-internal`, nommée par l'alias `legacy-internal-api` ;
  - les clients de l'API interne l'appellent par cet alias, `LEGACY_API_URL`
    du candidat compris ;
  - le healthcheck du legacy vérifie l'API par l'alias ;
  - un test du Seam A vérifie qu'un conteneur du seul réseau `default` ne
    joint ni `legacy:8081` ni l'alias ;
  - l'ADR 0004 est mise à jour.
- **`docker-compose.yml`, le service `browser`** :
  - l'image `mcr.microsoft.com/playwright:v1.65.1-noble`, épinglée par
    l'empreinte de l'index ;
  - sur `default` seul, publiée sur `127.0.0.1:8095` ;
  - `playwright-core` du dépôt monté en lecture seule.
- **`fixtures/browser/server.mjs`** : un relais local, puis `run-server`. Le
  relais ne relaie que trois ports, `8080`, `8090` et `8100`, depuis
  `127.0.0.1` et `::1`. Le navigateur voit ainsi le legacy, le service
  d'archivage et le candidat aux mêmes adresses que depuis l'hôte.
- **`oracle/browser.ts`** : l'image épinglée, l'adresse du serveur et
  `connectBenchBrowser()`.
- **`oracle/playwright.config.ts`** : `connectOptions` vers ce serveur.
- **`oracle/browser-versions.ts`** : il relève la version du Chromium
  distant, l'image réellement utilisée et sa plateforme (`browserImage`). Il
  refuse une image qui ne vient pas de l'index épinglé.
- **`oracle/execute.ts`** : `browser` est recréé avec la pile, et
  `browserImage` est ajouté aux métadonnées du résultat, donc aussi à
  l'environnement d'une mesure.
- **Tests** :
  - les quatre tests de l'oracle qui lançaient un Chromium local se
    connectent au navigateur du banc ;
  - `tests/browser-image-sync.test.ts` vérifie l'accord entre l'image,
    `@playwright/test`, `playwright-core`, `docker-compose.yml` et le port du
    candidat relayé, avec trois témoins ;
  - le faux `docker` de `tests/runner/candidate-start.test.ts` connaît le
    nouveau `docker compose up` ;
  - la seconde pile de `archive-no-salt` ne démarre que le legacy et le
    service d'archivage.
- **Workflows** : l'installation de Chromium est retirée des cinq jobs. Une
  étape « Téléchargement de l'image du navigateur » permet d'en relever la
  durée.
- **README et ADR 0004** : la description du service.

## Les choix faits et pourquoi

Tous les choix de conception de ce ticket ont été tranchés par Karim, sur
des options documentées.

- **Navigateur distant dans une image épinglée**, plutôt que :
  - le job entier en conteneur (option A de l'issue), qui aurait changé toute
    la topologie du banc ;
  - un cache seul (option B), qui ne fige pas les dépendances système.
- **Service de la composition, sur `default` seul**, sans `--network host`.
- **Deux navigateurs, une seule image.** Playwright passe par `run-server` et
  `connect`, protocole fidèle. Un Chromium partagé par CDP aurait obligé à
  utiliser `connectOverCDP`, de fidélité plus faible, et Lighthouse
  déconseille de partager le navigateur avec Playwright. Lighthouse (#134)
  aura donc un Chromium de la même image, avec un port de débogage. Ce ticket
  ne le construit pas.
- **Relais local**, plutôt que des noms de service.
  - Le legacy écrit en dur le lien `http://localhost:8090/accuse-de-remise`,
    et il ne se modifie pas.
  - Une origine `http://candidate:8100` ne serait plus un contexte sûr.
  - Avec le relais, `BASE_URL`, les URL des HAR et le contexte sûr ne
    changent pas.
- **Fermer la limite de l'ADR 0004** plutôt que l'étendre au navigateur.
  L'alias évite de figer une adresse IP, comme le demande l'ADR.
- **Image de la plateforme relevée** : son empreinte diffère entre arm64 en
  local et amd64 en CI. C'est la précision de Karim.
- **`playwright-core` du dépôt monté** plutôt que `npx -y playwright@…
  run-server` (exemple de la doc), qui télécharge le paquet à chaque
  démarrage.

## Difficultés rencontrées

- **Résolution de `legacy` sur deux réseaux.** Après la fermeture de `8081`
  sur `default`, les tests de l'API interne ont échoué en
  `ECONNREFUSED 172.19.0.3:8081`.
  - Cause : le service d'archivage, branché sur les deux réseaux, résolvait
    `legacy` vers son adresse dans `default`. Dans la sonde, le client
    n'était que sur `mb-internal`.
  - Résolution : les clients appellent l'alias.
- **`ENOTFOUND` en local, `TimeoutError` en CI.** Le test de l'alias depuis
  `default` attendait `ENOTFOUND` dans un `fetch` de 5 s. En CI, la recherche
  du nom inconnu a dépassé ce délai.
  - Résolution : une résolution de nom sans délai propre, et un témoin
    positif depuis `mb-internal`.
- **Maven Central injoignable en CI.** Une tentative du job `tests` de #145 a
  échoué à la construction de l'image du legacy :
  `mvn dependency:go-offline`, `NoPluginFoundForPrefixException` après 302 s.
  Cette étape précède tout code de la PR, et la relance a réussi.
- **Port `8095` déjà pris.** Le test `archive-no-salt` démarre une seconde
  pile, qui incluait le nouveau service `browser` et son port publié.
  Résolution : il ne démarre que le legacy et le service d'archivage.
- **Résultat de la sonde écrit sous `results/oracle/`.** L'oracle lancé
  pendant la sonde a écrit `20261126T132513Z-5ab7100.json`, obtenu sur un
  arbre modifié. Le fichier a été déplacé dans `.probes/78/` et n'est pas
  versionné.

## Vérifier soi-même

```sh
docker buildx imagetools inspect mcr.microsoft.com/playwright:v1.65.1-noble
```

Observé le 2026-11-26 :

| Élément | Empreinte |
|---|---|
| Index | `sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579` |
| `linux/amd64` | `sha256:766137e2…` |
| `linux/arm64` | `sha256:56be08ac…` |

```sh
npx vitest run tests/browser-image-sync.test.ts
```

Observé sur le commit `eff26f3`, arbre propre : `Tests  5 passed (5)`.

```sh
npm run stack:up && npm test
```

Observé sur le commit `eff26f3`, arbre propre :
`Test Files  1 failed | 92 passed (93)` et
`Tests  996 passed | 3 skipped (999)`. Le fichier en échec,
`archive-no-salt`, a été corrigé ensuite (port `8095` déjà pris). Après
correction, `npm test -- tests/seam-a/archive-no-salt.test.ts` donne
`Tests  3 passed (3)`. La suite complète sur le dernier commit est celle de la
CI.

Sondes locales, sur un arbre modifié : de simples vérifications, pas des
preuves.

| Sonde | Observé |
|---|---|
| Oracle à travers le navigateur distant | 38 scénarios réussis sur 38 |
| HAR | Origine `http://localhost:8080`, Chromium 159.0.8154.6 |
| Mesure du candidat de référence | `completed`, porte du relais `failed` (194 lignes examinées, 188 constats) |
| Depuis la page | Contexte sûr `true`, `legacy:8081` injoignable |

> À vérifier après l'exécution de la CI de la PR : les jobs `tests`, `oracle`,
> `proof`, `measures` et `calibration` sur le head SHA de la PR. Il faut
> relever la durée de l'étape « Téléchargement de l'image du navigateur » sur
> 2 ou 3 exécutions, à comparer aux 18 à 46 s de l'ancienne installation
> (23 jobs récents), et `browserImage.platform` (`linux/amd64`) dans un
> résultat de l'oracle.

## Pour aller plus loin

- **#134, Lighthouse** : un Chromium de la même image, lancé avec un port de
  débogage, auquel Lighthouse se connecte par CDP. Ce montage reste à sonder.
- **#128 et #129, accessibilité et XSS** : les portes à navigateur se
  connectent par `connectBenchBrowser()`.
- **#100, étalonnage** : la charge de l'oracle et des portes dans un navigateur
  distant.
- **ADR 0004** : la topologie complète, avec le navigateur.
