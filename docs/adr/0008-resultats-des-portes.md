# Une porte rend des résultats nommés à cinq issues, et une erreur de porte n'invalide la mesure qu'avant l'examen du candidat

Toutes les portes rendent le même format : une liste de résultats nommés,
rangés dans `gates[]` de `measure.json`. Chaque résultat porte le nombre
d'éléments examinés et l'une de ces cinq issues :

- `passed` et `failed` : le résultat est **jugé** ;
- `measured` : le résultat est **relevé**. Il rapporte des valeurs sans les
  juger, faute de critère de réussite (score Lighthouse, poids du bundle,
  comparaison HAR) ;
- `not-evaluable` : rien n'a été examiné, ou ce qui a été examiné ne permet
  pas de conclure à une réussite (précision ajoutée le 26/11/2026 après #153,
  décision de Karim : la valeur témoin dont le corps d'une réponse manque au
  HAR, hors réponse vide, sans réponse ou d'un type sans intérêt connu,
  précisé le 27/11/2026 par #158 ; un échec constaté reste `failed`) ;
- `errored` : la porte a planté elle-même.

Chaque porte déclare, pour chacun de ses résultats nommés, s'il est jugé ou
relevé. Le type sépare les deux sortes. Une seule fonction pure,
`gateResultPassed`, dit si un résultat jugé est une réussite. Elle vaut vrai
pour `passed` seulement, et elle refuse un résultat relevé dès la
compilation. `not-evaluable` et `errored` ne comptent donc jamais comme une
réussite.

Une porte en erreur porte l'étape où elle a planté (`stage`) :

- **`before-candidate`** : avant de lire quoi que ce soit du candidat (outil
  absent, préparation des entrées du banc). Le candidat ne peut ni recevoir
  ni fabriquer cette erreur. Elle rend donc la mesure invalide (règle 7 de
  `PROTOCOL.md`).
- **`on-candidate`** : pendant l'examen. Le candidat peut l'avoir provoquée
  (bundle géant, page qui ne finit pas de charger, code qui épuise `tsc`).
  Elle compte comme un échec, mais reste distincte de `failed` et porte sa
  cause (`timeout`, `gates-phase-timeout`, `exception`, `tool-missing`).
  `gates-phase-timeout` est la cause d'une porte qui n'a rien examiné à
  cause de l'échéance globale de la phase `gates` : jamais lancée, ou coupée
  pendant sa préparation. Elle est `on-candidate`, puisque le candidat a pu
  ralentir les portes précédentes, et l'échéance de la phase ne rend jamais
  la mesure invalide. Sa cause la sépare de `timeout`, pour que le rapport
  sache qu'elle n'a rien examiné (précision ajoutée après #124).

Le verdict de la mesure ne dépend pas des portes, sauf pour une erreur
`before-candidate`. Un échec à une porte est un résultat du candidat,
agrégé par le score de l'étape 5, pas un incident de la mesure.

## Options écartées

- **Quatre issues, sans `measured`** : un score Lighthouse sans seuil aurait
  été `passed` dès que Lighthouse avait tourné, donc compté comme une
  réussite, ou `not-evaluable` alors que quelque chose avait été examiné.
  (Depuis #153, `not-evaluable` après examen existe, mais seulement quand
  l'examen ne permet pas de conclure, jamais faute de critère.)
- **Une catégorie de verdict « portes en échec »** : elle mélange un
  résultat du candidat avec l'issue de la mesure, et le rapport ne pourrait
  plus distinguer « mesure complète, trois portes échouées » de « mesure en
  échec ».
- **Toute erreur de porte rend la mesure invalide** : un candidat qui fait
  planter une porte échapperait à la mesure (règle 7).
- **Toute erreur de porte est un échec** : un outil absent du banc serait
  compté contre le candidat.

## Conséquences

- Chaque porte sépare explicitement sa préparation de son examen. Le runner
  pose `stage` selon l'endroit où l'erreur est levée, jamais d'après le
  message.
- Un test cherche dans les sources toute comparaison de `outcome` à
  `"passed"` hors du module de `gateResultPassed`, et échoue s'il en trouve.
- Tant que l'étalonnage sous charge (#100) n'est pas fait, aucune porte n'a
  de critère fondé sur un seuil de performance absolu. Une erreur
  `on-candidate` de cause `timeout` ou `gates-phase-timeout` est signalée
  telle quelle, pour être relue après l'étalonnage.
