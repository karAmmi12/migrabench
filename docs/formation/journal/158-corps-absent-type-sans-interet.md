# #158 · Étape 4 · Valeur témoin : un corps absent est à vérifier sauf type sans intérêt connu

## Objectif

Depuis #153, la porte de la valeur témoin ne conclut plus « absent » sur un
corps HTML, JS ou JSON qu'elle n'a pas lu. Il restait une limite : une
réponse sans `Content-Type` n'était jugée d'aucun de ces types, et un
candidat pouvait omettre l'en-tête pour y échapper. Karim a décidé
d'inverser la règle (27/11) : tout corps absent du HAR est non lu, sauf s'il
est d'un type sans intérêt connu.

## Notions à connaître

- **`bodySize` d'une réponse HAR** : la taille du corps reçu, `-1` quand elle
  est inconnue. Un corps jamais lu par la page n'a pas de taille mesurée
  (`bodySize`, `_transferSize` et `content.size` à `-1`, sonde de #130). —
  [HAR 1.2, spécification](http://www.softwareishard.com/blog/har-12-spec/)
  (republication de la spécification de Jan Odvarko, auteur du format)
- **Type de média** : `type/sous-type`, lu dans `Content-Type` avant le `;`,
  sans tenir compte de la casse. Les types de premier niveau `image`, `font`,
  `audio` et `video` sont enregistrés à l'IANA. —
  [RFC 9110, section 8.3.1](https://www.rfc-editor.org/rfc/rfc9110#section-8.3.1),
  [IANA, Media Types](https://www.iana.org/assignments/media-types/media-types.xhtml)

Liens ouverts le 2026-11-27 (`curl -L`) : chacun répond `200`.

## Ce qui a été construit

- **`gates/witness-value.ts`** :
  - `isUnread` : un corps absent du HAR est non lu, sauf réponse vide
    (`bodySize: 0`), entrée sans réponse (`status: -1`) ou type
    `image/*`, `font/*`, `audio/*`, `video/*` avec un sous-type non vide ;
  - `mediaType` : le type de média du premier `Content-Type`, `null` s'il
    est absent ou vide ;
  - le constat d'un corps non lu donne ce type (`type`), et non plus
    `html`, `js` ou `json`.
- **Tests** : sur le HAR réel de la sonde, une réponse sans `Content-Type`, un
  `Content-Type` vide ou mal formé, et les quatre types écartés.
- **Documentation** : spec 04 (définition du « corps non lu »), ADR 0008
  (mention datée du 27/11, à côté de celle du 26/11), `GLOSSARY.md` et
  `PROTOCOL.md`.

## Les choix faits et pourquoi

- **Pas de seuil de taille.** La règle demandée disait « taille mesurée
  supérieure à 0 ». Les HAR réels montrent qu'un corps non lu a toujours
  `bodySize: -1`, et l'entrée sans réponse aussi : la règle n'aurait rien
  pris. La question a été posée à Karim, qui a choisi d'écarter trois cas
  (réponse vide, aucune réponse, type sans intérêt connu) et de tout garder
  sinon.
- **Un type mal formé est inconnu, donc non lu** (`image`, `image/`,
  `/png`), relevé par la revue « spec » : sans cela, un candidat pouvait
  écrire `Content-Type: image` pour être écarté.
- **`Content-Type` vide traité comme absent** (`type: null`).
- **« Corps non lu »** plutôt que « à vérifier » dans la documentation,
  relevé par la revue « normes » : « À vérifier » est le marqueur des fiches
  qui bloque une fusion.

## Difficultés rencontrées

- **La règle telle qu'écrite ne prenait aucun corps.** Relevé avant le code,
  sur `probe-unread.har` et les HAR de l'exécution 45861318349 : tous les
  corps absents ont `bodySize: -1`, sauf les `302` vides du legacy
  (`bodySize: 0`). Résolution : question à Karim (AskUserQuestion), puis la
  règle à trois exclusions.
- **Numéro d'issue deviné.** La branche a été créée sous le nom
  `fix/155-…` avant de connaître le numéro, puis renommée
  `fix/158-absent-body-inverted`.
- **Revues** : la mention de l'ADR du 26/11 avait été réécrite au lieu d'être
  complétée. Elle est rétablie, et la précision du 27/11 s'y ajoute.

## Vérifier soi-même

```sh
npx vitest run tests/gates/witness-value.test.ts
```

Observé pendant la session, avant le correctif des types mal formés : 5 tests
rouges sur l'arbre au-dessus du commit `bbd7708`, dont « lists an unread body
without Content-Type ». Puis 1 test rouge, « lists an unread body whose
Content-Type is empty or malformed », sur l'arbre au-dessus du commit
`07d4d51`. Enfin `Tests 31 passed (31)`.

Candidat d'essai : mesure de diagnostic
`20261126T235845Z-07d4d51-trial-candidates-claude-code-20261126-candidate`,
sur un arbre propre au commit `07d4d51`, `completed (ok)`. La porte y rend
`passed`, avec 199 entrées et `responseBodiesAbsent: 0`. Sans corps absent,
le correctif des types mal formés (commit `ad72ae9`) ne change rien à cette
issue.

La règle du commit `07d4d51` appliquée aux HAR des exécutions 45861318349 et
45903361617 (script jetable de la session) : la référence et
`relay-alters-label` restent `failed`, `relay-untouched`,
`relay-forged-healthcheck` et `isolation-probe` restent `passed`, et
`responseBodiesUnread` vaut 0 partout.

Sur la vraie pile, job des mesures lancé sur la branche
([exécution 45914452588](https://github.com/karAmmi12/migrabench/actions/runs/45914452588),
commit `622d332`, succès), relevé dans l'artefact `measures` :

| Mesure | Issue | Entrées | Constats | `responseBodiesAbsent` | `responseBodiesUnread` |
|---|---|---|---|---|---|
| `20261127T000426Z-622d332-reference-candidate` | `failed` | 152 | 7 | 5 | 0 |
| `20261127T000716Z-622d332-defective-candidates-relay-alters-label` | `failed` | 164 | 7 | 3 | 0 |
| `20261127T000958Z-622d332-defective-candidates-relay-forged-healthcheck` | `passed` | 38 | 0 | 38 | 0 |
| `20261127T001042Z-622d332-conforming-candidates-relay-untouched` | `passed` | 38 | 0 | 38 | 0 |

## Pour aller plus loin

- Un candidat qui déclare `image/png` pour servir du texte échappe encore à
  la porte (`PROTOCOL.md`).
- #131, la porte de rôle.
