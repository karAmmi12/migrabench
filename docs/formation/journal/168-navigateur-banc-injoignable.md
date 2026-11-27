# #168 · Étape 4 · Navigateur du banc injoignable : mesure invalide (bench-browser-unreachable)

## Objectif

Depuis #160, le navigateur du banc (le Chromium du service `browser`) n'est
joignable que par ses deux passerelles, avec le jeton de la pile. Le candidat
ne le joint pas. Une connexion du banc qui n'y aboutit pas (passerelle qui
refuse, jeton faux, service arrêté) est donc une panne du banc. Pourtant, à
plusieurs endroits, elle était comptée contre le candidat : scénarios de
l'oracle échoués, relevé de la version du navigateur rangé en
`stack-down-while-candidate`, porte des rôles en erreur pendant son examen.
Ce ticket en fait une mesure invalide (règle 7), avec une cause nommée :
`bench-browser-unreachable`.

## Notions à connaître

- **Règle 7 du protocole** : une mesure n'est invalidée que sur une preuve que
  le candidat ne peut ni recevoir ni fabriquer. C'est pourquoi la panne n'est
  jamais lue dans le message d'un scénario : une page du candidat peut y
  faire apparaître n'importe quel texte. — `PROTOCOL.md`, « Règles ».
- **Fixture de worker de Playwright Test** : une fixture `{ scope: "worker" }`
  est préparée une fois par processus worker. La fixture `browser` (qui se
  connecte au serveur distant) dépend de `connectOptions`. Si elle échoue,
  les scénarios du worker échouent sans que le code de l'oracle puisse
  attraper l'erreur : d'où la connexion de contrôle placée dans
  `connectOptions`. —
  [Fixtures](https://playwright.dev/docs/test-fixtures), section « Worker-scoped fixtures »
- **`browserType.connect`** : la connexion d'un client Playwright à un serveur
  distant par WebSocket. Un refus de la passerelle remonte en `403
  Forbidden`, un port fermé en `ECONNREFUSED` (observé en session). —
  [browserType.connect](https://playwright.dev/docs/api/class-browsertype#browser-type-connect)
- **Mesure invalide et porte en erreur** : la catégorie `invalid` et l'étape
  d'une erreur de porte (`before-candidate`, `on-candidate`). — `GLOSSARY.md`,
  `docs/adr/0008-resultats-des-portes.md`.

## Ce qui a été construit

- **`shared/bench-browser.ts`** (nouveau) : l'erreur typée
  `BenchBrowserUnreachable`, avec en option le brut du banc qui prouve la
  panne.
- **`oracle/browser.ts`** :
  - `connectBenchBrowser` lève `BenchBrowserUnreachable`, sans le jeton ;
  - `checkBenchBrowser` fait une connexion de contrôle, aussitôt fermée. Son
    échec est ajouté, une ligne JSON, au fichier du banc ;
  - `readBenchBrowserFailures` relit ce fichier.
- **`gates/cdp-browser.ts`, `gates/lighthouse.ts`** : le lancement d'un
  Chromium par la passerelle CDP et la connexion de puppeteer (`connectCdp`)
  lèvent la même erreur.
- **`oracle/support.ts`, `oracle/env.ts`, `oracle/execute.ts`** :
  - la fixture `connectOptions` appelle `checkBenchBrowser` avant la
    connexion de Playwright ;
  - le fichier est `oracle-bench-browser.log`, à côté du dossier `oracle/`
    des bruts, passé par `MB_ORACLE_BENCH_BROWSER_LOG` ;
  - `executeOracle` le lit avant la collecte. S'il contient un échec, il lève
    `BenchBrowserUnreachable` sans collecter.
- **`gates/result.ts`, `gates/registry.ts`** : la cause d'erreur
  `bench-browser-unreachable`, posée par `instanceof`, et
  `benchBrowserEvidence`, la preuve, une ligne par résultat concerné.
- **`runner/verdict.ts`, `runner/measure.ts`** : la nouvelle cause
  d'invalidité, issue possible des phases `oracle` et `gates`. Une panne du
  legacy ou du service d'archivage (`stack-down-while-candidate`) passe
  devant.
- **`scripts/measure-cases.ts`, `scripts/run-measure-case.ts`,
  `.github/workflows/measures.yml`** : le cas `browser-stopped-during-oracle`.
  Le service `browser` est arrêté dès que Playwright tourne, dans le groupe
  `defective`.
- **Tests** :
  - `tests/bench-browser-unreachable-stack.test.ts`, sur la vraie pile : un
    mauvais jeton et un port sans service, sur les deux passerelles ; la
    connexion de puppeteer ; le fichier du banc, avec son témoin ;
  - verdict, registre et résultat des portes.
- **Documentation** : `GLOSSARY.md` (« Navigateur du banc », « Mesure
  invalide », « Porte en erreur »), `PROTOCOL.md` (limites connues), specs 03
  et 04, ADR 0008.
- **Issue de suivi #169** : le trou qui reste (voir « Pour aller plus loin »).

## Les choix faits et pourquoi

- **Erreur typée, pas un message.**
  - Retenu : la cause se décide par `instanceof BenchBrowserUnreachable`, et,
    dans l'oracle, par un fichier que seul le code du banc écrit.
  - Écarté : chercher un texte dans le rapport de Playwright. Le message d'une
    assertion peut reprendre le texte d'une page du candidat, qui fabriquerait
    alors l'invalidité (règle 7).
- **Connexion de contrôle dans `connectOptions`.**
  - Écarté : réécrire la fixture `browser`. Elle utilise des fixtures privées
    de Playwright (`_browserOptions`, lu dans `playwright/lib/index.js`), et
    sa propre connexion ne se laisse pas attraper.
  - Retenu : une connexion de plus par worker.
  - Limite écrite dans la spec 04 et `PROTOCOL.md` : un service qui tombe
    entre les deux connexions n'est pas vu.
- **Seule la connexion est visée.** Un navigateur qui se ferme pendant qu'il
  affiche une page du candidat reste au compte du candidat, puisque la page
  tourne dans ce navigateur.
- **Pas de délai propre sur la connexion.**
  - Écarté : un premier jet avec 60 s, retiré.
  - Raison : une connexion ralentie par les pages du candidat aurait suffi à
    rendre la mesure invalide. Le délai de la porte ou du scénario la coupe,
    au compte du candidat.
- **L'oracle n'est pas collecté** quand un worker n'a pas joint le navigateur
  (voir les difficultés). L'issue prévoyait `oracle.json` gardé : son critère
  a été corrigé pendant le ticket.
- **Ordre des causes.**
  - `stack-down-while-candidate` passe devant, comme devant `oracle-error`.
  - Dans les portes, `bench-browser-unreachable` passe devant
    `gate-error-before-candidate`, parce que sa cause est plus précise.
- **Pas de cause dans la clôture** : la porte du relais ne se connecte pas au
  navigateur.
- **Preuve en CI** par un nouveau cas du job des mesures, plutôt qu'à la main
  comme le legacy arrêté de #68. Sans navigateur, chaque scénario échoue dès
  sa connexion, au lieu d'attendre son délai.

## Difficultés rencontrées

- **Les tests de la vraie pile échouaient avant tout changement.**
  - Symptôme : `connects the holder of the token…` et deux autres tests
    rendaient `403 Forbidden`, y compris sans le diff (vérifié par
    `git stash`).
  - Cause : la pile locale tournait avec le jeton d'une mesure précédente, pas
    avec celui de `.dev-browser-token`.
  - Résolution : `npm run stack:up`, avant chaque série de tests.
- **La collecte plantait sur un HAR absent.**
  - Symptôme : la mesure rouge, sur l'ancien code (commit 03e4c21, arbre
    propre, `20261127T204222Z-03e4c21-reference-candidate`), finit en
    `stack-down-while-candidate`. Son détail : `ENOENT: no such file or
    directory, open '…/remise-remise-summary-chromium/scenario.har'`.
  - Cause : la collecte exige un HAR et une trace par scénario. Un scénario
    dont le worker n'a pas joint le navigateur n'en a pas.
  - Résolution : `executeOracle` lit le fichier du banc avant la collecte et
    ne collecte pas. L'oracle de la mesure n'a pas de résultat, et la clôture
    compte les 38 scénarios non atteints.
- **Message illisible de puppeteer.**
  - Symptôme : le test de la revue spec rendait `Could not connect to the CDP
    gateway: [object Object]`.
  - Cause : puppeteer rejette une connexion refusée par un `ErrorEvent` de
    `ws`, qui n'est pas une `Error`. `errorMessage` le passait à `String`.
  - Résolution : `errorMessage` lit le champ `message`. Le défaut existait
    avant #168.
- **`npm test` rendu invalide par la fiche.**
  - Symptôme : le premier `npm test` complet sur 09d7bec échoue sur deux
    tests de `tests/runner/interrupted-measure.test.ts`, avec `Outcome:
    invalid (stack-not-from-this-copy)`.
  - Cause : la fiche a été écrite dans `docs/` pendant l'exécution. `docs/`
    fait partie du contexte des images de la pile, dont l'empreinte a changé.
  - Résolution : committer la fiche, refaire `npm run stack:up`, puis relancer
    `npm test` sans toucher à l'arbre.
- **Revues.**
  - Normes : un commentaire mal placé, une constante inutilisée, un chemin
    construit trois fois, un test sans contrôle du message.
  - Spec : la spec 03 incomplète, le test de puppeteer manquant, la fenêtre
    entre les deux connexions non écrite.
  - Tout est corrigé dans le commit 09d7bec. Le cas de l'interruption a été
    vérifié sans changement : une phase déjà fermée en `interrupted` ignore
    toute fermeture suivante (`startPhases`, `runner/measure.ts`).

## Vérifier soi-même

```sh
npm run stack:up
npm test -- tests/bench-browser-unreachable-stack.test.ts tests/gates/lighthouse.test.ts
```

Observé en session, sur l'arbre devenu le commit 09d7bec : `Test Files  2
passed (2)`, `Tests  19 passed (19)`.

```sh
node scripts/run-measure-case.ts browser-stopped-during-oracle
```

Observé au commit 06a4946, arbre propre :

```
browser-stopped-during-oracle: results/diagnostic/20261127T204414Z-06a4946-reference-candidate is the expected measure (invalid, bench-browser-unreachable, exit code 3).
```

Dans son `measure.json`, phases `oracle: bench-browser-unreachable` et
`gates: not-run`, `oracle.executed: false`, 38 scénarios non atteints. La
preuve commence par `The bench browser was unreachable for 38 Playwright
worker(s):`, et le brut `oracle-bench-browser.log` ne contient pas le jeton
(`grep -c` à 0).

Sur l'ancien code (commit 03e4c21), la même commande sort en code 1 :

```
browser-stopped-during-oracle: verdict is stack-down-while-candidate (stack-down-while-candidate), expected invalid (bench-browser-unreachable)
```

`npm test` complet, au commit 06a4946, arbre propre : `Test Files  107 passed
(107)`, `Tests  1215 passed (1215)`.

Au commit 92d1da6 (fiche comprise), arbre propre : `Test Files  107 passed
(107)`, `Tests  1216 passed (1216)`.

> À vérifier après l'exécution de la CI de la PR : le cas `browser-stopped-during-oracle` dans le job des mesures (groupe `defective`), lien de l'exécution, head SHA, ligne du résumé.

## Pour aller plus loin

- **#169** : le JavaScript d'une page du candidat joint `run-server` sur
  `127.0.0.1:3001` dans le conteneur `browser`, sans jeton. Il pourrait y
  épuiser le navigateur et rendre injoignable la connexion suivante du banc.
  Les pistes sont une socket Unix ou un contrôle d'`Origin`.
- **Navigateur fermé pendant l'examen** : il reste au compte du candidat, et
  la collecte plante alors sur le HAR absent (erreur imprévue rangée en
  `stack-down-while-candidate`). Une issue propre pourrait le dire.
- `docs/adr/0008-resultats-des-portes.md` : les étapes d'une erreur de porte,
  et la nouvelle cause.
