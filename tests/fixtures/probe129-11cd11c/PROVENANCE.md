# Provenance : sonde de #129 sur le commit `11cd11c`

`probe-output.json` est la copie, sans aucune modification, de la sortie
écrite par la sonde `.probes/129/probe.mjs` (dossier ignoré par Git), copiée
ici en `probe.mjs.txt`. Lancée le 2026-11-26 vers 22:07 UTC, sur un arbre
propre au commit `11cd11c` de la branche `feat/129-xss-gate` (`D-0118` ajouté
au jeu de données). La pile venait d'être reconstruite par `npm run stack:up`
depuis ce commit. Le navigateur était le service `browser` de la pile,
Chromium 159.0.8154.6. Vérifié avec `cmp` après la copie.

La sonde pose, dans un contexte de navigateur par identité :

- `exposeBinding("__mbXssReport", …)`, qui garde chaque appel avec les clés
  de `source`, l'URL de `source.frame` et la valeur reçue ;
- `addInitScript`, qui garde la fonction `window.__mbXssReport` dans une
  fermeture, puis définit `window.__mbXss` comme une propriété non
  configurable à accesseur, dont l'écriture appelle cette fonction.

| Clé | Identité | Navigation | Relevé |
|---|---|---|---|
| `search` | agent | `BASE_URL`, recherche par numéro `D-0101` | écritures, puis faits de l'écran |
| `erase` | agent | même page | `delete`, affectation de `undefined`, `defineProperty`, écrasement de `__mbXssReport` puis nouvelle écriture |
| `eraseWrites` | agent | même page | écritures reçues après ces tentatives |
| `sheet` | agent | clic sur le lien `D-0101` | écritures reçues sur la fiche, faits de l'écran |
| `submission` | instructeur | recherche de `D-0118`, fiche, lien « Remise » | écritures de toute la navigation, faits de l'écran |

Ce que la sonde montre, et qui fixe la conception de la porte :

- la fonction du binding existe déjà quand le script d'initialisation tourne
  (`bindingTypeAtInit: "function"`) ;
- `delete` rend `false`, `defineProperty` lève `Cannot redefine property`,
  et l'affectation de `undefined` est signalée : rien n'efface l'exécution ;
- écraser `window.__mbXssReport` depuis la page ne coupe pas le signalement
  (écriture `after-overwrite` reçue) ;
- sur le chemin de la remise, la seule écriture vient de la page de résultats
  de la recherche de `D-0118` (`frameUrl` en `rechercher.do`), alors que
  l'étape en cours était déjà « sheet D-0118 » : une écriture ne s'attribue
  pas à l'étape en cours, mais à l'écran affiché une fois l'écran précédent
  au repos ;
- le legacy affiche la charge en texte sur la remise (`payloadText: 1`), dans
  la valeur du champ « Demandeur » sur la fiche (`fieldsWithPayload`), et pas
  sur la recherche (`imgs` : la charge est rendue en HTML).
