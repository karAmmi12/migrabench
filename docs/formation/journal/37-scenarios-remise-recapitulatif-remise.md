# #37 · Étape 2 · Scénarios @remise : récapitulatif et remise

## Objectif

L'oracle comptait dix scénarios (recherche et fiche), aucun sur l'écran de
remise. Ce ticket ajoute M1 à M4 du tableau « Remise » de
`docs/specs/02-oracle.md`. Ils vérifient le récapitulatif en lecture seule,
l'écran d'un dossier déjà `REMIS`, le refus de la remise à un agent, et la
remise par un instructeur, sans confirmation, à la date de l'horloge figée.
À la demande de l'humain, le ticket fixe aussi une règle de présence pour
toute la spec, et fait refuser `npm run oracle` sous une autre version de
Node que `.nvmrc`. Les scénarios de l'accusé de remise (M5, M6) restent pour
#38.

## Notions à connaître

- **Boîtes de dialogue dans Playwright** : `alert`, `confirm` et `prompt`
  émettent l'événement `dialog` de la page. Sans écouteur, Playwright les
  refuse d'office ; avec un écouteur, c'est à lui de les accepter ou de les
  refuser (`dismiss`). Un `confirm` refusé rend `false` à la page. —
  [Playwright : Dialogs](https://playwright.dev/docs/dialogs),
  [MDN : Window.confirm()](https://developer.mozilla.org/en-US/docs/Web/API/Window/confirm)
- **Mode strict des localisateurs** : une action ou une assertion sur un
  localisateur qui trouve plusieurs éléments lève une « strict mode
  violation ». `filter({ visible: true })` ne garde que les éléments
  affichés, `first()` le premier. —
  [Playwright : Strictness](https://playwright.dev/docs/locators#strictness),
  [Playwright : Locator.filter](https://playwright.dev/docs/api/class-locator#locator-filter)
- **État « éditable » de Playwright** : `locator.isEditable()` est vrai pour
  un champ activé et ni `readonly` ni `aria-readonly`. Il lève une erreur sur
  un élément qui n'est ni `<input>`, ni `<textarea>`, ni `<select>`, ni
  `[contenteditable]`, et dont le rôle n'admet pas `aria-readonly`. —
  [Playwright : Locator.isEditable](https://playwright.dev/docs/api/class-locator#locator-is-editable)
- **Rôles qui admettent `aria-readonly`** : la liste est fixée par ARIA ;
  `radio` n'en fait pas partie (`radiogroup`, si). —
  [WAI-ARIA 1.2 : aria-readonly](https://www.w3.org/TR/wai-aria-1.2/#aria-readonly)
- **`contenteditable`** : rend modifiable n'importe quel élément. Il ne donne
  pas de rôle : `getByRole("textbox")` ne le trouve pas (observé dans la
  session, voir « Difficultés »). —
  [MDN : contenteditable](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/contenteditable)
- **`locator.or`** : l'union de deux localisateurs ; un élément trouvé par
  les deux n'apparaît qu'une fois. —
  [Playwright : Locator.or](https://playwright.dev/docs/api/class-locator#locator-or)
- **`try … finally`** : une erreur levée dans `finally` remplace celle du bloc
  `try`. M4 s'en sert pour rendre l'erreur de la boîte refusée plutôt que
  celle du texte qu'elle a empêché. —
  [MDN : try...catch](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch)
- **Scripts `pre` de npm et `npm_lifecycle_event`** : `npm run oracle` lance
  d'abord le script `preoracle` s'il existe, et s'arrête s'il échoue. La
  variable `npm_lifecycle_event` donne le nom du script en cours
  (`pretest`, `preoracle`). —
  [npm : scripts, Pre & Post Scripts](https://docs.npmjs.com/cli/v10/using-npm/scripts#pre--post-scripts),
  [npm : scripts, Current Lifecycle Event](https://docs.npmjs.com/cli/v10/using-npm/scripts#current-lifecycle-event)

## Ce qui a été construit

- **`oracle/scenarios/remise.spec.ts`** : les quatre scénarios.
  - M1 `remise-summary` (`D-0001`) : numéro, demandeur, objet, statut, date
    de dépôt ; aucun champ modifiable.
  - M2 `remise-remis` (`D-0004`) : « Dossier remis le 02/08/2024 », lien
    « Accusé de remise », pas de bouton « Remettre ».
  - M3 `remise-agent-reserved` (`D-0003`) : « Remise réservée aux
    instructeurs », pas de bouton « Remettre ».
  - M4 `remise-instructeur` (`D-0111`, rôle instructeur) : clic sur
    « Remettre », « Dossier remis le 15/11/2025 », plus de bouton
    « Remettre », lien « Accusé de remise ». Seul M4 écrit, sur `D-0111`,
    réservé à `scenario:remise-instructeur` dans le jeu de données.
- **`oracle/support.ts`** :
  - `openSubmission`, la navigation vers la remise (fiche, clic sur
    « Remise », atteint quand l'objet est affiché en texte) ;
  - `remiseLink`, le lien « Remise », désormais partagé avec F14 ;
  - `exactText`, toutes les occurrences d'un texte exact.
- **`oracle/occurrences.ts`** : `atLeastOne`, la vérification de présence :
  la première occurrence affichée. Appliquée à F3 (`sheet.spec.ts`) et à M1
  à M4.
- **`oracle/dialogs.ts`** : `refuseDialogs` refuse chaque boîte de dialogue de
  la page et la note ; `expectNone` échoue en la nommant
  (`Dialog refused: confirm "…"`).
- **`oracle/editable-fields.ts`** : `editableFieldCount`, le compte des champs
  modifiables de la page.
- **`tests/oracle/dialogs.test.ts`**, **`editable-fields.test.ts`** et
  **`occurrences.test.ts`** : leurs tests dans un vrai Chromium, sans la pile
  Docker, comme `default-prevented.test.ts`.
- **`package.json`** et **`scripts/check-node-version.mjs`** : le script
  `preoracle` lance la garde de `npm test`, dont le message nomme désormais
  la commande gardée. Tests dans `tests/check-node-version.test.ts`, dont un
  `npm run oracle` de bout en bout dans un dépôt temporaire.
- **`docs/specs/02-oracle.md`** : la règle « Présence et absence d'un texte »
  du contrat de navigation, et la section « Limites connues des scénarios »
  (confirmation affichée dans la page, non reconnue par M4).
- **`results/oracle/20261121T214623Z-73ac8cf.json`** : le résultat de
  l'exécution complète au commit `73ac8cf`. Il remplace ceux de `91a6438` et
  `dcc37b2`, rendus caducs par les changements de code qui ont suivi.

## Les choix faits et pourquoi

- **Toute boîte de dialogue fait échouer M4, pas seulement un `confirm`.** La
  relecture « spec » a noté qu'une `alert` de succès ferait aussi échouer un
  candidat par ailleurs fidèle. Décision de l'humain : M4 reste strict, toute
  boîte refusée est un changement d'usage.
- **Une confirmation affichée dans la page n'est pas reconnue** : M4 échoue,
  mais avec un message générique (texte attendu absent). Limite écrite dans
  la spec à la demande de l'humain.
- **Le refus des boîtes est vérifié dans un `finally`**, et non par un appel
  juste après le clic. Version d'abord écrite : un `expectNone()` après le
  clic, un autre à la fin. La relecture a montré qu'une confirmation ouverte
  après le clic (par exemple après un `fetch`) faisait échouer M4 sur le
  texte manquant, sans nommer la boîte. Avec `finally`, l'erreur rendue est
  « Dialog refused », quel que soit le moment.
- **Présence : au moins une occurrence exacte affichée ; absence : aucune.**
  Première version : `getByText(…, { exact: true })` seul, comme F3 en #35.
  La relecture « spec » a signalé qu'un candidat qui répète un texte (le
  numéro dans un fil d'Ariane) échouerait en mode strict. Décision de
  l'humain : la règle vaut pour toute la spec, appliquée à F3 et à M1 à M4.
  L'occurrence retenue est la première **affichée**, pas la première tout
  court : une copie masquée placée avant ne doit pas faire échouer.
  L'absence garde `toHaveCount(0)` sur le localisateur entier.
- **La règle couvre aussi le lien « Accusé de remise »** (M2, M4), retrouvé
  par son nom, qui est un texte. Le clic sur « Remettre » (M4) reste strict :
  c'est une action, pas une vérification de présence.
- **`refuseDialogs`, `editableFieldCount` et `atLeastOne` ont chacun leur
  module**, hors de `support.ts`, qui crée la fixture Playwright au
  chargement. C'est ce qui permet de les tester dans Vitest, comme
  `pressAndReadDefaultPrevented` (#35). Ces tests n'étaient pas convenus
  avant d'être écrits ; l'humain a décidé de les garder.
- **« Aucun champ modifiable » compte les champs de la page** : les rôles de
  champ, plus les éléments `contenteditable`, lus par l'attribut qui les rend
  modifiables (ils n'ont pas de rôle). Un rôle qui n'admet pas
  `aria-readonly` est jugé sur « activé ». La spec demande de s'appuyer sur
  l'état « éditable » de Playwright, qui couvre `readonly`, `disabled` et
  `aria-readonly`.
- **M1 garde la vérification de l'objet**, bien que la navigation l'attende
  déjà pour poser `mb:reach`. Relevé par la relecture « spec » : un objet faux
  rend M1 non atteint, pas échoué. La vérification reste parce que la spec la
  liste dans M1.
- **`openSubmission`, et non `openRemise`** : la relecture « standards » a
  noté que la fiche était traduite (`openSheet`) et la remise non. Renommé à
  la demande de l'humain ; les identifiants de scénarios (`remise-*`) restent
  ceux du tableau de la spec.
- **`npm run oracle` refuse une autre version de Node** par un script
  `preoracle`, la même garde que `npm test`, et non par une vérification dans
  `executeOracle`. Demandé par l'humain « comme npm test ». Le message nomme
  la commande à relancer, lue dans `npm_lifecycle_event`.

## Difficultés rencontrées

- **Matcher Playwright dans Vitest.** Symptôme : `Invalid Chai property:
  toContainText` au premier lancement de `dialogs.test.ts`. Cause :
  `toContainText` est un matcher de l'`expect` de Playwright, pas de celui de
  Vitest. Résolution : lire `innerText()` et le comparer avec `toContain`.
- **Le test de la confirmation ne voyait aucune boîte.** Symptôme :
  « expected [Function] to throw an error ». Cause : le `confirm("…")` du
  test était placé entre les guillemets doubles de l'attribut `onclick`, ce
  qui coupait l'attribut ; aucun `confirm` ne s'ouvrait. Un essai isolé, avec
  `setContent` et des apostrophes, a montré que l'événement `dialog` arrive
  bien avant la fin du clic. Résolution : apostrophes dans le test. Le test
  a ensuite été vu rouge contre un `expectNone` vidé, puis vert.
- **Premier mutant « confirmation » non atteint.** Symptôme : M4 échouait sur
  « Test timeout of 30000ms exceeded », dans l'étape de navigation. Cause :
  le mutant demandait confirmation sur tous les formulaires, recherche
  comprise ; refusée, la recherche n'était jamais envoyée. Résolution : le
  mutant ne vise que le formulaire qui porte « Remettre ». M4 échoue alors
  sur `Dialog refused: confirm "Remettre le dossier ?"`.
- **Première exécution complète sous Node 24.** Symptôme : `npm test` a
  refusé de démarrer (« npm test requires Node 22.23.5 (.nvmrc), found
  v24.12.0 ») juste après `npm run oracle`, dont le résultat portait
  `node: v24.12.0`. Cause : le shell n'avait pas chargé la version de
  `.nvmrc`, et rien ne gardait `npm run oracle`. Résolution : résultat
  supprimé avant tout commit, `nvm use`, exécution refaite ; puis la garde
  `preoracle`, demandée par l'humain. Test rouge d'abord : le message
  nommait `npm test`, et `npm run oracle` démarrait sans garde (« Cannot find
  module » dans le dépôt temporaire). Après : sous Node 24, `npm run oracle`
  rend « npm run oracle requires Node 22.23.5 (.nvmrc), found v24.12.0. »
- **`editableFieldCount` laissait passer des champs modifiables.** Relevé par
  la relecture « spec », confirmé par un essai dans Chromium : un
  `<select multiple>` (rôle `listbox`, éditable) n'était pas compté, un `<div
  contenteditable>` n'a aucun rôle, et un `role="radio"` faisait lever
  `isEditable`. Résolution : module dédié, test rouge d'abord (vu rouge
  contre l'ancienne implémentation : `locator.isEditable: Error: Element is
  not an <input>…`), puis la version qui ajoute `listbox`, `contenteditable`
  et le repli sur « activé ».
- **Test rouge de `atLeastOne`.** Contre une version qui rendait le
  localisateur tel quel, deux des quatre cas ont échoué sur « strict mode
  violation: getByText('D-0001', { exact: true }) resolved to 2 elements ».
- **Chaque vérification vue échouer.** Les vérifications ont été faussées une
  à une par un script (attendu modifié, scénario relancé seul, fichier
  restauré, legacy redémarré avant chaque cas M4 pour remettre `D-0111` à
  `EN_INSTRUCTION`), contre le legacy en marche. Dernière passe sur le code
  de `2f1204b`, avant son commit. Tous les cas ont échoué après `mb:reach`
  (scénario atteint) :

  | Scénario | Vérification faussée | Échec observé |
  |---|---|---|
  | M1 | numéro `D-0060` | `toBeVisible() failed` |
  | M1 | demandeur « Elodie Marchand » | `toBeVisible() failed` |
  | M1 | objet sans accent | `toBeVisible() failed` |
  | M1 | statut « Brouillon » | `toBeVisible() failed` |
  | M1 | date `2024-05-06` | `toBeVisible() failed` |
  | M1 | champs comptés sur la recherche (« Numéro » modifiable) | `toBe(expected)` |
  | M2 | « Dossier remis le 02/08/2025 » | `toBeVisible() failed` |
  | M2 | lien « Accusé de remise » attendu absent | `toHaveCount(expected) failed` |
  | M2 | « Remettre » attendu présent | `toBeVisible() failed` |
  | M3 | « Remise réservée aux agents » | `toBeVisible() failed` |
  | M3 | « Remettre » attendu présent | `toBeVisible() failed` |
  | M4 | bouton « Remettre définitivement » | `locator.click: Timeout 5000ms exceeded` |
  | M4 | confirmation sur le formulaire de remise | `Dialog refused: confirm "Remettre le dossier ?"` |
  | M4 | confirmation ouverte 300 ms après le clic | `Dialog refused: confirm "Remettre le dossier ?"` |
  | M4 | « Dossier remis le 15/11/2026 » | `toBeVisible() failed` |
  | M4 | « Remettre » attendu encore présent | `toBeVisible() failed` |
  | M4 | lien « Accusé de remise » attendu absent | `toHaveCount(expected) failed` |
  | F3 | numéro `D-0060` | `toBeVisible() failed` |
  | F3 | statut « Brouillon » | `toBeVisible() failed` |
  | F3 | date `2024-07-22` | `toBeVisible() failed` |

  Les deux mutants « confirmation » sont les candidats défectueux du critère
  « une remise qui demande confirmation échoue ».

  Deux cas devaient au contraire **réussir** : une page où le numéro (`D-0006`
  pour F3, `D-0001` pour M1) est ajouté deux fois en tête du document, une
  copie masquée puis une copie affichée. Avec `atLeastOne`, F3 et M1 passent.
  Avec `atLeastOne` neutralisé (localisateur rendu tel quel), les deux
  échouent sur `toBeVisible() failed`.

## Vérifier soi-même

Sorties observées au commit `73ac8cf` (code de l'oracle de `2f1204b`),
Node v22.23.5, Docker Compose 2.40.3-desktop.1, Playwright 1.65.1,
Chromium 159.0.8154.6.

```sh
npx vitest run tests/oracle/dialogs.test.ts tests/oracle/editable-fields.test.ts \
  tests/oracle/occurrences.test.ts tests/check-node-version.test.ts
#  Test Files  4 passed (4)
#       Tests  15 passed (15)

nvm exec 24 npm run oracle   # une autre version de Node que .nvmrc
# npm run oracle requires Node 22.23.5 (.nvmrc), found v24.12.0.
# Run `nvm use`, then `npm run oracle` again.

nvm use
npm run oracle
# Result: results/oracle/20261121T214623Z-73ac8cf.json
# Scenarios: 14, passed: 14, failed: 0, unreached: 0
```

Le refus sous Node 24 a été observé au commit `947dba1`. Le résultat
versionné porte `benchCommit` `73ac8cf…`, `worktree: clean` et
`saltImposed: false`.

```sh
npm run stack:up   # npm run oracle a recréé la pile avec un autre sel
npm test
#  Test Files  23 passed (23)
#       Tests  143 passed (143)
```

> À vérifier après l'exécution de la CI de la PR : lien, head SHA, durée et
> sortie (`Test Files`, `Tests`) du workflow « Tests du banc ».

## Pour aller plus loin

- #38 : les scénarios de l'accusé (M5, M6) réutiliseront `openSubmission`,
  `atLeastOne` et le lien « Accusé de remise », avec la variante
  `receipt-tab`.
- #39 : le critère de fin lancera M4 cinq fois ; chaque exécution complète
  recrée la pile, ce qui remet `D-0111` à `EN_INSTRUCTION`. Relancer M4 seul
  sur une pile déjà utilisée échoue, puisque le dossier est déjà remis. Le
  workflow de l'oracle devra installer Node depuis `.nvmrc`, sinon la garde
  `preoracle` le refusera.
- Limite de M4 : une confirmation affichée dans la page échoue sans être
  nommée (section « Limites connues des scénarios » de la spec).
- Les autres scénarios déjà écrits (R2, R17, F1, F2, F4, F5, F6, F13, F14)
  ne vérifient aucun texte par `getByText`. Les scénarios restants de la
  recherche et de la fiche (#36) devront suivre la règle de présence, par
  exemple pour les messages de refus de R11 à R16.
