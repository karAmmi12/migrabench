# L'oracle impose au candidat des textes et des comportements, pas des routes ni des moyens

L'oracle doit tourner tel quel contre le legacy et contre chaque candidat. Il
n'impose donc au candidat que ce qu'un utilisateur observe :

- **une seule URL**, `BASE_URL`, qui affiche la recherche. La fiche et la
  remise ne s'atteignent qu'en cliquant, sans convention de routes ;
- **les textes visibles du legacy**, quelle que soit la stratégie (AS-IS ou
  Design System) : libellés des champs, noms des boutons et des liens,
  messages, au texte exact, espaces normalisés. Seuls les libellés de champs
  tolèrent des deux-points et un `*` finaux ;
- **des comportements, pas des moyens** : un champ verrouillé est non
  modifiable (`readonly`, `disabled` ou `aria-readonly`), l'ordre de
  tabulation est vérifié par la séquence obtenue, une valeur trop longue
  peut être bloquée à la saisie ou refusée avec un message. Le moyen choisi
  est enregistré comme variante observée.

## Options écartées

- Imposer des routes au candidat, ou lui faire déclarer les siennes dans
  `candidate.json` : on mesurerait sa déclaration plutôt que sa migration,
  et l'ADR 0003 refuse déjà toute convention de routes.
- Un oracle tolérant aux reformulations : le jugement « message équivalent »
  n'est pas un résultat objectif.
- Un jeu d'assertions par stratégie : deux oracles à maintenir, et la
  règle 6 ne vaudrait que pour AS-IS.
- Exiger les attributs du legacy (`readonly`, `tabindex`) : on sanctionnerait
  un moyen défendable au lieu d'un comportement.

## Conséquences

- Une reformulation fidèle au sens fait échouer le scénario (limites de
  `PROTOCOL.md`).
- Chaque scénario commence par une navigation depuis `BASE_URL`. Un échec de
  navigation rend le scénario non atteint, distinct d'un comportement
  échoué.
- Le remplacement d'un champ verrouillé par du texte simple échoue : le
  champ perd son libellé. Un verrou en `disabled` passe le scénario du verrou
  mais échoue à celui de l'ordre de tabulation (`TRAPS.md`).
- Ce que l'oracle ne peut pas voir faute de connaître les routes (refus
  côté serveur sans identifiants, contrôle de rôle) est mesuré par des
  portes qui rejouent des requêtes enregistrées.
