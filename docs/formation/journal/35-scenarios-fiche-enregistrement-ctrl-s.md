# #35 · Étape 2 · Scénarios @fiche : lecture, enregistrement et Ctrl+S

## Objectif

L'oracle ne comptait que deux scénarios, ceux du fil traceur (#32). Ce ticket
ajoute huit scénarios de la fiche d'un dossier : F1, F2, F3, F4, F5, F6, F13
et F14 du tableau « Fiche » de `docs/specs/02-oracle.md`. Ils vérifient la
lecture de la fiche, l'enregistrement par le bouton et par `Ctrl+S`, le
focus initial, l'ordre de tabulation et le lien « Remise ». Ils posent aussi
les outils que réutiliseront les autres scénarios de la fiche (#36) et de la
remise (#37, #38) : la navigation vers la fiche, la relecture et la mesure
de `defaultPrevented`.

## Notions à connaître

- **`defaultPrevented` et phase de capture** : un événement traverse d'abord
  ses ancêtres de `window` vers la cible (capture), puis remonte (bouillonnement).
  Un écouteur posé en capture sur `window` passe avant le gestionnaire
  `document.onkeydown` du legacy. Il ne peut donc lire `defaultPrevented`
  qu'une fois la propagation finie. —
  [MDN : Event.defaultPrevented](https://developer.mozilla.org/en-US/docs/Web/API/Event/defaultPrevented),
  [MDN : addEventListener, option `capture`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#capture)
- **`setTimeout(…, 0)`** : la fonction s'exécute dans une tâche suivante, après
  la fin de la propagation de l'événement en cours. C'est ce qui diffère la
  lecture. —
  [MDN : setTimeout](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout)
- **`page.exposeFunction` et l'événement `framenavigated`** : la première rend
  une fonction Node appelable depuis la page, ce qui fait remonter la
  lecture à l'oracle. Le second signale qu'un cadre a changé de document.
  Guetté sur le cadre principal, il dit que la page a été quittée. —
  [Playwright : Page](https://playwright.dev/docs/api/class-page)
- **`page.keyboard.press("Control+s")`** : envoie un `keydown` pour `Control`,
  puis un pour `s`, puis les `keyup`. Le premier `keydown` est celui de la
  touche de modification. —
  [Playwright : Keyboard](https://playwright.dev/docs/api/class-keyboard)
- **`expect.configure({ timeout })`** : crée un `expect` dont les assertions
  attendent au plus le délai donné, au lieu des 5 s par défaut. —
  [Playwright : Assertions](https://playwright.dev/docs/test-assertions)
- **`toBeFocused`** : vérifie que l'élément a le focus. C'est l'assertion de
  F1 et F2. —
  [Playwright : LocatorAssertions](https://playwright.dev/docs/api/class-locatorassertions)
- **Rejet de promesse non géré dans Node 22** : un rejet sans gestionnaire à la
  fin de la tâche arrête le processus (mode `throw` par défaut). —
  [Node.js : `--unhandled-rejections`](https://nodejs.org/api/cli.html#--unhandled-rejectionsmode)

## Ce qui a été construit

- **`fixtures/legacy-app/src/main/resources/dossiers.json`** : le dossier
  réservé `D-0116` (« Sébastien Morin », « Déclaration d'un abri pour
  vélos »), `REMIS`, déposé le 12/05/2025, remis le 03/07/2025, propriétaire
  `scenario:sheet-ctrl-s-remis`. Aucun piège n'est touché. Le jeu de données
  est embarqué dans le WAR : l'image `legacy` doit être reconstruite
  (`docker compose build legacy`).
- **`tests/seam-b/dataset.test.ts`** : test du Seam B. `D-0116` est `REMIS`
  avec une date de remise, et seul `scenario:sheet-ctrl-s-remis` le réserve.
  Le test existant « assigns each reserved dossier to exactly one scenario or
  gate » garantit qu'aucun autre propriétaire ne le réserve. Le test « shares
  dossiers D-0001 to D-0030 » garde les dossiers partagés.
- **`oracle/scenarios/sheet.spec.ts`** : les huit scénarios. Seuls F4
  (`D-0102`), F5 (`D-0103`), F6 (`D-0104`) et F13 (`D-0116`) écrivent, chacun
  sur son dossier réservé. F1, F2, F3 et F14 ne cliquent jamais
  « Enregistrer ».
- **`oracle/support.ts`** :
  - `openSheet` : vers la fiche, par la recherche par numéro et le clic sur
    le lien du numéro ; atteint quand « Objet » est visible ;
  - `reread` : la relecture, qui pose `mb:reread-attempts` ;
  - `loadSearch` : le chargement de la recherche, partagé par les deux
    navigations.
- **`oracle/default-prevented.ts`** : `pressAndReadDefaultPrevented`, la
  mesure de `defaultPrevented`. Si la page est quittée avant la lecture, elle
  échoue avec « Page left before defaultPrevented of … was read ».
- **`oracle/collect.ts`** : la constante `REREAD_ANNOTATION`
  (`mb:reread-attempts`), à côté de `REACH_ANNOTATION`.
- **`tests/oracle/default-prevented.test.ts`** : le test de cet échec
  explicite, dans un vrai Chromium, sur une page servie par `page.route`,
  sans la pile Docker.
- **`.github/workflows/tests.yml`** : nouvelle étape
  `npx playwright install --with-deps chromium`, parce que ce test lance
  Chromium.
- **`oracle/browser-versions.ts`** : demandé par l'humain après l'ouverture
  de la PR. Il relève la version du Chromium lancé comme le lance l'oracle
  (`browser.version()`) et celle de `@playwright/test`. `executeOracle` les
  ajoute aux métadonnées (`chromium`, `playwright`). Le test
  `tests/oracle/browser-versions.test.ts` a d'abord été rouge (module
  absent). Il compare ces versions au manifeste `playwright-core/browsers.json`
  (`chromium-headless-shell`) et à `package-lock.json`. Observé dans une
  exécution sur l'arbre modifié, non versionnée : `chromium: 159.0.8154.6`,
  `playwright: 1.65.1`.
- **`docs/specs/02-oracle.md`** : la borne de `REREAD`, la limite de F13 et
  l'échec explicite de la lecture différée.
- **`results/oracle/20261121T192342Z-b3a5f91.json`** : le résultat de
  l'exécution complète au commit `b3a5f91`. Il remplace ceux de `eafa471` et
  `a26d92d`, rendus caducs par les changements de code qui ont suivi.

## Les choix faits et pourquoi

- **La relecture refait toute la navigation à chaque essai**, dans une
  nouvelle page du même contexte. Elle ne réessaie pas l'assertion sur une
  page déjà chargée. Une fiche rendue par le serveur ne change pas une fois
  affichée : réessayer sur la même page n'attendrait rien. La spec exclut
  aussi `page.reload()` (ADR 0006).
- **`REREAD` borne l'attente de l'assertion à chaque essai** : 5 essais de
  500 ms, soit 5 × 500 ms au plus en plus des navigations. L'intervalle n'est
  pas une pause entre deux essais. Interprétation confirmée par l'humain et
  écrite dans la spec.
- **Le rappel de `reread` reçoit son propre `expect`**
  (`expect.configure({ timeout: 500 })`), plutôt que l'`expect` global. Avec
  l'attente de 5 s par défaut, cinq essais dépassaient le délai du scénario
  (voir « Difficultés »).
- **Un échec de relecture enregistre `5`**, le nombre d'essais, et non
  `5 (failed)`. La spec demande un nombre, et c'est le statut du scénario qui
  porte l'échec. Remarque de la relecture « spec », appliquée dans `a26d92d`.
- **La lecture de `defaultPrevented` remonte par une fonction exposée**, et
  non par une variable lue ensuite dans la page. `Ctrl+S` envoie le
  formulaire (F6) : l'état de la page peut disparaître avec elle.
- **Le départ de la page est guetté côté Node** (`framenavigated` sur le cadre
  principal), et non par un `pagehide` dans la page. L'essai de la session l'a
  montré : quand le gestionnaire navigue vers `about:blank`, ni la lecture ni
  le `pagehide` n'arrivent à Node. Demandé par l'humain : un échec explicite
  plutôt qu'un délai dépassé générique, avec un test rouge d'abord.
- **Ce test vit dans Vitest avec un vrai Chromium.** Le code de la mesure a
  été sorti de `support.ts`, qui crée la fixture `test` de Playwright en
  même temps qu'il se charge. Le test n'a besoin d'aucune pile Docker. En
  contrepartie, le workflow des tests installe Chromium.
- **F13 : la mesure repose sur `defaultPrevented`.** La relecture « valeurs
  inchangées » ne peut pas échouer : l'API interne refuse (`409`) toute
  modification d'un dossier `REMIS`, et la couche serveur du candidat passe
  par elle (ADR 0003). Le refus est prouvé par
  `tests/seam-a/internal-api.test.ts` (« refuses with 409 a change of the
  applicant of a REMIS dossier »). La relecture reste, comme la spec la
  demande. Constat écrit dans la spec à la demande de l'humain.
- **F14 pose `mb:reach` après la dernière navigation**, comme le prévoit la
  spec pour la navigation alternée. Un échec sur `D-0002` ou `D-0003` compte
  donc comme « non atteint ».
- **F3 vérifie numéro, statut et date par `getByText` exact**. Ces trois
  valeurs sont du texte simple, sans rôle ni libellé de champ. La relecture
  « standards » a jugé ce choix acceptable.
- **Valeurs saisies par F4, F5 et F6** : des valeurs accentuées qui
  prolongent les valeurs d'origine, pour qu'une relecture qui retrouverait
  l'ancienne valeur échoue.

## Difficultés rencontrées

- **`defaultPrevented` lu faux sur F6 et F13.** Symptôme : `Received: false`
  sur les deux scénarios. Cause : l'écouteur, posé avec `once: true`, a
  attrapé le `keydown` de `Control`, qui précède celui de `s` et que le
  legacy n'empêche pas. Résolution : l'écouteur ignore les touches de
  modification et lit le premier `keydown` d'une autre touche.
- **Le filtre `-g` ne trouvait aucun test.** Symptôme : la première passe de
  mutations a rendu « No tests found » pour les 21 cas. Cause : le motif
  `^<titre> ` ne correspond pas au titre complet, qui commence par le chemin
  du fichier. Résolution : motif ` <titre> @`. Le script compte maintenant
  comme échec la seule ligne « 1 failed ».
- **Une relecture fausse échouait par délai dépassé.** Symptôme : les
  vérifications de relecture faussées échouaient sur « page.waitForTimeout:
  Target page, context or browser has been closed ». Cause : cinq essais,
  avec chacun l'attente de 5 s par défaut d'`expect`, dépassaient le délai
  du scénario. L'erreur de l'assertion était perdue. Résolution :
  l'`expect` à 500 ms passé au rappel ; l'erreur rendue est celle de
  l'assertion.
- **Comment quitter la page avant la lecture, à coup sûr ?** Pour écrire le
  test rouge, cinq gestionnaires ont été essayés, trois fois chacun, sur une
  page servie par `page.route` :
  - `location.href` vers une autre page : lecture reçue, puis navigation ;
  - `location.href` suivi de 300 ms de boucle active : page quittée, pas de
    lecture ;
  - `form.submit()` suivi de 300 ms de boucle active : lecture reçue ;
  - `location.href = "about:blank"` : page quittée, pas de lecture ;
  - `document.open()` : lecture reçue.

  Retenu : `about:blank`, sans boucle active. Aucun `pagehide` n'est arrivé
  à Node.
- **Test rouge de l'échec explicite.** Avant la correction, le test a échoué
  sur « Test timed out in 5000ms » : la mesure attendait ses 5 s. Après la
  correction, il passe, et F6 lit toujours `true` sur le legacy.
- **Rejet possible avant `await`.** Repéré à la relecture du code, pas
  observé : la navigation peut rejeter la promesse de lecture pendant que
  `keyboard.press` est encore en cours. Node 22 arrêterait alors le
  processus. Résolution : un `read.catch(() => {})` marque le rejet comme
  géré, et `await read` le relève quand même.
- **Constat du rouge de `D-0116`, invisible dans l'historique.** Le test du
  Seam B et la ligne de `D-0116` sont dans le même commit (`487c342`). Avant
  l'ajout du dossier, le test a échoué sur `expect(dossier?.status).toBe("REMIS")`
  avec `Received: undefined` (`Tests  1 failed | 7 passed (8)`). Après
  l'ajout, `8 passed`.
- **Chaque vérification vue échouer.** Les 21 vérifications des huit
  scénarios ont été faussées une à une par un script (attendu modifié,
  scénario relancé seul, fichier restauré), contre le legacy en marche :

  | Scénario | Vérification faussée | Échec observé |
  |---|---|---|
  | F1 | focus attendu sur « Demandeur » | `toBeFocused() failed` |
  | F2 | focus initial attendu sur « Demandeur » | `toBeFocused() failed` |
  | F2 | 1er `Tab` attendu sur « Enregistrer » | `toBeFocused() failed` |
  | F2 | 2e `Tab` attendu sur « Objet » | `toBeFocused() failed` |
  | F3 | numéro `D-0060` | `toBeVisible() failed` |
  | F3 | statut « Brouillon » | `toBeVisible() failed` |
  | F3 | date `2024-07-22` | `toBeVisible() failed` |
  | F3 | Demandeur avec `&quot;` | `toHaveValue(expected) failed` |
  | F3 | Objet sans accent | `toHaveValue(expected) failed` |
  | F4 | Demandeur d'origine à la relecture | `toHaveValue(expected) failed` |
  | F4 | Objet d'origine à la relecture | `toHaveValue(expected) failed` |
  | F5 | Objet d'origine à la relecture | `toHaveValue(expected) failed` |
  | F5 | Demandeur « Rémi Castagne » | `toHaveValue(expected) failed` |
  | F6 | `defaultPrevented` attendu faux | `toBe(expected)` |
  | F6 | Objet d'origine à la relecture | `toHaveValue(expected) failed` |
  | F13 | `defaultPrevented` attendu faux | `toBe(expected)` |
  | F13 | Demandeur « Sebastien Morin » | `toHaveValue(expected) failed` |
  | F13 | Objet « … velos » | `toHaveValue(expected) failed` |
  | F14 | lien « Remise » attendu sur `D-0002` | `toBeVisible() failed` |
  | F14 | lien attendu absent sur `D-0003` | `toHaveCount(expected) failed` |
  | F14 | lien attendu absent sur `D-0001` | `toHaveCount(expected) failed` |

  Pour F13, les deux relectures faussées échouent parce que l'attendu est
  faux, pas parce qu'un candidat aurait enregistré : sur le fond, la
  relecture de F13 ne peut pas échouer (voir les choix).

## Vérifier soi-même

Sorties observées au commit `b3a5f91` (code de l'oracle de `1b45934`),
Node v22.23.5, Docker Compose 2.40.3-desktop.1, Playwright 1.65.1.

```sh
docker compose build legacy   # D-0116 est embarqué dans le WAR
npx vitest run tests/seam-b tests/oracle/default-prevented.test.ts
#  Test Files  2 passed (2)
#       Tests  9 passed (9)

npm run oracle
#   10 passed (…)
# Result: results/oracle/20261121T192342Z-b3a5f91.json
# Scenarios: 10, passed: 10, failed: 0, unreached: 0
```

Le résultat versionné porte `benchCommit` `b3a5f91…`, `worktree: clean`,
`saltImposed: false`, `keyboard: { passed: 4, total: 4 }`, et
`mb:reread-attempts` = `1` sur F4, F5, F6 et F13.

```sh
npm run stack:up   # npm run oracle a recréé la pile avec un autre sel
npm test
#  Test Files  19 passed (19)
#       Tests  131 passed (131)
```

En CI, sur le commit `e085b2f` de la PR #43, « Tests du banc », exécution
[44940946102](https://github.com/karAmmi12/migrabench/actions/runs/44940946102),
`success` en 125 s (19:26:28Z → 19:28:33Z) :

```text
Chrome for Testing 159.0.8154.6 (playwright chromium v1255) downloaded to /home/runner/.cache/ms-playwright/chromium-1255
 ✓ tests/oracle/default-prevented.test.ts (1 test) 461ms
 Test Files  19 passed (19)
      Tests  131 passed (131)
```

## Pour aller plus loin

- #36 : les scénarios de validation et de verrou (F7 à F12) réutiliseront
  `openSheet` et `reread`, et ajouteront les variantes `lock` et `maxlength`.
- #39 : le critère de fin (5 exécutions vertes en CI) mesurera la stabilité
  de la relecture. Une valeur `mb:reread-attempts` au-dessus de `1` y
  signalerait un enregistrement lent.
- ADR 0006 : le contrat de navigation qui interdit `page.reload()` et impose
  de partir de `BASE_URL`.
- Limite de F13 : un candidat qui enregistre sur un `REMIS` n'est pas visible
  à la relecture, puisque l'API interne refuse l'écriture. Seul
  `defaultPrevented` le distingue.
