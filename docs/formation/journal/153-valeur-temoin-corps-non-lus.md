# #153 · Étape 4 · Valeur témoin : non évaluable si un corps HTML, JS ou JSON manque au HAR

## Objectif

La porte de la valeur témoin (#130) cherche le secret dans les HAR de
l'oracle. La sonde de #130 a montré qu'un HAR ne garde pas toujours le corps
d'une réponse : un corps jamais lu par la page en est absent. La porte
pouvait donc rendre `passed` sur une réponse qu'elle n'avait pas lue. Karim a
décidé (26/11) qu'une réponse HTML, JS ou JSON sans corps dans le HAR rend la
porte non évaluable, sauf si une fuite est trouvée ailleurs.

## Notions à connaître

- **`bodySize` d'une réponse HAR** : la taille du corps reçu, en octets, `-1`
  quand elle est inconnue. Dans les HAR de Playwright, un corps jamais lu a
  `bodySize: -1`, et une réponse vide a `bodySize: 0` (sonde de #130). —
  [HAR 1.2, spécification](http://www.softwareishard.com/blog/har-12-spec/)
  (republication de la spécification de Jan Odvarko, auteur du format)
- **`Content-Type` et type de média** : l'en-tête qui dit ce que contient la
  réponse. Seul le type de média, avant le `;`, compte, sans tenir compte de
  la casse. —
  [RFC 9110, section 8.3](https://www.rfc-editor.org/rfc/rfc9110#section-8.3)
- **Non évaluable** (`GLOSSARY.md`, ADR 0008) : depuis ce ticket, aussi une
  porte qui a examiné des éléments sans pouvoir conclure à une réussite.

Liens ouverts le 2026-11-26 (`curl -L`) : chacun répond `200`.

## Ce qui a été construit

- **`gates/result.ts`** : `judged` accepte `evaluable: false`. La porte a
  examiné des éléments mais ne peut pas conclure : le résultat est
  `not-evaluable`, sauf échec constaté, qui reste `failed`.
- **`gates/witness-value.ts`** :
  - `unreadBodyType` classe une entrée sans corps : `html`, `js` ou `json`
    d'après `Content-Type`, sinon rien. Une réponse vide (`bodySize: 0`) et
    une entrée sans réponse (pas de `Content-Type`) ne comptent pas ;
  - `searchHars` rend aussi `unread`, la liste de ces entrées (scénario, URL,
    type) ;
  - la porte les ajoute après les fuites dans `findings`, compte
    `values.responseBodiesUnread`, et rend `not-evaluable` s'il y en a une
    sans fuite.
- **Fixtures** (`tests/fixtures/ci45861318349/`) : deux HAR de plus, copiés
  de l'exécution 45861318349. L'un contient un `302` vide du legacy, l'autre
  une entrée sans réponse de `relay-untouched`.
- **Documentation** : la règle dans la spec 04, une précision datée dans
  l'ADR 0008, `GLOSSARY.md` (« Non évaluable ») et la limite de
  `PROTOCOL.md`.

## Les choix faits et pourquoi

- **« Vide » se lit dans `bodySize`**, mesuré par le navigateur, plutôt que
  dans `Content-Length`, déclaré par le candidat. Les deux disent 0 sur les
  `302` du legacy. Un corps non lu a `bodySize: -1` dans le HAR de la sonde,
  il n'est donc pas confondu avec une réponse vide.
- **`evaluable` dans `judged`** plutôt qu'un résultat construit à la main
  dans la porte : `judged` reste la seule fabrique d'un résultat jugé, et la
  porte de rôle (#131) pourra s'en servir pour `role-replay`, que la spec 04
  rend non évaluable quand le rejeu de contrôle échoue.
- **Les fuites d'abord dans `findings`**, puis les corps non lus : la fuite
  décide de l'issue. Si `findings` est tronqué, `responseBodiesUnread` garde
  le nombre.
- **Pas de fixture « JSON non lu » tirée d'une mesure** : aucune mesure réelle
  n'en contient. `relay-untouched` n'a que des entrées sans réponse. Le cas
  est prouvé sur le HAR réel de la sonde (`probe-unread.har`), avec une
  valeur de test pour qu'aucune fuite ne masque la règle.

## Difficultés rencontrées

- **Les 302 du legacy auraient tout rendu non évaluable.** Avant le code, la
  répartition des corps absents du candidat de référence a montré 5 réponses
  `302` en `text/html`, sans corps. Ce sont des réponses vides
  (`Content-Length: 0`, `bodySize: 0`) : la règle les écarte, comme le veut la
  décision.
- **`stack-not-from-this-copy` sur le candidat d'essai.** La mesure
  `20261126T221055Z-526b925-…` a été refusée : des commits avaient suivi le
  dernier `npm run stack:up`. Résolution : `npm run stack:up`, puis une
  nouvelle mesure.
- **Revues** : la revue « normes » a relevé que `GLOSSARY.md` contredisait la
  nouvelle définition. La revue « spec » a relevé que l'ADR ne disait ni la
  restriction à HTML, JS et JSON, ni la priorité de `failed`. Les deux sont
  corrigés au commit `f3a97ae`.

## Vérifier soi-même

```sh
npx vitest run tests/gates/witness-value.test.ts tests/gates/result.test.ts
```

Observé au commit `f3a97ae`, la fiche seule non encore commitée :
`Tests 42 passed (42)`.

```sh
npm run migrabench -- measure --candidate fixtures/trial-candidates/claude-code-20261126/candidate
```

Observé sur un arbre propre au commit `526b925`, après `npm run stack:up` :
mesure `20261126T221109Z-526b925-trial-candidates-claude-code-20261126-candidate`,
`completed (ok)`, oracle à 38 sur 38. Porte `passed`, `examined: 199`,
`responseBodiesAbsent: 0`, `responseBodiesUnread: 0`.

La porte du commit `389207d` appliquée aux HAR de l'exécution 45861318349
(script jetable de la session) :

| Mesure | Issue | `responseBodiesAbsent` | `responseBodiesUnread` |
|---|---|---|---|
| candidat de référence | `failed` | 5 | 0 |
| `relay-alters-label` | `failed` | 3 | 0 |
| `relay-forged-healthcheck` | `passed` | 38 | 0 |
| `relay-untouched` | `passed` | 38 | 0 |

> À vérifier après l'exécution de la CI de la PR : issues de la porte dans le job des mesures lancé sur la branche (référence `failed`, `relay-alters-label` `failed`, `relay-forged-healthcheck` et `relay-untouched` `passed`), avec le lien et le commit.

## Pour aller plus loin

- La porte de rôle (#131) : `role-replay` non évaluable si le rejeu de
  contrôle échoue, avec `evaluable: false`.
- Une réponse sans `Content-Type` n'est pas jugée HTML, JS ni JSON
  (`PROTOCOL.md`) : un candidat pourrait omettre l'en-tête. La liste des types
  JS et JSON omet aussi `text/x-javascript` et `application/x-json`.
- ADR 0008, pour le sens de `not-evaluable`.
