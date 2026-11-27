# #134 · Étape 4 · Lighthouse (résultat relevé)

## Objectif

Rien ne relevait encore la performance d'un candidat, que `PROTOCOL.md`
annonce. Ce ticket ajoute la porte Lighthouse. Elle lance trois passes de
Lighthouse sur l'écran d'arrivée du candidat (`BASE_URL`), en session
d'agent, dans le Chromium figé du banc. Elle range le score et quatre mesures
de chaque passe, puis leur médiane, dans un résultat **relevé**, sans aucun
seuil. Pour joindre ce Chromium, le service `browser` gagne une passerelle CDP
protégée par un jeton : le candidat ne doit pas pouvoir piloter le navigateur
qui le juge.

## Notions à connaître

- **Lighthouse, mode « navigation »** : Lighthouse charge une URL, enregistre
  une trace et en tire des mesures : LCP (plus grand affichage), TBT (temps
  de blocage), CLS (décalages de mise en page) et Speed Index. Il en déduit
  un score de performance de 0 à 1. —
  [Performance scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring)
- **Ralentissement simulé** (`throttlingMethod: "simulate"`, valeur par
  défaut) : Lighthouse charge la page sans ralentissement, puis simule le
  chargement sur un réseau et un processeur plus lents. —
  [throttling.md, v13.6.0](https://github.com/GoogleChrome/lighthouse/blob/v13.6.0/docs/throttling.md)
- **`extraHeaders` et `disableStorageReset`** :
  - `extraHeaders` ajoute des en-têtes à chaque requête : c'est l'option 3 des
    pages authentifiées, par `Authorization` ;
  - `--disable-storage-reset`, faux par défaut, empêche de vider le cache et
    le stockage avant une passe (aide de la CLI, `readme.md` du paquet
    13.6.0). —
  [authenticated-pages.md, v13.6.0](https://github.com/GoogleChrome/lighthouse/blob/v13.6.0/docs/authenticated-pages.md)
- **Lighthouse avec Puppeteer** : `lighthouse(url, flags, config, page)`
  reçoit une page Puppeteer. Puppeteer se connecte à un Chrome déjà lancé par
  `puppeteer.connect({ browserWSEndpoint })`. —
  [puppeteer.md, v13.6.0](https://github.com/GoogleChrome/lighthouse/blob/v13.6.0/docs/puppeteer.md),
  [puppeteer.connect](https://pptr.dev/api/puppeteer.puppeteer.connect)
- **Chrome DevTools Protocol (CDP)** : le protocole par lequel un outil pilote
  Chromium (`Network.clearBrowserCache`, `Storage.clearDataForOrigin`…).
  Lighthouse ne parle que ce protocole, alors que l'oracle passe par celui
  de Playwright. —
  [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- **chrome-launcher** : le lanceur de Chrome de Lighthouse. Ses options par
  défaut (`Launcher.defaultFlags()`) coupent les tâches de fond qui
  fausseraient une mesure. —
  [chrome-launcher](https://github.com/GoogleChrome/chrome-launcher)

Liens ouverts le 2026-11-27 (`curl -L`) : chacun répond `200`.

## Ce qui a été construit

- **`fixtures/browser/cdp-gateway.mjs`** : la passerelle CDP du service
  `browser`, sur le port `9222`, publié en `127.0.0.1:8096`.
  - `POST /<jeton>/launch` lance un Chromium complet de l'image, en nouveau
    mode headless, avec les options de chrome-launcher. La réponse donne son
    chemin DevTools.
  - `GET /<jeton>/cdp/<id>/devtools/…` relaie la connexion WebSocket. Le
    chemin est réécrit, et le jeton n'atteint jamais Chromium.
  - `POST /<jeton>/close/<id>` arrête ce Chromium.
  - Toute autre requête reçoit `403`, et sans jeton dans le service, tout est
    refusé.
- **`shared/browser-token.ts`, `docker-compose.yml`** : le jeton de la pile
  (`MB_BROWSER_TOKEN`). Il est tiré :
  - par `npm run stack:up`, qui l'écrit dans `.dev-browser-token` ;
  - par chaque mesure, qui le passe à `recreateStack` et à ses portes
    (`GateContext.browserToken`) ;
  - par le job `tests` de la CI.
- **`gates/cdp-browser.ts`** : le client de la passerelle côté banc.
- **`gates/lighthouse.ts`** : la porte, placée après XSS dans le registre.
  - Préparation : l'agent de `fixtures/users.json`, Lighthouse
    (`desktop-config.js`, performance seule, ralentissement simulé), le
    Chromium et la connexion CDP.
  - Examen : trois passes, chacune sur une page neuve, chaque LHR rangé comme
    brut (`gates/lighthouse/pass-<N>.json`).
  - Résultat relevé `performance` : `examined` vaut le nombre de passes
    abouties ; `values` donne chaque passe et la médiane ; `findings`, les
    passes qui n'ont pas abouti.
- **Sonde d'isolation (#66)** : une tentative `reach-browser-cdp`, qui joint
  `browser:9222` depuis le réseau `default`. Elle n'est refusée que sur deux
  `403`.
- **Cas des mesures** : le candidat de référence attend `measured`, et les
  candidats sans écran attendent `not-evaluable`.
- **Dépendances** :
  - `lighthouse` 13.6.0, publiée le 2026-10-27, la dernière stable. Elle
    dépend d'axe-core 4.14.0, déjà épinglé par #128 ;
  - `puppeteer-core` 25.19.0, la version que Lighthouse résout lui-même,
    importée par la porte pour `puppeteer.connect`.
- **Docs** : la spec 04 (précisions de #134), le README (jeton de
  développement) et l'issue #160.

## Les choix faits et pourquoi

- **Passerelle CDP à jeton** (décision de Karim), plutôt qu'un port CDP
  relayé tel quel ou que Lighthouse lancé dans le conteneur. Le candidat est
  sur `default`, comme le service `browser`. Un port CDP ouvert lui
  permettrait de piloter la page mesurée, voire de couper la porte. Et
  lancer Lighthouse dans le conteneur demanderait `docker exec`, alors
  qu'une porte ne touche jamais Docker.
- **Le port 3000 de Playwright protégé à part, dans #160** (décision de
  Karim : une issue prioritaire si cela dépasse le ticket). `run-server
  --path` existe, mais le serveur rend son chemin à `GET /json`. Il faut donc
  mettre le même jeton devant Playwright, puis le faire passer à l'oracle et
  aux tests : c'est trop pour ce ticket.
- **Jeton tiré par le banc, et non par le service** : seul celui qui démarre
  la pile le connaît. Le service ne le publie nulle part.
- **Chromium complet de l'image** plutôt que le headless shell utilisé par
  Playwright. C'est le même binaire figé, lancé en nouveau mode headless
  comme le recommande la documentation de Lighthouse. Ses options sont
  celles de chrome-launcher, et un test vérifie qu'elles le restent.
- **Lighthouse 13.6.0**, plutôt qu'une `13.6.0-dev` : la dernière version
  stable, avec un mois de recul (même règle qu'axe en #128).
- **`puppeteer-core` épinglé à part**, plutôt qu'importé de façon transitive :
  la porte l'importe elle-même. La version est celle que Lighthouse résout, et
  npm la déduplique.
- **Une passe aboutit** quand le LHR n'a pas de `runtimeError` et qu'il porte
  le score et les quatre mesures. La médiane porte sur les passes abouties.
  Aucune passe aboutie donne `not-evaluable`.
- **La médiane est prise mesure par mesure** : le score et le LCP médians
  peuvent venir de passes différentes (spec 04, après la revue « spec »).
- **Le candidat d'essai est mesuré en local**, comme en #130, et non par un
  nouveau cas du job des mesures. Ce cas aurait coûté des minutes de CI que
  le ticket ne prévoit pas.

## Difficultés rencontrées

- **Lighthouse ne joint pas le Chromium figé.**
  - Symptôme : le service `browser` n'expose que le protocole de Playwright
    (`chromium.connect`), alors que Lighthouse veut un point CDP.
  - Cause : `filterLaunchOptions` de `playwright-core` ignore les `args` d'un
    client sans `--unsafe`. On ne peut donc pas demander
    `--remote-debugging-port`.
  - Résolution : la passerelle CDP, après la question posée à Karim.
- **Un chemin secret ne protège pas `run-server`.**
  - Symptôme : `curl http://127.0.0.1:8095/json` rend
    `{"wsEndpointPath":"/"}`.
  - Cause : le serveur de Playwright répond à `GET /json` par son chemin,
    sans contrôle.
  - Résolution : la protection du port 3000 est reportée dans #160, et la
    passerelle exige le jeton sur toutes ses routes.
- **Le banc occupé par une autre session.**
  - Symptôme : `npm run stack:up` a répondu `refused-lock`, le verrou étant
    tenu par une sonde de #131. Plus tard, une mesure de `relay-untouched`
    est sortie invalide (`marker-out-of-place`).
  - Cause : la sonde de #131 tenait le verrou. Pour la mesure invalide, des
    requêtes marquées du Seam A sont arrivées pendant la mesure. Au même
    moment, le worktree `migrabench-130` lançait `vitest` directement, donc
    sans verrou.
  - Résolution : attente du verrou. La mesure de `relay-untouched` est
    laissée à la CI.
- **Des chemins locaux dans un LHR.** Le rapport de la passe sans identifiants
  contient 50 chemins `/Users/…` dans ses piles d'erreur, et aucun fichier du
  dépôt n'en contient. Il n'est pas versionné : le cas d'une passe qui
  n'aboutit pas vient des mesures.
- **Le test d'axe-core en échec dans `npm test`.**
  - Symptôme : `names the axe-core version installed for
    @axe-core/playwright`, qui attendait `undefined`.
  - Cause : Lighthouse dépend aussi d'axe-core 4.14.0, et npm l'a remonté à
    la racine de `node_modules`.
  - Résolution : le test suit la résolution de Node, sous le paquet puis à
    la racine.
- **Rouge d'abord, en partie seulement.** La passerelle et l'ordre du
  registre ont eu leur test rouge, de même que la sonde d'isolation : 9
  échecs sur le vrai `start.log` d'avant. En revanche, `passOutcome`,
  `median` et `lighthouseResult` ont été écrits avant leurs tests, qui sont
  passés du premier coup.
- **Le service `browser` tombé en CI.**
  - Symptôme : sur le commit de fusion `63d6092`, le job `tests` de
    l'[exécution 46006087156](https://github.com/karAmmi12/migrabench/actions/runs/46006087156)
    échoue. Trois tests de `interrupted-measure.test.ts` voient leur mesure
    sortir en `stack-down-while-candidate`, et `compose-ps.txt` montre
    `migrabench-browser-1` en `Exited (1)`.
  - Cause : le journal du service donne `ENOTEMPTY: directory not empty,
    rmdir '/tmp/mb-cdp-…/Default'`. À l'arrêt d'un Chromium, l'effacement de
    son profil échouait pendant que ses processus fils y écrivaient encore,
    et la promesse rejetée, sans gestionnaire, arrêtait Node. C'est une
    course : la CI du commit `08927c2` ne l'avait pas rencontrée.
  - Résolution : `removeProfile` réessaie trois fois et ignore l'échec. Le
    conteneur et son `/tmp` sont recréés avec la pile. Test rouge d'abord :
    `removeProfile is not a function`.
- **Relevé par les revues** :
  - « normes » :
    - « relais CDP » réutilisait le mot du glossaire réservé au candidat de
      référence : renommé en passerelle ;
    - un Chromium introuvable aurait fait tomber le service (`error` sans
      écouteur) ;
    - un échec de `close()` masquait le résultat ;
    - le jeton pouvait finir dans `measure.json` par un message d'erreur.
  - « spec » :
    - `puppeteer.connect` dans l'examen aurait compté une panne du banc
      contre le candidat ;
    - toute exception d'une passe devenait « non aboutie ».

  Tout est corrigé dans `9d1b088`.

## Vérifier soi-même

```sh
node .probes/134/probe.ts
```

La sonde n'est pas versionnée. Elle a tourné sur un arbre propre au commit
`6151131`, après `npm run stack:up` (`tests/fixtures/probe134-6151131/PROVENANCE.md`).

| Essai | Observé |
|---|---|
| `GET /json/version`, `GET /json` sans jeton, lancement avec un faux jeton | `403` chacun |
| Passe sans `Authorization` | `FAILED_DOCUMENT_REQUEST` (`net::ERR_INVALID_AUTH_CREDENTIALS`) |
| Trois passes avec `Authorization` | score `1`, document en `200` |
| `timing.entries` de chaque passe | `lh:storage:clearDataForOrigin`, `lh:storage:clearBrowserCaches` |
| Passe témoin `disableStorageReset: true` | aucune des deux entrées |

```sh
npm run stack:up && npm test
```

Observé sur le commit `9d1b088`, arbre propre :
`Test Files  102 passed (102)`, `Tests  1141 passed (1141)`.

```sh
npm run migrabench -- measure --candidate fixtures/reference-candidate
npm run migrabench -- measure --candidate fixtures/trial-candidates/claude-code-20261126/candidate
```

Observé sur un arbre propre au commit `9d1b088` (`environment.worktree:
"clean"`) :

| Mesure | Verdict | Lighthouse | Médiane | Phase `gates` |
|---|---|---|---|---|
| `20261127T125345Z-9d1b088-reference-candidate` | `completed` | `measured`, `examined` 3 | score 1, LCP 165,302 ms, TBT 0, CLS 0, SI 165,302 ms | 30 034 ms |
| `20261127T125438Z-9d1b088-trial-candidates-claude-code-20261126-candidate` | `completed` | `measured`, `examined` 3 | score 1, LCP 161,20545 ms, TBT 0, CLS 0, SI 161,20545 ms | 29 912 ms |

- Les deux mesures relèvent `environment.gateTools` :
  `{"axe-core":"4.14.0","lighthouse":"13.6.0"}`.
- Chaque passe de Lighthouse dure de 5 230 à 5 500 ms (`timing.total` des six
  LHR).
- Sur la mesure du candidat de référence, entre le dernier brut de XSS
  (13:54:12) et celui de la troisième passe (13:54:29), environ 17 s sont
  ajoutées en local.
- Sur la mesure du candidat d'essai de `e353940`, le bundle
  `index-I9g1PzZt.js` est transféré en entier à chaque passe (229 968
  octets), et le document est en `200` : le cache est vidé, et les
  identifiants sont gardés.

Ces scores sont relevés sous la limite provisoire de #66 : ils ne servent à
aucune conclusion.

La sonde d'isolation, mesurée sur un arbre propre au commit `e353940`
(`20261127T124602Z-e353940-defective-candidates-isolation-probe`,
`tests/fixtures/local-e353940/`), écrit :
`"reach-browser-cdp","refused":true,"detail":"GET http://browser:9222/json/version 403, POST http://browser:9222/launch 403"`.
Sur la même version, un candidat sans écran donne `not-evaluable`
(`CHROME_INTERSTITIAL_ERROR` aux trois passes).

**En CI, sur la vraie pile** :

Les jobs ont tourné sur le commit `08927c2` :

- `tests` : [exécution 46002941574](https://github.com/karAmmi12/migrabench/actions/runs/46002941574),
  `Test Files  102 passed (102)` ;
- `typecheck` : [exécution 46002940761](https://github.com/karAmmi12/migrabench/actions/runs/46002940761) ;
- `oracle` et `proof` : [exécution 46002940768](https://github.com/karAmmi12/migrabench/actions/runs/46002940768) ;
- `measures` : [exécution 46002940746](https://github.com/karAmmi12/migrabench/actions/runs/46002940746).
  Chaque cas y est conforme à l'attendu.

| Mesure | Lighthouse | Phase `gates` |
|---|---|---|
| Candidat de référence | `measured`, `examined` 3, score 1 | 33 733 ms |
| `relay-alters-label`, les quatre candidats XSS | `measured`, `examined` 3 | de 33 744 à 34 401 ms |
| `relay-untouched`, `relay-forged-healthcheck`, sonde d'isolation | `not-evaluable`, `CHROME_INTERSTITIAL_ERROR` | de 23 988 à 24 222 ms |

- La sonde d'isolation : `isolation-probe: … is the expected measure
  (completed, ok, exit code 0)`. Son constat de démarrage, `reach-browser-cdp`
  compris, est contrôlé par `run-measure-case.ts`.
- **Durée ajoutée.** La phase `gates` du candidat de référence passe de
  12 452 ms
  ([exécution 45914452588](https://github.com/karAmmi12/migrabench/actions/runs/45914452588),
  commit `622d332`, dernier job des mesures avant Lighthouse) à 33 733 ms,
  soit **+21,3 s par mesure**, sous le seuil de 5 minutes.
- Le job des mesures entier passe de 12 min 43 s à 17 min 46 s, soit
  +5 min 3 s. Ce sont neuf mesures qui atteignent la phase `gates` : cet
  écart est signalé à Karim.
- **Après le correctif de la passerelle** (`d905931`), toute la CI est
  verte : `tests` ([exécution 46007311289](https://github.com/karAmmi12/migrabench/actions/runs/46007311289)),
  `typecheck` ([exécution 46007311348](https://github.com/karAmmi12/migrabench/actions/runs/46007311348)),
  `oracle` et `proof` ([exécution 46007311235](https://github.com/karAmmi12/migrabench/actions/runs/46007311235)).
  Le job des mesures y est sauté par le périmètre de CI. Une mesure locale
  sur un arbre propre à `d905931` le remplace
  (`20261127T133436Z-d905931-reference-candidate`) : `completed`, Lighthouse
  `measured`, `examined` 3, phase `gates` 29 848 ms, service `browser` sain
  après la mesure.
- Le LHR d'une passe qui n'aboutit pas, celle de `relay-untouched`, est copié
  dans `tests/fixtures/ci46002940746/`.

## Pour aller plus loin

- **#160** : la même protection pour le serveur de Playwright, avec la
  tentative sur `browser:3000` dans la sonde d'isolation.
- **#100, étalonnage** : le délai de la porte (5 min), et tout seuil de
  performance.
- **Limite connue** : un Chromium lancé dans une préparation coupée par son
  délai reste ouvert jusqu'à la recréation suivante de la pile.
- **Étape 5** : le poids d'un résultat relevé dans le score, et le cas des
  candidats sans écran (`not-evaluable`).
