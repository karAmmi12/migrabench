# #128 · Étape 4 · Porte d'accessibilité : axe-core et tableaux de mise en page

## Objectif

Le legacy met ses écrans en page avec des tableaux imbriqués : c'est un piège
à corriger (`TRAPS.md`, « Tableaux de mise en page »). Rien ne le mesurait
encore. Ce ticket ajoute la porte d'accessibilité, deuxième porte du
registre. Elle parcourt trois écrans du candidat comme l'oracle, y compte les
tableaux et y lance axe-core. Le legacy, présenté par le candidat de
référence, doit échouer aux tableaux sur chaque écran.

## Notions à connaître

- **axe-core et `@axe-core/playwright`** : axe-core est un moteur de règles
  d'accessibilité injecté dans la page. Son adaptateur Playwright,
  `AxeBuilder`, lance l'analyse sur une page et rend des `violations`,
  `passes`, `incomplete` et `inapplicable`. Chaque règle a une gravité
  (`impact`). `withTags` restreint l'analyse aux règles d'un ensemble, ici
  WCAG 2.1 A et AA. —
  [axe-core, API](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md),
  [@axe-core/playwright](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright)
- **Arbre d'accessibilité et tableaux de mise en page** : le navigateur
  construit, à côté du DOM, l'arbre lu par les technologies d'assistance.
  Chromium y range les tableaux qu'il juge de mise en page sous le rôle
  `LayoutTable`, et non `table`. La sonde l'a relevé par la commande CDP
  `Accessibility.getFullAXTree`. —
  [Chrome DevTools Protocol, Accessibility](https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/)
