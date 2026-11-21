# #38 · Étape 2 · Scénarios @remise : accusé de remise

## Objectif

L'oracle vérifiait l'écran de remise (M1 à M4), mais pas encore l'accusé de
remise. Ce ticket ajoute M5 (agent, `D-0007`) et M6 (instructeur, `D-0010`)
du tableau « Remise » de `docs/specs/02-oracle.md`. Un clic sur « Accusé de
remise » doit mener à une page, dans le même onglet ou dans un nouvel onglet,
jamais à un téléchargement. La page doit porter le titre attendu et la
référence d'archivage calculée avec le sel de l'exécution, que seul l'oracle
connaît. L'onglet choisi est enregistré comme variante `receipt-tab`. Le
ticket crée aussi l'outil de variantes, puisque #36 n'est pas fusionné.

## Notions à connaître

- **Téléchargements dans Playwright** : une réponse servie en pièce jointe
  émet l'événement `download` de la page, au lieu d'afficher son contenu. —
  [Playwright : Downloads](https://playwright.dev/docs/downloads)
- **En-tête `Content-Disposition`** : `attachment; filename="…"` demande au
  navigateur d'enregistrer la réponse au lieu de l'afficher ; `inline` (ou
  pas d'en-tête) l'affiche. —
  [MDN : Content-Disposition](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition)
- **Nouveaux onglets** : un lien `target="_blank"` ouvre une nouvelle page
  du même contexte. Playwright l'annonce par l'événement `page` du contexte. —
  [Playwright : Pages, handling new pages](https://playwright.dev/docs/pages#handling-new-pages)
- **`framenavigated` et `waitForLoadState`** : `framenavigated` signale
  qu'un cadre a changé d'URL. Pour le cadre principal, cela veut dire que
  l'onglet a changé de page. `waitForLoadState("load")` attend que la page
  soit chargée. —
  [Playwright : Page, event framenavigated](https://playwright.dev/docs/api/class-page#page-event-frame-navigated),
  [Playwright : Page.waitForLoadState](https://playwright.dev/docs/api/class-page#page-wait-for-load-state)
- **`Promise.race`** : rend le résultat de la première promesse réglée. Les
  autres continuent de tourner : leur rejet ultérieur doit être absorbé
  (`.catch(() => {})`), sinon il devient un rejet non traité. —
  [MDN : Promise.race()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race)
- **HMAC-SHA256 avec `node:crypto`** : `createHmac("sha256", clé)` calcule
  un code d'authentification du message avec une clé secrète. Ici, la clé est
  le sel et le message est le numéro du dossier. Sans le sel, impossible de
  produire la bonne référence. —
  [Node.js 22 : crypto.createHmac](https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptocreatehmacalgorithm-key-options)
- **Types indexés et `keyof`** : `Variants[K]` est le type de la propriété
  `K` de `Variants`. Avec `K extends keyof Variants`, la valeur acceptée
  dépend de la clé passée. —
  [TypeScript : Indexed Access Types](https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html),
  [TypeScript : Keyof Type Operator](https://www.typescriptlang.org/docs/handbook/2/keyof-types.html)
- **`// @ts-expect-error`** : la ligne suivante doit produire une erreur de
  type, sinon c'est le compilateur qui signale la directive inutile. Cela
  permet d'écrire un test de ce que le type refuse. —
  [TypeScript 3.9 : `// @ts-expect-error` Comments](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html#-ts-expect-error-comments)
- **`route.fetch` et `route.fulfill`** : une requête interceptée peut être
  envoyée au serveur, puis rendue au navigateur avec des en-têtes modifiés.
  Cela a servi à simuler un accusé en pièce jointe sans toucher au legacy. —
  [Playwright : Route.fetch](https://playwright.dev/docs/api/class-route#route-fetch)

## Ce qui a été construit

- **`oracle/scenarios/remise.spec.ts`** : M5 `receipt-agent` (`D-0007`) et
  M6 `receipt-instructeur` (`D-0010`, rôle instructeur). Les deux passent par
  `openSubmission`, puis par `checkReceipt` :
  - ouverture de l'accusé ;
  - enregistrement de `receipt-tab` ;
  - présence de « Accusé de remise du dossier D-00xx » et de
    « Référence d'archivage : `<référence>` ».
- **`oracle/receipt.ts`** :
  - `openReceipt` clique sur le lien et attend la première de trois issues :
    navigation du même onglet, nouvel onglet ou téléchargement. Un
    téléchargement, même pendant le chargement de la page, échoue avec
    `Receipt downloaded as an attachment ("…"), not displayed in a page`.
  - `receiptLink` est le lien « Accusé de remise », partagé par les
    scénarios et le test.
- **`oracle/variants.ts`** : le type `Variants` reprend le tableau
  « Variantes observées » de la spec (`lock`, `maxlength`, `receipt-tab`).
  `variantAnnotation` rend l'annotation `mb:variant` = `<clé>=<valeur>`.
- **`oracle/support.ts`** :
  - `recordVariant(key, value)` est typé : une clé ou une valeur absente de
    la spec ne compile pas ;
  - `expectedArchiveReference(number)` lit `ARCHIVE_SALT` dans
    l'environnement du processus Playwright et calcule la référence avec
    `oracle/archive-reference.ts`.
- **`oracle/collect.ts`** : la constante `VARIANT_ANNOTATION` (`mb:variant`).
- **`tests/oracle/receipt.test.ts`** : `openReceipt` dans un vrai Chromium,
  sur des pages servies par `context.route`, sans pile Docker. Quatre cas :
  même onglet, nouvel onglet, et pièce jointe dans chacun des deux.
- **`tests/oracle/variants.test.ts`** : le format des sept variantes de la
  spec et trois appels refusés à la compilation (`@ts-expect-error`).
- **`docs/specs/02-oracle.md`** : deux limites connues de M5 et M6 ajoutées
  à « Limites connues des scénarios ».
- **`results/oracle/20261121T223507Z-3754203.json`** : l'exécution complète
  versionnée, depuis un arbre propre.

## Les choix faits et pourquoi

- **Vérifier la ligne entière « Référence d'archivage : `<référence>` »,
  pas la référence seule.** La spec fixe ce libellé (« Référence d'archivage
  et sel »), et l'oracle vérifie des textes exacts (ADR 0006).
- **Le titre est vérifié comme texte exact, pas comme rôle `heading`.** Le
  rôle serait un moyen ; seule la présence du texte affiché est exigée (règle
  de présence, `atLeastOne`).
- **Le sel vient de l'environnement du seul processus Playwright, lu par
  `support.ts`.** Une première version le lisait dans `remise.spec.ts`. À la
  relecture, l'humain l'a placé dans `support.ts`, avec le reste de la
  configuration de l'oracle. Sans sel, le scénario échoue avec un message qui
  renvoie à `npm run oracle`, au lieu de comparer à une référence fausse.
- **`recordVariant` est typé sur la spec plutôt que d'accepter n'importe
  quelle chaîne.** La première version prenait `(key: string, value:
  string)`. La revue de code y a vu une « Primitive Obsession », et l'humain
  a demandé le type. Une faute de frappe dans une variante ne compile plus.
- **L'outil de variantes est créé ici et fait référence pour #36.** L'issue
  le permettait (« sinon le créer »). Un commentaire sur #36 demande de
  reprendre la version typée au lieu d'en écrire une autre :
  [#36, commentaire](https://github.com/karAmmi12/migrabench/issues/36#issuecomment-7070282518).
- **Détecter l'issue du clic par une course entre trois événements**, plutôt
  qu'en attendant un délai fixe. Le premier événement décide, et l'échec
  nomme le téléchargement.
- **Tester `openReceipt` dans un vrai Chromium avec `context.route`**, sur
  le modèle de `tests/oracle/dialogs.test.ts` (#37). Les cas nouvel onglet et
  pièce jointe n'existent pas sur le legacy et ne peuvent pas y être produits.
- **Simuler la pièce jointe dans le scénario par `route.fetch`**, le temps
  du constat, au lieu de modifier le service d'archivage ou le legacy, que
  `CLAUDE.md` interdit de changer pour un test.
- **Les deux cas limites d'`openReceipt` vont dans la spec et ne sont pas
  corrigés.** Ce sont un téléchargement après `load`, et un nouvel onglet
  fermé avant le téléchargement. L'humain a tranché : dans les deux cas, le
  scénario échoue quand même, et seul le message est moins précis.

## Difficultés rencontrées

- **La garde de téléchargement du nouvel onglet ne servait à rien.**
  - Symptôme : une première version attendait aussi l'événement `download`
    sur le nouvel onglet. En retirant cette garde, les tests de pièce jointe
    passaient toujours.
  - Cause : un petit script de sondage a montré que Chromium émet le
    téléchargement sur la page du lien, même pour `target="_blank"`. Le
    nouvel onglet s'ouvre puis se ferme sans rien émettre. Sortie :
    `download on opener`, `context page`, `popup closed`.
  - Résolution : `openReceipt` écoute le téléchargement sur la page du lien
    seulement, y compris pendant le chargement de la page d'arrivée. Une
    nouvelle mutation, qui remplace le refus du téléchargement par un succès,
    fait échouer les deux cas de pièce jointe (`2 failed | 2 passed`).
- **Le script de sondage ne trouvait pas Playwright.**
  - Symptôme : `ERR_MODULE_NOT_FOUND`, `Cannot find package
    '@playwright/test'`.
  - Cause : le script était placé dans un dossier temporaire, hors du dépôt,
    donc hors de portée de `node_modules`.
  - Résolution : importer le module par son chemin absolu dans le dépôt.
- **`npm run oracle` refusé sous la mauvaise version de Node.**
  - Symptôme : `npm run oracle requires Node 22.23.5 (.nvmrc), found
    v22.20.0.`
  - Cause : c'est la garde `preoracle` (#37).
  - Résolution : `nvm use`.
- **La première exécution complète venait d'un arbre modifié.**
  - Symptôme : son résultat portait `worktree: dirty`, sur `caaf537`.
  - Cause : l'exécution avait été lancée avant le commit.
  - Résolution : le fichier a été supprimé, puis l'exécution relancée après
    le commit. Après la relecture, elle a été relancée une seconde fois sur
    l'état final, et le résultat versionné a été remplacé.

## Vérifier soi-même

Sorties observées au commit `3754203`, Node v22.23.5, Docker Compose
2.40.3-desktop.1, Playwright 1.65.1, Chromium 159.0.8154.6.

```sh
npx vitest run tests/oracle/receipt.test.ts tests/oracle/variants.test.ts
#  Test Files  2 passed (2)
#       Tests  12 passed (12)

npm run typecheck
# > tsc --noEmit        (aucune erreur)

nvm use
npm run oracle
# Result: results/oracle/20261121T223507Z-3754203.json
# Scenarios: 16, passed: 16, failed: 0, unreached: 0
```

Le résultat versionné porte `benchCommit` `3754203…`, `worktree: clean`,
`saltImposed: false`. `receipt-agent` et `receipt-instructeur` sont réussis,
chacun avec `mb:variant` = `receipt-tab=same-tab`.

```sh
npm run stack:up   # npm run oracle a recréé la pile avec un autre sel
npm test
#  Test Files  25 passed (25)
#       Tests  155 passed (155)
```

**Chaque vérification vue échouer une fois**, sur la pile recréée avec un
sel connu (`ARCHIVE_SALT=$SALT docker compose up --detach --force-recreate
--no-build --wait legacy archive`), avec `npx playwright test --config
oracle/playwright.config.ts -g receipt`. État : arbre de travail de la
session sur `caaf537`, avec le code des scénarios du futur commit `c23ec0e`,
pas encore commité. Le sel était alors lu dans `remise.spec.ts` ; ce
déplacement vers `support.ts` (`d2a33d3`) ne change pas les vérifications.
Avec le bon sel et sans modification, les deux scénarios passent.

| Vérification faussée | Échec observé |
|---|---|
| Autre sel (`ARCHIVE_SALT` différent de celui du service) | `getByText('Référence d\'archivage : BD61C821A2BA', { exact: true })` : `element(s) not found`, sur M5 et M6 |
| Pas de sel (`env -u ARCHIVE_SALT`) | `ARCHIVE_SALT is not set: the receipt scenarios run only through \`npm run oracle\`` |
| Titre attendu `D-0008` au lieu du numéro | `expect(locator).toBeVisible() failed`, `element(s) not found` |
| Accusé servi en pièce jointe (`route.fetch` + `content-disposition: attachment`) | `Receipt downloaded as an attachment ("accuse.html"), not displayed in a page`, sur M5 et M6 |

Les tests Vitest ont aussi été vus rouges : d'abord sans module
(`Cannot find module '../../oracle/receipt.ts'`, puis `variants.ts`). Ensuite,
une valeur ajoutée au type `receipt-tab` fait échouer le typecheck :
`TS2578: Unused '@ts-expect-error' directive`.

> À vérifier après l'exécution de la CI de la PR : le lien de l'exécution
> « Tests du banc », son head SHA, sa durée, et les lignes
> `tests/oracle/receipt.test.ts` et `tests/oracle/variants.test.ts` de la
> sortie, avec le total des tests.

## Pour aller plus loin

- #36 : les scénarios F8, F10, F11 et F12 enregistreront `maxlength` et
  `lock` avec le `recordVariant` typé de ce ticket.
- #39 : le critère de fin lancera M5 et M6 cinq fois. Chaque exécution
  complète tire un nouveau sel, ce qui prouve que la référence ne se devine
  pas d'une exécution à l'autre.
- Limites connues de M5 et M6 (spec, « Limites connues des scénarios ») : un
  téléchargement après `load`, et un nouvel onglet fermé avant le
  téléchargement, font échouer le scénario avec un message moins précis.
- Étape 4 : la porte de la valeur témoin cherchera le jeton du lien
  « Accusé de remise » dans le HAR de M5 et M6. Ce HAR contient les requêtes
  vers le service d'archivage (spec, story 55).
