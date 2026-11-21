# #37 · Étape 2 · Scénarios @remise : récapitulatif et remise

## Objectif

L'oracle comptait dix scénarios (recherche et fiche), aucun sur l'écran de
remise. Ce ticket ajoute M1 à M4 du tableau « Remise » de
`docs/specs/02-oracle.md`. Ils vérifient le récapitulatif en lecture seule,
l'écran d'un dossier déjà `REMIS`, le refus de la remise à un agent, et la
remise par un instructeur, sans confirmation, à la date de l'horloge figée.
Les scénarios de l'accusé de remise (M5, M6) restent pour #38.

## Notions à connaître

- **Boîtes de dialogue dans Playwright** : `alert`, `confirm` et `prompt`
  émettent l'événement `dialog` de la page. Sans écouteur, Playwright les
  refuse d'office ; avec un écouteur, c'est à lui de les accepter ou de les
  refuser (`dismiss`). Un `confirm` refusé rend `false` à la page. —
  [Playwright : Dialogs](https://playwright.dev/docs/dialogs),
  [MDN : Window.confirm()](https://developer.mozilla.org/en-US/docs/Web/API/Window/confirm)
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
- **`oracle/support.ts`** : `openRemise`, la navigation vers la remise (fiche,
  clic sur « Remise », atteint quand l'objet est affiché en texte), et
  `remiseLink`, le lien « Remise », désormais partagé avec F14.
- **`oracle/dialogs.ts`** : `refuseDialogs` refuse chaque boîte de dialogue de
  la page et la note ; `expectNone` échoue en la nommant
  (`Dialog refused: confirm "…"`).
- **`oracle/editable-fields.ts`** : `editableFieldCount`, le compte des champs
  modifiables de la page.
- **`tests/oracle/dialogs.test.ts`** et **`tests/oracle/editable-fields.test.ts`** :
  leurs tests dans un vrai Chromium, sans la pile Docker, comme
  `default-prevented.test.ts`.
- **`results/oracle/20261121T212248Z-dcc37b2.json`** : le résultat de
  l'exécution complète au commit `dcc37b2`. Il remplace celui de `91a6438`,
  rendu caduc par les corrections de la relecture.

## Les choix faits et pourquoi

- **Toute boîte de dialogue fait échouer M4, pas seulement un `confirm`.** La
  spec dit « toute boîte de dialogue est refusée, donc « sans confirmation »
  est exigé ». La relecture « spec » a noté qu'une `alert` de succès ferait
  aussi échouer un candidat par ailleurs fidèle. Retenu : la lecture stricte
  de la spec, qui ne distingue pas les boîtes. Si l'humain veut l'assouplir,
  c'est la spec qui doit le dire.
- **Le refus des boîtes est vérifié dans un `finally`**, et non par un appel
  juste après le clic. Version d'abord écrite : un `expectNone()` après le
  clic, un autre à la fin. La relecture a montré qu'une confirmation ouverte
  après le clic (par exemple après un `fetch`) faisait échouer M4 sur le
  texte manquant, sans nommer la boîte. Avec `finally`, l'erreur rendue est
  « Dialog refused », quel que soit le moment.
- **`refuseDialogs` et `editableFieldCount` ont chacun leur module**, hors de
  `support.ts`, qui crée la fixture Playwright au chargement. C'est ce qui
  permet de les tester dans Vitest, comme `pressAndReadDefaultPrevented` (#35).
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
- **Identifiants `remise-*` et `openRemise`** : la relecture « standards » a
  noté que la fiche était traduite (`openSheet`, `sheet-*`) et la remise non.
  Les identifiants des scénarios sont fixés par le tableau de la spec ;
  `openRemise` suit « Vers la remise » du contrat de navigation. Gardés.
- **Textes exacts par `getByText(…, { exact: true })`**, comme F3. La
  relecture « spec » signale un risque, non observé sur le legacy : un
  candidat qui affiche deux fois le même texte (le numéro dans un fil
  d'Ariane, par exemple) ferait échouer l'assertion en mode strict. Laissé en
  l'état, à trancher pour toute la spec plutôt que pour ce ticket.

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
  `.nvmrc`. Résolution : résultat supprimé avant tout commit, `nvm use`,
  exécution refaite.
- **`editableFieldCount` laissait passer des champs modifiables.** Relevé par
  la relecture « spec », confirmé par un essai dans Chromium : un
  `<select multiple>` (rôle `listbox`, éditable) n'était pas compté, un `<div
  contenteditable>` n'a aucun rôle, et un `role="radio"` faisait lever
  `isEditable`. Résolution : module dédié, test rouge d'abord (vu rouge
  contre l'ancienne implémentation : `locator.isEditable: Error: Element is
  not an <input>…`), puis la version qui ajoute `listbox`, `contenteditable`
  et le repli sur « activé ».
- **Chaque vérification vue échouer.** Les vérifications des quatre scénarios
  ont été faussées une à une par un script (attendu modifié, scénario relancé
  seul, fichier restauré, legacy redémarré avant chaque cas M4 pour remettre
  `D-0111` à `EN_INSTRUCTION`), contre le legacy en marche. Les 17 cas ont
  échoué après `mb:reach` (scénario atteint). Première passe au commit
  `751cb64` avec les fichiers du ticket non commités, puis les cas touchés
  par la relecture repassés sur le code de `7f3b531` avant son commit :

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

  Les deux mutants « confirmation » sont les candidats défectueux du critère
  « une remise qui demande confirmation échoue ».

## Vérifier soi-même

Sorties observées au commit `dcc37b2` (code de l'oracle de `7f3b531`),
Node v22.23.5, Docker Compose 2.40.3-desktop.1, Playwright 1.65.1,
Chromium 159.0.8154.6.

```sh
npx vitest run tests/oracle/dialogs.test.ts tests/oracle/editable-fields.test.ts
#  Test Files  2 passed (2)
#       Tests  4 passed (4)

npm run oracle
# Result: results/oracle/20261121T212248Z-dcc37b2.json
# Scenarios: 14, passed: 14, failed: 0, unreached: 0
```

Le résultat versionné porte `benchCommit` `dcc37b2…`, `worktree: clean` et
`saltImposed: false`.

```sh
npm run stack:up   # npm run oracle a recréé la pile avec un autre sel
npm test
#  Test Files  22 passed (22)
#       Tests  136 passed (136)
```

> À vérifier après l'exécution de la CI de la PR : lien, head SHA, durée et
> sortie (`Test Files`, `Tests`) du workflow « Tests du banc ».

## Pour aller plus loin

- #38 : les scénarios de l'accusé (M5, M6) réutiliseront `openRemise` et le
  lien « Accusé de remise », avec la variante `receipt-tab`.
- #39 : le critère de fin lancera M4 cinq fois ; chaque exécution complète
  recrée la pile, ce qui remet `D-0111` à `EN_INSTRUCTION`. Relancer M4 seul
  sur une pile déjà utilisée échoue, puisque le dossier est déjà remis.
- ADR 0006 : le contrat de navigation, qui fixe « atteint quand l'objet est
  affiché en texte » pour la remise.
- Limite connue : l'unicité des textes exacts (voir les choix) n'est imposée
  par aucune ligne de l'ADR 0006.