- **`role="presentation"` et `role="none"`** : ils retirent à un élément sa
  sémantique. C'est la correction acceptée par `TRAPS.md` pour un tableau de
  mise en page. —
  [WAI-ARIA 1.2, presentation](https://www.w3.org/TR/wai-aria-1.2/#presentation)
- **WCAG 2.1 A et AA** : le niveau de conformité de référence du RGAA 4, le
  référentiel français. —
  [WCAG 2.1](https://www.w3.org/TR/WCAG21/)

Liens ouverts le 2026-11-26 (`curl -L`) : chacun répond `200`. La page de
l'API d'axe-core cite `runOnly`, celle de `@axe-core/playwright` cite
`withTags`, celle du protocole CDP cite `getFullAXTree`, et WAI-ARIA 1.2 a
une section `presentation`.

## Ce qui a été construit

- **`gates/accessibility.ts`** : la porte.
  - Écrans : la recherche sans critère de l'oracle, puis la fiche et la
    remise de `D-0003`. La recherche et la fiche sont vues en agent, la remise
    en instructeur.
  - Pour chaque écran : un recensement des tableaux (`tableCensus`) et une
    analyse axe, dont la sortie complète est rangée comme brut et citée par
    empreinte.
  - Résultats jugés : `tables-count/<écran>`, `tables-nested/<écran>` et
    `axe/<gravité>`.
  - Un écran non atteint rend ses résultats non évaluables, avec l'étape
    manquée. Il rend aussi les quatre `axe/*` non évaluables, en gardant dans
    `values` ce qui a été vu sur les autres écrans.
- **`oracle/navigation.ts`** : la navigation de l'oracle (champs, boutons,
  recherche, fiche, remise), sortie du lanceur de tests. Les scénarios y
  passent par `support.ts`, avec les mêmes étapes du rapport.
- **`gates/raw.ts`, `rawDir` dans le contexte** : les bruts d'une porte, sous
  `gates/<porte>/`.
- **`gates/registry.ts`** :
  - la porte d'accessibilité vient avant le relais, dans le groupe
    « navigateur en lecture » ;
  - `tools()` et `gateTools()` rassemblent les outils épinglés par les
    portes, que le runner écrit dans `environment.gateTools` ;
  - `@axe-core/playwright` 4.14.0 est ajouté, et `axe-core` est épinglé en
    4.14.0 par `overrides`.
- **Tests** :
  - analyse d'axe et jugement des tableaux, sur les vraies sorties de la sonde
    (`tests/fixtures/probe128-ec414b9/`) ;
  - recensement dans le vrai navigateur du banc ;
  - outils épinglés ;
  - attentes du job des mesures : le legacy échoue aux tableaux et à axe
    `critical` et `serious`, et un candidat sans écran donne `not-evaluable`.
- **Spec 04** : la règle des outils épinglés, valable pour les portes
  suivantes, et les précisions de l'accessibilité.

## Les choix faits et pourquoi

- **Tags WCAG 2.1 A et AA** (Karim), plutôt que WCAG 2.2 ou les bonnes
  pratiques : c'est le niveau du RGAA 4, et chaque constat renvoie à une
  norme.
- **axe 4.14.0** (Karim) plutôt que 4.14.1, publié deux jours avant : plus
  d'un mois de recul.
- **Recensement dans le DOM.** La sonde montre que l'arbre d'accessibilité
  masque les tableaux de mise en page du legacy (`LayoutTable`). Compté dans
  l'arbre, le legacy passerait. `TRAPS.md` prévoit ce repli.
- **Un écran non atteint rend `axe/*` non évaluable** (Karim), plutôt qu'un
  jugement sur les écrans atteints : un candidat ne doit pas échapper à axe
  en cassant un écran. Les nombres vus restent dans `values`.
- **Version d'axe-core dans l'environnement de la mesure** (Karim). La règle
  vaut pour toutes les portes qui épinglent un outil, et elle est écrite
  dans la spec 04.
- **Choix de l'implémentation**, consignés dans la spec 04 :
  - `D-0003`, partagé et `EN_INSTRUCTION`, que l'oracle ne modifie pas ;
  - `examined` vaut 1 par écran atteint pour les tableaux ;
  - `values.incomplete` est le total des écrans ;
  - 10 s d'attente du premier résultat, au-delà desquelles la liste est
    tenue pour vide. Un candidat dont la recherche n'affiche rien n'a pas de
    tableau de données à juger. Une recherche lente qui affiche un tableau
    vide donnerait au pire un faux échec, jamais une fausse réussite.
- **Navigation extraite** plutôt que copiée : la spec demande de réutiliser
  les aides de l'oracle, mais elles passaient par le lanceur de tests
  (`test.step`).

## Difficultés rencontrées

- **Aucun tag WCAG dans le ticket.** La spec disait que les tags étaient
  « fixés dans le ticket », or #128 n'en fixait aucun. La question a été
  posée à Karim, et sa réponse est inscrite en commentaire de #128.
- **`axe-core` en 4.14.1 malgré l'épinglage.** `npm install --save-exact
  @axe-core/playwright@4.14.0` a installé `axe-core` 4.14.1, par la plage
  `~4.14.0` de sa dépendance. Résolution : un `overrides` fixe `axe-core` à
  4.14.0.
- **Aides de l'oracle inutilisables hors du lanceur.** `openSearch`,
  `openSheet` et `openSubmission` appellent `test.step`. Résolution :
  extraction dans `oracle/navigation.ts`, enveloppée par `support.ts`.
- **Étapes trop grossières**, relevées par la revue « spec ». La remise
  refaisait la recherche et la fiche, et un échec sur la fiche aurait été
  rapporté comme `remise D-0003`. Résolution : la fiche, puis
  `goToSubmissionFromSheet`, chacune avec son étape.

## Vérifier soi-même

```sh
node .probes/128/probe.mjs
```

La sonde n'est pas versionnée (`.probes/`). Elle a été relancée sur un arbre
propre au commit `ec414b9`, après `npm run stack:up`. Son code et sa sortie
sont résumés dans `tests/fixtures/probe128-ec414b9/PROVENANCE.md` :

| Écran | Arbre d'accessibilité | DOM : tableaux | DOM : imbriqués |
|---|---|---|---|
| 1 | `table` 1, `LayoutTable` 3 | 4 | 3 |
| 2 | `LayoutTable` 3 | 3 | 2 |
| 3 | `LayoutTable` 3 | 3 | 2 |

Rouge d'abord, observé pendant la session :

- `tests/gates/accessibility.test.ts` avant le module : `Tests  no tests`,
  l'import échoue ;
- `tests/gates/accessibility-census.test.ts` avant `tableCensus` : 4 échecs
  `tableCensus is not a function` ;
- le test des écrans non atteints pour axe, puis celui des outils : 3 échecs
  chacun avant leur implémentation.

```sh
npm run stack:up && npm test
```

Observé sur le commit `969dff7`, arbre propre :
`Test Files  95 passed (95)`, `Tests  1032 passed (1032)`.

Mesure de diagnostic locale du candidat de référence
(`20261126T163528Z-ec414b9-reference-candidate`). L'arbre était modifié
(porte non commitée) : c'est une simple vérification.

| Résultat | Recherche | Fiche | Remise |
|---|---|---|---|
| `tables-count` | `failed` (4 pour 1 attendu) | `failed` (3 pour 0) | `failed` (3 pour 0) |
| `tables-nested` | `failed` (3) | `failed` (2) | `failed` (2) |

- `axe/critical` (`image-alt`) et `axe/serious` (`html-has-lang`, sur les
  trois écrans) sont `failed` ; `moderate` et `minor` sont `passed`.
- `examined` vaut 382 pour les quatre résultats d'axe.
- La phase `gates` a duré 1 781 ms.

> À vérifier après l'exécution de la CI de la PR : le job des mesures sur le
> head SHA de la PR. Il faut relever l'issue de la porte pour `reference`,
> `relay-untouched` et `relay-forged-healthcheck`, `environment.gateTools`,
> et la durée de la phase `gates` du candidat de référence (durée ajoutée à la
> mesure, à signaler à Karim au-delà de 5 minutes). Il faut aussi copier une
> vraie mesure avec la porte en fixture.

> À vérifier après l'exécution de la CI de la PR : les jobs `tests`,
> `typecheck`, `oracle` et `proof` sur le head SHA de la PR. L'oracle utilise
> la navigation extraite.

## Pour aller plus loin

- **#129, XSS** : la deuxième porte à navigateur, qui réutilise
  `oracle/navigation.ts` et `rawDir`.
- **#134, #136, #137, #138** : chaque porte qui épingle un outil le déclare
  par `tools()` (spec 04).
- **#100, étalonnage** : le délai de la porte (5 min), l'attente du premier
  résultat (10 s), et la charge d'axe sur des pages plus lourdes que le
  legacy.
- **Étape 5** : la pondération des quatre gravités d'axe et des résultats
  `not-evaluable`.
