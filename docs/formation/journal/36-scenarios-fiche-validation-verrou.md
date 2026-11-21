# #36 · Étape 2 · Scénarios @fiche : validation et verrou

## Objectif

Les règles de saisie de la fiche (`validation.xml`) et le verrou par statut
sont des pièges du legacy : rien hors de `validation.xml` et du service métier
ne les porte, et une migration peut les perdre sans bruit. Ce ticket ajoute à
l'oracle les six scénarios F7 à F12 du tableau « Fiche » de
`docs/specs/02-oracle.md`. F7 et F9 vérifient les champs obligatoires, F8 et
F10 les longueurs maximales, F11 et F12 le verrou d'un dossier `EN_INSTRUCTION`
puis `REMIS`. Quand le moyen est libre (`maxlength`, verrou), le scénario
enregistre la variante observée sans juger avec elle.

## Notions à connaître

- **Fichier `.properties` de Java 8** : une clé `=` une valeur par ligne, lu en
  ISO-8859-1. Les caractères non ASCII y sont écrits en `\uXXXX`, que le test
  des messages décode avant de comparer. —
  [Java 8 : java.util.Properties](https://docs.oracle.com/javase/8/docs/api/java/util/Properties.html)
- **Règle `required` de Commons Validator** : un champ fait d'espaces est
  refusé comme un champ vide. Observé sur le legacy : trois espaces dans
  « Demandeur » affichent « Le demandeur est obligatoire. ». —
  [Commons Validator : GenericValidator](https://commons.apache.org/proper/commons-validator/apidocs/org/apache/commons/validator/GenericValidator.html)
  (version documentée : la plus récente, pas celle de Struts 1.3.10)

  > À vérifier : le mécanisme (le blanc retiré par `isBlankOrNull`) n'a pas
  > été lu dans la session ; seul le comportement a été observé.
- **`readonly`, `disabled`, `aria-readonly`** : les trois moyens de verrou que
  la spec accepte. `readonly` laisse le champ focalisable et envoyé avec le
  formulaire ; `disabled` le retire du focus et de l'envoi ; `aria-readonly`
  ne fait que l'annoncer aux technologies d'assistance. —
  [MDN : readonly](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/readonly),
  [MDN : disabled](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/disabled),
  [MDN : aria-readonly](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-readonly)
- **État « éditable » de Playwright** (`toBeEditable`, `isEditable`) : vrai si
  le champ est activé et pas en lecture seule. Observé dans la session : sur un
  `<input>` natif, seul l'attribut `readonly` compte, et `aria-readonly="true"`
  seul le laisse éditable ; sur un `role="textbox"`, `aria-readonly` le rend
  non éditable. —
  [Playwright : LocatorAssertions](https://playwright.dev/docs/api/class-locatorassertions)
- **`pressSequentially` et `press`** : `pressSequentially` tape un texte touche
  par touche, comme un utilisateur, donc un `maxlength` HTML peut bloquer la
  saisie. `press` met le focus sur le champ puis envoie la touche ; si le champ
  ne prend pas le focus (`disabled`), la touche va à l'élément qui l'a. —
  [Playwright : Locator](https://playwright.dev/docs/api/class-locator)
- **Proxy HTTP avec `node:http`** : un serveur qui relaie chaque requête vers
  le legacy et réécrit le HTML des réponses. Il a servi de candidat factice,
  sans toucher au legacy. —
  [Node.js 22 : http](https://nodejs.org/docs/latest-v22.x/api/http.html)

## Ce qui a été construit

- **`oracle/scenarios/sheet.spec.ts`** : les six scénarios.
  - F7 `sheet-applicant-required` (`D-0105`) : Demandeur fait de trois espaces
    et nouvel Objet, message, les deux saisies gardées, relecture inchangée.
  - F9 `sheet-subject-required` (`D-0107`) : Objet vidé, message, saisie
    gardée, relecture inchangée.
  - F8 `sheet-applicant-maxlength` (`D-0106`) et F10 `sheet-subject-maxlength`
    (`D-0108`), par `checkMaxlength` : 81 ou 201 caractères tapés. Saisie
    bloquée → variante `input-blocked` et deux étapes sautées enregistrées ;
    sinon variante `message`, « Enregistrer », message et saisie gardée. Dans
    les deux cas, la relecture ne montre aucune valeur trop longue.
  - F11 `sheet-lock-en-instruction` (`D-0109`) et F12 `sheet-lock-remis`
    (`D-0110`), par `expectLocked` et `expectKeystrokeIgnored` : libellé,
    valeur, non éditable, une frappe ne change pas la valeur ; Objet éditable
    et « Enregistrer » présent (F11) ou absent (F12) ; relecture inchangée ;
    variante `lock`.
- **`oracle/messages.ts`** : `SHEET_MESSAGES`, les quatre messages de la fiche.
  **`tests/oracle/messages.test.ts`** les compare au texte exact de
  `ApplicationResources.properties`, `\uXXXX` décodés.
- **`oracle/lock.ts`** : `lockVariant` lit le moyen du verrou (`disabled`,
  `readonly`, `aria-readonly`) pour l'enregistrer. **`tests/oracle/lock.test.ts`**
  le vérifie dans un vrai Chromium, sur des contenus posés par `setContent`.
- **`oracle/variants.ts`** : `skippedStepAnnotation` rend l'annotation
  `mb:skipped-step` = `<étape> (<clé>=<valeur>)`, typée sur `Variants`.
  **`oracle/collect.ts`** : la constante `SKIPPED_STEP_ANNOTATION`.
- **`oracle/support.ts`** : `recordSkippedStep`, et la réexportation de
  `lockVariant`, `Lock` et `SHEET_MESSAGES`.
- **`docs/specs/02-oracle.md`** : la frappe ajoutée à F12, et la phrase sur
  l'état « éditable » de Playwright corrigée pour les champs natifs.
- **`results/oracle/20261121T230351Z-3844327.json`** et
  **`results/oracle/20261121T233940Z-a3cde35.json`** : deux exécutions
  complètes depuis un arbre propre, avant et après l'ajout de la frappe à F12.

## Les choix faits et pourquoi

- **Reprendre le `recordVariant` typé de `main` (#38), sans second outil.**
  Le commentaire de l'issue le demande
  ([#36, commentaire](https://github.com/karAmmi12/migrabench/issues/36#issuecomment-7070282518)).
  `lock` et `maxlength` étaient déjà dans `Variants`. `skippedStepAnnotation`
  ne réenregistre pas une variante : il pose `mb:skipped-step` et reprend le
  même type `Variants` pour la variante qui justifie l'étape sautée.
- **Messages écrits en constantes, gardés par un test Vitest**, plutôt que lus
  à l'exécution dans le `.properties`. Le scénario reste lisible, et un écart
  avec le legacy (un accent, par exemple) fait échouer `npm test` : constaté
  en remplaçant « caractères » par « caracteres » (`AssertionError: expected
  'Le demandeur doit faire 80 caracteres…' to be 'Le demandeur doit faire 80
  caractères…'`).
- **Le verrou est jugé par le comportement, le moyen n'est lu qu'après.**
  `recordLocks` lit la variante une fois les vérifications passées, et ne
  l'enregistre qu'une fois par valeur (F12 a deux champs).
- **F8 et F10 suivent la spec à la lettre** : en saisie bloquée, pas de clic
  sur « Enregistrer ». La relecture vérifie seulement qu'aucune valeur ne
  dépasse la limite (`/^[\s\S]{0,N}$/`), comme le dit la spec. La revue de
  code a noté que cette relecture est plus faible que celle de F7 et F9 ; elle
  est gardée telle quelle parce que la spec la fixe.
- **F12 fait la même frappe que F11.** Demandé par l'humain après la revue :
  un verrou qui ne tient pas au clavier doit échouer. La spec est mise à jour
  dans le même commit (`a3cde35`).
- **Le candidat factice reste dans la session**, hors du dépôt. Il sert de
  constat de discrimination, comme les mutations, pas de porte.
- **Une issue pour les tests de la référence d'archivage**, plutôt qu'un
  correctif ici : après `npm run oracle`, ils échouent jusqu'à
  `npm run stack:up`. Hors du périmètre du ticket :
  [#46](https://github.com/karAmmi12/migrabench/issues/46).

## Difficultés rencontrées

- **F10 tapait une espace en dernier caractère.**
  - Symptôme : relevé par la revue de code (axe Spec). `tooLong(201)` se
    terminait par une espace.
  - Cause : le texte était une phrase répétée puis coupée. Un candidat qui
    retire les espaces des bords aurait reçu 200 caractères : son verdict
    aurait dépendu des espaces, pas de la règle de longueur.
  - Résolution : le dernier caractère est un `é`. Vérifié : 81 et 201
    caractères, longueur inchangée après `trim()` (`81 81 " dé" 81`,
    `201 201 "deé" 201`).
- **Sur un champ `disabled`, la frappe de F11 partait dans « Objet ».**
  - Symptôme : la revue Standards demandait ce que fait `press` sur un champ
    `disabled`. Un sondage dans Chromium a donné `disabled d xo` : Demandeur
    inchangé, mais Objet devenu `xo`.
  - Cause : un champ `disabled` ne prend pas le focus, et la touche va au
    champ qui l'a. F11 aurait ensuite enregistré cet Objet sur `D-0109`.
  - Résolution : `blur` de l'élément actif avant la frappe.
- **Une affirmation fausse sur `aria-readonly`, retirée.**
  - Symptôme : j'avais annoncé qu'un `<input aria-readonly="true">`
    modifiable au clavier passerait l'ancienne F12. Le candidat factice qui
    remplace `readonly` par `aria-readonly` échoue pourtant sur F11 et F12,
    et sur l'ancienne F12 aussi, dès `not.toBeEditable()` (`Received:
    editable`).
  - Cause : l'hypothèse venait de la lecture de la variante, pas de l'état
    « éditable » ; or Playwright ignore `aria-readonly` sur un `<input>`
    natif.
  - Résolution : un second candidat factice, `readonly` gardé et un script
    qui recopie la touche tapée dans la valeur. Il passe l'ancienne F12
    (`1 passed`) et échoue sur la nouvelle, à la frappe. La spec dit
    maintenant ce que fait Playwright sur un champ natif.
- **Deux mutations n'ont pas échoué du premier coup.**
  - Relecture « aucune valeur trop longue » : la mutation `limit - 30` passait,
    car les valeurs d'origine sont courtes (`Inès Vallée`). Avec `{0,5}`, elle
    échoue (`Received string: "Inès Vallée"`).
  - Détection de la saisie bloquée : la forcer fait passer F8 et F10 par la
    branche sautée, ce qui est voulu, puisque la variante ne juge pas. Le
    constat a porté sur les annotations : `maxlength=input-blocked` et les
    deux `mb:skipped-step`.
- **Le premier commit ne compilait pas seul.**
  - Symptôme : `support.ts` réexportait `lock.ts` et `messages.ts`, ajoutés
    seulement au commit suivant.
  - Résolution : commits refaits dans l'ordre, avant tout envoi ; le
    typecheck passe à chacun.
- **`npm test` et `npm run oracle` refusés sous la mauvaise version de Node.**
  - Symptôme : `npm test requires Node 22.23.5 (.nvmrc), found v22.20.0.`
  - Résolution : `nvm use`.
- **La première exécution complète venait d'un arbre modifié.**
  - Symptôme : `worktree: dirty`.
  - Résolution : fichier supprimé, exécution relancée après le commit.
- **Trois tests de la référence d'archivage en échec après `npm run oracle`.**
  - Symptôme : `expected '42220D8B5676' to be '7A2A5A15F9AD'` dans
    `tests/seam-a/archive-reference.test.ts`.
  - Cause : la pile tourne avec le sel de l'exécution, et `npm test` relit le
    sel de développement de `.dev-archive-salt`.
  - Résolution : `npm run stack:up`, puis 167 tests réussis ; issue
    [#46](https://github.com/karAmmi12/migrabench/issues/46).

## Vérifier soi-même

Sorties observées au commit `a3cde35` (puis `34e703a`, qui ajoute seulement le
résultat), Node v22.23.5, Docker Compose 2.40.3-desktop.1, Playwright 1.65.1,
Chromium 159.0.8154.6.

```sh
nvm use
npm run typecheck
# > tsc --noEmit        (aucune erreur)

npm run oracle
# Result: results/oracle/20261121T233940Z-a3cde35.json
# Scenarios: 22, passed: 22, failed: 0, unreached: 0
```

Le résultat versionné porte `benchCommit` `a3cde35…`, `worktree: clean`,
`saltImposed: false`. Variantes enregistrées : `maxlength=message` pour F8 et
F10, `lock=readonly` pour F11 et F12.

```sh
npm run stack:up   # npm run oracle a recréé la pile avec un autre sel (#46)
npm test
#  Test Files  27 passed (27)
#       Tests  167 passed (167)
```

**Chaque vérification vue échouer une fois.** Une valeur attendue faussée à
la fois, puis `npx playwright test -c playwright.config.ts
scenarios/sheet.spec.ts -g <scénario>` depuis `oracle/`, sur la pile de
développement. États : arbre de travail sur `256cf4e`, avec le code des
scénarios du futur commit `bf7b601` non commité ; puis à nouveau sur
`bf7b601`, avec les corrections du futur `3844327` non commitées. Les
messages ci-dessous viennent du premier passage ; le second a rendu le même
verdict pour chaque ligne. Sans modification, les six scénarios passent.

| Vérification faussée | Échec observé |
|---|---|
| F7 message (attendu : celui de l'objet) | `toBeVisible()` : `element(s) not found` |
| F7 Demandeur gardé (`"  "`) | `Expected: "  "`, `Received: "   "` |
| F7 Objet gardé (`+ "!"`) | `Received: "Inscription à la cantine et au périscolaire du mercredi"` |
| F7 relecture Demandeur (`"   "`) | `Received: "Mathéo Garnier"` |
| F7 relecture Objet (nouvel Objet) | `Received: "Inscription au périscolaire"` |
| F9 message (attendu : celui du demandeur) | `toBeVisible()` : `element(s) not found` |
| F9 saisie gardée (ancien Objet) | `Received: ""` |
| F9 relecture Demandeur (sans accent) | `Received: "Pierre-Étienne Duval"` |
| F9 relecture Objet (`""`) | `Received: "Demande d'arrêté de circulation"` |
| F8 message (attendu : celui de l'objet) | `toBeVisible()` : `element(s) not found` |
| F10 message (attendu : celui du demandeur) | `toBeVisible()` : `element(s) not found` |
| F8 et F10 saisie gardée (coupée à la limite) | `toHaveValue` en échec sur les deux |
| F8 et F10 relecture (`{0,5}`) | `Received string: "Inès Vallée"` ; `"Réservation de la salle des fêtes"` |
| F11 libellé (« Demandeur principal ») | `toBeVisible()` : `element(s) not found` |
| F11 et F12 valeur affichée (`+ " "`) | `Expected: "Yannick Le Gall "` ; `Expected: "Margaux Delacroix "` |
| F11 et F12 non éditable (`toBeEditable`) | `Received: readOnly` |
| F11 frappe (`+ "x"`) | `Expected: "Yannick Le Gallx"`, `Received: "Yannick Le Gall"` |
| F11 Objet éditable (`not.toBeEditable`) | `Received: editable` |
| F11 « Enregistrer » présent (`toHaveCount(0)`) | `Expected: 0`, `Received: 1` |
| F11 relecture Demandeur (`+ "x"`) | `Received: "Yannick Le Gall"` |
| F12 Objet verrouillé (valeur du Demandeur) | `Received: "Autorisation de terrasse « Le Petit Zinc »"` |
| F12 aucun « Enregistrer » (`toHaveCount(1)`) | `Expected: 1`, `Received: 0` |
| F12 relecture Demandeur (valeur de l'Objet) | `Received: "Margaux Delacroix"` |
| F12 relecture Objet (valeur du Demandeur) | `Received: "Autorisation de terrasse « Le Petit Zinc »"` |
| F8 et F10 saisie bloquée forcée | réussis, avec `maxlength=input-blocked` et deux `mb:skipped-step` : la variante ne juge pas |

**Frappe de F12, sur des candidats factices.** Un proxy `node:http` devant le
legacy, lancé depuis le scratchpad de la session, puis `BASE_URL=<proxy> npx
playwright test … -g lock`. État : arbre de travail sur `3844327`, avec la
frappe de F12 du futur commit `a3cde35` non commitée. L'ancienne F12 a été
lancée depuis `git show HEAD:oracle/scenarios/sheet.spec.ts`.

| Candidat factice | Ancienne F12 | Nouvelles F11 et F12 |
|---|---|---|
| `readonly` remplacé par `aria-readonly="true"` | `1 failed` | `2 failed`, sur `not.toBeEditable()` : `Received: editable` |
| `readonly` gardé, un script recopie la touche dans la valeur | `1 passed` | `2 failed`, à la frappe : `Received: "Yannick Le Gallx"` ; `Received: "Margaux Delacroixx"` |

Le sondage des champs (`press` et `isEditable` dans Chromium, contenus posés
par `setContent`) a donné : `disabled d xo`, `readonly d o`,
`aria-readonly="true" xd o` ; `native input aria-readonly | isEditable: true` ;
`div role=textbox aria-readonly | isEditable: false`, puis `toHaveValue` en
échec.

## Pour aller plus loin

- **La variante `aria-readonly` ne peut passer ni F11 ni F12 en l'état.** Sur
  un `<input>` natif, Playwright le juge éditable ; sur un `role="textbox"`,
  `toHaveValue` échoue, car ce n'est pas un champ de formulaire. La spec
  accepte pourtant ce moyen : la lecture de la valeur affichée est à revoir
  pour les widgets ARIA.
- **#46** : un message explicite, ou une pile de développement remise en
  place, après `npm run oracle`.
- **#39** : le critère de fin de l'étape 2 (5 exécutions vertes et job de CI
  de l'oracle), bloqué par ce ticket.
- **ADR 0006** : le contrat de l'oracle envers le candidat, dont les
  sélecteurs par libellé que ces scénarios utilisent.
