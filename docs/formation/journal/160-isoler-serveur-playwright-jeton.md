# #160 · Étape 4 · Isoler le serveur Playwright du banc derrière le jeton du service browser

## Objectif

Le candidat tourne sur le réseau `default`, comme le service `browser`. Il
joignait donc le serveur de Playwright du banc (`browser:3000`) : il pouvait y
ouvrir un navigateur et lire le chemin du serveur par `GET /json`. #134 avait
protégé la passerelle CDP par un jeton tiré à chaque démarrage de la pile. Ce
ticket protège de la même façon le serveur de Playwright, qu'utilisent
l'oracle, les portes à navigateur et les tests.

## Notions à connaître

- **Serveur de Playwright et `browserType.connect`** : un client Playwright se
  rattache à un navigateur distant par une URL WebSocket. C'est ainsi que le
  banc pilote le Chromium de l'image figée depuis l'hôte. —
  [browserType.connect](https://playwright.dev/docs/api/class-browsertype#browser-type-connect)
- **`connectOptions` de Playwright Test** : avec cette option, les fixtures
  `browser`, `context` et `page` utilisent le navigateur distant au lieu d'en
  lancer un. —
  [testOptions.connectOptions](https://playwright.dev/docs/api/class-testoptions#test-options-connect-options)
- **Surcharge d'une fixture** : `test.extend` peut redéfinir une fixture
  existante en reprenant sa valeur d'origine (exemple de `page` dans la
  documentation). L'oracle s'en sert pour ajouter le jeton au point d'entrée
  de la configuration. —
  [Overriding fixtures](https://playwright.dev/docs/test-fixtures#overriding-fixtures)
- **Ouverture d'une connexion WebSocket** : c'est une requête HTTP `GET` avec
  `Upgrade: websocket`, `Sec-WebSocket-Key` et `Sec-WebSocket-Version: 13`.
  Le serveur l'accepte par un `101`, et tout autre statut la refuse. Ce sont
  les en-têtes qu'envoie la sonde d'isolation. —
  [RFC 6455, §1.3](https://www.rfc-editor.org/rfc/rfc6455#section-1.3)
- **Interpolation de Compose** : Compose remplace `${VARIABLE}` partout dans
  le fichier, y compris dans la commande d'un healthcheck. Un `$` littéral
  s'écrit `$$`. —
  [Interpolation](https://docs.docker.com/reference/compose-file/interpolation/),
  [healthcheck](https://docs.docker.com/reference/compose-file/workload-spec/#healthcheck)

## Ce qui a été construit

- **`fixtures/browser/token-gateway.mjs`** (nouveau) : le contrôle du jeton,
  commun aux deux passerelles. Il lit l'en-tête de la requête, compare
  `/<jeton>/` en temps constant (`timingSafeEqual`), puis relaie vers un port
  de la boucle locale. Ce code sort de `cdp-gateway.mjs`, qui l'utilise
  désormais.
- **`fixtures/browser/playwright-gateway.mjs`** et son `.d.mts` (nouveaux) :
  la passerelle du port 3000. Elle relaie `GET /<jeton>/…` à `run-server`, en
  retirant le jeton du chemin, et répond `403` à tout le reste, `GET /json`
  compris.
- **`fixtures/browser/server.mjs`** : `run-server` écoute sur
  `127.0.0.1:3001`, la passerelle sur `0.0.0.0:3000`.
- **`docker-compose.yml`** : monte les nouveaux fichiers. Le healthcheck
  demande `GET /<jeton>/json` et attend `{"wsEndpointPath":"/"}`.
- **`oracle/browser.ts`** : `browserWsEndpoint(token)`, et
  `connectBenchBrowser(token)`, qui masque le jeton dans le message d'un
  échec. Appelants mis à jour : `gates/accessibility.ts`, `gates/xss.ts`,
  `oracle/browser-versions.ts` et les tests à navigateur (par
  `stackBrowserToken()`, dans `shared/browser-token.ts`).
- **`oracle/support.ts`** : la fixture `connectOptions` des scénarios ajoute
  le jeton (`MB_BROWSER_TOKEN`) au point d'entrée de la configuration.
- **`oracle/execute.ts`** : chaque exécution de l'oracle tire son jeton si on
  ne lui en donne pas. Elle le passe à Playwright et masque le jeton dans le
  rapport et dans le journal brut. `recreateStack` exige un jeton.
  `runner/calibrate.ts` tire le sien.
- **Sonde d'isolation** (`fixtures/defective-candidates/isolation-probe/server.js`) :
  nouvelle tentative `reach-browser-playwright`, `GET http://browser:3000/json`
  puis ouverture d'une connexion WebSocket. Le contrôle `scripts/start-report.ts`
  l'exige.
- **Tests** :
  - `tests/browser-playwright-gateway.test.ts` (routage et témoins de refus) ;
  - `tests/browser-playwright-gateway-stack.test.ts` (vraie pile) ;
  - témoin dans `tests/start-report.test.ts`, sur le vrai `start.log` de
    `tests/fixtures/local-f2cdfd1/` ;
  - `tests/runner/interrupted-measure.test.ts`, adapté au jeton.
- **`scripts/ci-scope.ts`** : les jobs `proof` et `measures` tournent quand
  `fixtures/browser/` change.
- **Docs** : `README.md`, ADR 0004, `docs/specs/04-gates.md` (« Précisions de
  #160 »).

## Les choix faits et pourquoi

- **Une passerelle devant `run-server`, plutôt que son option `--path`** : le
  chemin secret se lit par `GET /json` (constat de l'issue). Le jeton se
  place en tête du chemin, comme pour la passerelle CDP : un seul format et
  un seul contrôle pour les deux.
- **Contrôle du jeton mis en commun** (`token-gateway.mjs`) plutôt que copié
  dans une seconde passerelle. Les tests de `cdp-gateway` sont restés verts
  sans changement.
- **Le jeton n'entre pas dans `oracle.json`**. Le reporter JSON de Playwright
  recopie la configuration (`use.connectOptions`) dans le résultat, comme le
  montre `fixtures/trial-candidates/…/oracle.json`. La configuration garde
  donc le point d'entrée sans jeton, qui est refusé, et c'est la fixture qui
  ajoute le jeton. Écarté : mettre le jeton dans la configuration, ou dans
  un en-tête de `connectOptions`, que le reporter recopie aussi.
- **Écarté : `PW_TEST_CONNECT_WS_ENDPOINT`**. C'était le premier essai (voir
  « Difficultés »).
- **Chaque exécution d'oracle et l'étalonnage tirent leur propre jeton**, et
  `recreateStack` l'exige. Sans jeton, la pile démarrerait un navigateur qui
  refuse tout ; un jeton obligatoire fait échouer le typecheck au lieu de la
  mesure.
- **Masquer le jeton dans le rapport et le journal brut de Playwright** : un
  échec de connexion cite l'URL complète, donc le jeton. C'est ce qu'a
  montré la sonde jetable (« Difficultés »). La revue a relevé que le
  journal brut n'était pas masqué ; c'est corrigé.
- **Garder la mesure `local-e353940` (#134)** à côté de la nouvelle
  `local-f2cdfd1`, plutôt que la retirer : la fiche de #134 la cite (relevé
  de la revue).

## Difficultés rencontrées

- **La première vraie mesure de la sonde est invalide** :
  `invalid (stack-not-from-this-copy)`. Cause : le contexte de construction
  du legacy est tout le dépôt, et les images dataient d'avant les derniers
  commits. Résolution : `npm run stack:up`, puis une nouvelle mesure.
- **`PW_TEST_CONNECT_WS_ENDPOINT` est ignoré par l'oracle**. La deuxième
  mesure (commit `b6d1c0f`) finit en `stack-down-while-candidate`. Ses 38
  scénarios échouent en 0 ou 1 ms sur
  `browserType.connect: WebSocket error: ws://127.0.0.1:8095/ 403 Forbidden`.
  Cause : dans `playwright/lib/index.js` (1.65.1), la fixture `connectOptions`
  lit cette variable, mais une valeur `use.connectOptions` de la
  configuration remplace la fixture entière. Le refus par défaut a donc bien
  tenu, mais l'oracle ne joignait plus le navigateur. Résolution : une sonde
  jetable dans `.probes/p160` a montré que surcharger `connectOptions` par
  `test.extend` fonctionne (`1 passed`), sans jeton dans `report.json`. Le
  commit `f2cdfd1` applique cette surcharge.
- **Le message d'échec de la sonde jetable contenait le jeton en clair**
  (`ws://127.0.0.1:8095/<jeton>/ 403 Forbidden`). C'est pourquoi le rapport,
  le journal et `connectBenchBrowser` masquent le jeton.
- **Collision de clé dans `tests/real-fixtures.ts`** : la nouvelle mesure de
  la sonde avait pris la clé `probe`, qui existait déjà (#110).
  `tests/oracle/collect.test.ts` cherchait alors un `oracle/report.json`
  absent. Résolution : clé `probeWithBrowserGateways`.
- **Trois tests de `interrupted-measure.test.ts` échouent**, avec
  `The measure exited with code 0 before playwright test`. Cause : leur faux
  `docker` simulait la recréation de la pile, donc le navigateur gardait le
  jeton de `stack:up` alors que la mesure avait tiré le sien. Résolution : le
  faux `compose up` recrée vraiment le seul service `browser` avec le jeton
  de la mesure, et `afterAll` lui rend le jeton de la pile.

## Vérifier soi-même

Après `npm run stack:up` :

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8095/json
```

Observé : `403`.

```sh
curl -s http://127.0.0.1:8095/$(cat .dev-browser-token)/json
```

Observé : `{"wsEndpointPath":"/"}`.

```sh
npx vitest run tests/browser-playwright-gateway.test.ts tests/browser-playwright-gateway-stack.test.ts
```

Observé : `Tests  20 passed (20)`.

```sh
npm run migrabench -- measure --candidate fixtures/defective-candidates/isolation-probe
```

Observé au commit `f2cdfd1`, sur un arbre propre : `Outcome: completed (ok)`.
Le constat de `start.log` porte :
`"reach-browser-playwright","refused":true,"detail":"GET http://browser:3000/json 403, upgrade http://browser:3000/ 403"`.
Dans l'`oracle.json` de cette mesure, `"wsEndpoint": "ws://127.0.0.1:8095/"`,
sans jeton.

```sh
npm test
```

Observé au commit `1bb8127`, sur un arbre propre :
`Test Files  104 passed (104)`, `Tests  1168 passed (1168)`.

> À vérifier après l'exécution de la CI de la PR : le lien des exécutions
> « Tests du banc » et « Mesures », leur head SHA, et le constat
> `reach-browser-playwright` de la sonde mesurée en CI.

## Pour aller plus loin

- **Pages du candidat et boucle locale du navigateur** : `run-server` écoute
  sur `127.0.0.1:3001` dans le conteneur `browser`. Le JavaScript d'une page
  du candidat, chargée dans ce Chromium, partage cette boucle locale. Avant
  ce ticket, il pouvait déjà joindre `127.0.0.1:3000`, donc ce n'est pas un
  recul, mais ce chemin n'est fermé par rien.
- **Seule la première requête est contrôlée** : la passerelle relaie ensuite
  la connexion telle quelle (keep-alive, trames WebSocket), à qui a déjà
  donné le jeton.
- **La sonde n'a pas de délai d'attente** pour ses requêtes vers `browser`.
  Un service qui accepterait la connexion sans répondre la ferait attendre
  jusqu'au délai de disponibilité du runner.
- **Classement d'un oracle sans navigateur** : la mesure au commit `b6d1c0f`
  a été classée `stack-down-while-candidate`, alors que la pile était saine
  et que Playwright n'avait pas pu se connecter (`remise-summary: no har
  attachment`). Un ticket pourrait donner à ce cas sa propre catégorie.
