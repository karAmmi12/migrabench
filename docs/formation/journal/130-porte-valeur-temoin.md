# #130 · Étape 4 · Porte de la valeur témoin

## Objectif

Le legacy écrit son jeton d'archivage, lu par `System.getenv()`, dans le lien
« Accusé de remise » : le secret part en clair vers le navigateur. C'est un
piège à corriger (`TRAPS.md`, « Secret lu par `System.getenv()` dans un
scriptlet »). Le banc injecte une valeur témoin connue (`ARCHIVE_TOKEN` dans
`.env`). Ce ticket ajoute la porte qui la cherche dans les HAR de l'oracle,
en clair et sous ses encodages courants. Le legacy, présenté par le candidat
de référence, doit échouer.

## Notions à connaître

- **HAR (HTTP Archive)** : un fichier JSON qui garde chaque requête et chaque
  réponse d'une navigation, avec l'URL, les en-têtes et les corps. Le champ
  `response.content.encoding` dit si `text` est en base64. —
  [HAR 1.2, spécification](http://www.softwareishard.com/blog/har-12-spec/)
  (republication de la spécification de Jan Odvarko, auteur du format)
- **`recordHar` de Playwright** : l'option d'un contexte de navigateur qui
  enregistre ce HAR. L'oracle l'utilise avec `content: "embed"`, qui garde
  les corps dans le fichier (`oracle/support.ts`). —
  [Playwright, `browser.newContext`, option `recordHar`](https://playwright.dev/docs/api/class-browser#browser-new-context-option-record-har)
- **base64 et base64url** : deux alphabets qui codent 3 octets en
  4 caractères. base64url remplace `+` et `/` par `-` et `_`. Une même valeur
  donne trois suites de caractères différentes selon sa position modulo
  3 octets dans le message encodé : ce sont les « trois décalages ». —
  [RFC 4648](https://www.rfc-editor.org/rfc/rfc4648), sections 4 et 5
- **Valeur témoin** : la valeur unique et connue d'un secret serveur, dont la
  présence côté navigateur prouve une fuite (`GLOSSARY.md`).

Liens ouverts le 2026-11-26 (`curl -L`) : chacun répond `200`. La page de
Playwright cite `recordHar`, la spécification HAR cite
`encoding [string, optional]`, et la RFC 4648 a une section « URL and
Filename Safe Alphabet ».

## Ce qui a été construit

- **`gates/witness-value.ts`** : la porte, dans le groupe « fichiers ».
  - Préparation : lit `ARCHIVE_TOKEN` dans `.env`. Si la valeur manque,
    l'erreur est `before-candidate` et la mesure est invalide (ADR 0008).
  - Formes cherchées (`witnessForms`) : `plain`, `url-encoded`,
    `base64/offset-0..2`, `base64url/offset-0..2`, `hex-lowercase`,
    `hex-uppercase`.
  - Emplacements lus : `request.url`, `request.headers.<nom>`,
    `request.postData`, `response.headers.<nom>`, `response.content`. Un corps
    en base64 est décodé avant la recherche, qui porte sur des octets.
  - Un seul résultat jugé, `absent-from-har`. `examined` compte les entrées
    lues. Chaque constat donne le scénario, l'URL, l'emplacement et les
    formes trouvées. `values` donne `hars` et `responseBodiesAbsent`, et `raw`
    cite chaque HAR par son empreinte.
- **`gates/registry.ts`** : la porte est la première du registre, avant
  l'accessibilité et le relais.
- **Fixtures** :
  - `tests/fixtures/ci45861318349/oracle-artifacts/…/oracle/` : deux HAR du
    candidat de référence, copiés de l'artefact `measures` de
    l'exécution 45861318349 ;
  - `tests/fixtures/probe130-d110270/` : les deux HAR de la sonde, avec son
    code et son relevé dans `PROVENANCE.md`.
- **`tests/gates/witness-value.test.ts`** : 22 tests. Ils couvrent le
  candidat de référence, chaque forme à chaque décalage, chaque emplacement,
  le HAR de la sonde, la porte sur fichiers et le cas `not-evaluable`.
- **`scripts/measure-cases.ts`** : les attentes du job des mesures. La
  référence et `relay-alters-label` échouent, `relay-forged-healthcheck` et
  `relay-untouched` passent.
- **`.gitignore`** : les HAR restent ignorés, sauf ceux de `tests/fixtures/`.
- **`PROTOCOL.md`** : une limite de plus, sur les corps que le HAR ne garde
  pas.

## Les choix faits et pourquoi

- **Sonde avant toute fixture**, sur le navigateur du banc : un petit serveur
  lancé dans un conteneur avec l'alias réseau `candidate` est joint par le
  relais du service `browser` sur `127.0.0.1:8100`, comme un candidat.
  Raison : la règle des fixtures et la spec demandent la forme réelle du
  HAR, pas celle de la documentation.
- **Un constat par emplacement, avec la liste des formes trouvées**, plutôt
  qu'un constat par forme. Pour la vraie valeur, base64 et base64url ont le
  même motif aux trois décalages, de même que le clair et l'encodage URL :
  nommer une seule forme serait faux. Les tests prennent donc une valeur
  synthétique (`mbtemoin-??>>~~-7c41`) dont toutes les formes diffèrent.
- **Recherche sur les octets** (`Buffer.includes`) plutôt que sur une chaîne
  latin1 avec une garde « valeur ASCII ». La garde n'était pas testée, et la
  recherche sur les octets n'a pas besoin de l'hypothèse.
- **`responseBodiesAbsent` dans `values`**, qui ne juge pas. La sonde a
  montré qu'un corps jamais lu par la page manque au HAR. La porte le dit
  sans échouer, et `PROTOCOL.md` l'ajoute aux limites.
- **Scénario = dossier du HAR** (`remise-receipt-agent-chromium`), tel
  qu'`oracle.json` le cite, plutôt que le titre du test : le registre ne
  donne à la porte que la liste des fichiers.
- **Mesures réelles d'avant la porte** : les tests de `measure-cases` retirent
  le résultat `witness-value` des attentes appliquées aux mesures copiées
  avant #130, comme pour l'accessibilité.

## Difficultés rencontrées

- **Corps des réponses absents du premier HAR de la sonde.** Toutes les
  réponses à `fetch` avaient `size: -1`, sans `text`. Cause : la page
  n'avait jamais lu les corps. Une fois les corps lus (`arrayBuffer()`), ils
  sont dans le HAR. Le premier HAR est gardé (`probe-unread.har`) comme
  preuve de la limite, et la porte compte ces corps (`responseBodiesAbsent`).
- **Corps binaire d'une requête perdu.** Le POST d'un `Uint8Array` qui
  contient des octets nuls a `postData.text` vide, et un POST `Blob` n'a pas
  de `postData`. Rien à corriger dans la porte : c'est noté dans les limites
  de `PROTOCOL.md`.
- **`npm test` rouge sur 12 tests du Seam A.** Symptôme : « Stack images not
  built from this copy of the repository ». Cause : la pile en marche avait
  été construite depuis une autre copie du dépôt. Résolution :
  `npm run stack:up` depuis ce worktree, puis 1 068 tests verts.
- **HAR des fixtures absents en CI.** Le job `tests` de
  l'[exécution 45891898617](https://github.com/karAmmi12/migrabench/actions/runs/45891898617)
  (commit `2dc132c`) a échoué sur 20 tests : `ENOENT` sur chaque
  `scenario.har`. Cause : `.gitignore` ignore `*.har`, et `git add` n'avait
  rien ajouté sans le dire ; en local, les fichiers étaient sur le disque.
  Résolution : une exception `!tests/fixtures/**/*.har`, et les quatre HAR
  versionnés (commit `dd77c41`).
- **Job `oracle` rouge après l'avancée de `main`.** L'exécution 45893037665
  (commit `dd77c41`) a échoué en 44 s : `scripts/maven-cache.sh: No such
  file or directory`. Cause : #150, fusionné sur `main` pendant la PR, ajoute
  ce script et l'appelle dans le workflow ; la CI de la PR prend le workflow
  de `main`, mais extrait la branche, sans le script. Résolution : `main`
  intégré à la branche.
- **Deux revues coupées** par la limite d'usage de l'API, puis reprises.
- **Provenance de la sonde incomplète**, relevée par la revue « normes ». Le
  script cité écrivait `probe-read.har`, versionné sous le nom `probe.har`.
  Résolution : le renommage est écrit dans `PROVENANCE.md`.
- **Affirmation non vérifiée sur les champs sautés**, relevée par la revue
  « spec ». Le commentaire disait que les cookies et `postData.params`
  répètent d'autres champs. Résolution : il cite maintenant ce que les HAR
  réels et la sonde montrent.

## Vérifier soi-même

```sh
npx vitest run tests/gates/witness-value.test.ts
```

Observé sur un arbre propre au commit `fcea0bf` :

```
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

```sh
npm test
```

Observé pendant la session, sur l'arbre des quatre premiers commits avant
leur création, après `npm run stack:up` : `Test Files 97 passed (97)`,
`Tests 1068 passed (1068)`.

En CI, une fois les HAR versionnés : job `tests` vert,
[exécution 45893037759](https://github.com/karAmmi12/migrabench/actions/runs/45893037759),
commit `dd77c41`.

La porte appliquée aux HAR de l'artefact `measures` de
l'exécution 45861318349 (commit `0d2eb7a`, script jetable de la session) :

| Mesure | Issue | Entrées | Constats | `responseBodiesAbsent` |
|---|---|---|---|---|
| candidat de référence | `failed` | 152 | 7 | 5 |
| `relay-alters-label` | `failed` | 164 | 7 | 3 |
| `relay-forged-healthcheck` | `passed` | 38 | 0 | 38 |
| `relay-untouched` | `passed` | 38 | 0 | 38 |

Sur la vraie pile, job des mesures de la PR
([exécution 45891898621](https://github.com/karAmmi12/migrabench/actions/runs/45891898621),
commit `2dc132c`, succès), relevé dans l'artefact `measures` :

| Mesure | Issue | Entrées | Constats | Phase `gates` |
|---|---|---|---|---|
| `20261126T203447Z-2dc132c-reference-candidate` | `failed` | 152 | 7 | 2 643 ms |
| `20261126T203730Z-2dc132c-defective-candidates-relay-alters-label` | `failed` | 164 | 7 | 2 590 ms |
| `20261126T204002Z-2dc132c-defective-candidates-relay-forged-healthcheck` | `passed` | 38 | 0 | 493 ms |
| `20261126T204045Z-2dc132c-conforming-candidates-relay-untouched` | `passed` | 38 | 0 | 493 ms |

Durée ajoutée à la mesure : `measure.json` ne donne pas la durée d'une porte
seule. La phase `gates` du candidat de référence passe de 2 285 ms sans la
porte (exécution 45861318349, commit `0d2eb7a`) à 2 643 ms avec elle, soit
environ 0,4 s, bien en dessous du seuil de 5 minutes. L'écart mêle la porte
et la variation d'une exécution à l'autre.

### Sur le candidat d'essai : la limite ne le touche pas

Les candidats de la CI qui donnent `responseBodiesAbsent: 38` ne servent
aucun écran. Pour un vrai candidat, mesure de diagnostic de
`fixtures/trial-candidates/claude-code-20261126/candidate`, sur un arbre
propre au commit `58115f5`, après `npm run stack:up` :

```sh
npm run migrabench -- measure --candidate fixtures/trial-candidates/claude-code-20261126/candidate
```

Observé : `Outcome: completed (ok)`, mesure
`20261126T215900Z-58115f5-trial-candidates-claude-code-20261126-candidate`,
oracle à 38 sur 38. La porte y rend `passed`, avec `examined: 199`, aucun
constat, `values: { hars: 38, responseBodiesAbsent: 0 }`. Les 199 corps de
réponse sont dans les HAR, tous en texte : 50 HTML, 48 JS, 99 JSON et 2
`text/plain`. Côté requêtes, les 8 `PUT /api/dossiers/<numéro>` gardent
leur corps JSON dans `postData.text`. Le `POST /api/dossiers/D-0111/remise`
n'a pas de `postData`, mais il n'envoie aucun corps (`Content-Length: 0`,
`bodySize: 0`) : rien n'y est perdu. La porte a donc lu tout ce qui a
circulé entre le navigateur et le candidat pendant l'oracle.

Une première tentative, juste avant, a été refusée
(`stack-not-from-this-copy`) : la pile venait d'être construite depuis la
branche de #130. Elle ne compte pas.

## Pour aller plus loin

- La limite de `PROTOCOL.md` : un morceau de JS jamais demandé pendant
  l'oracle échappe à la porte, de même que les corps absents du HAR.
- La recherche ne détecte pas une obfuscation volontaire (`PROTOCOL.md`) :
  XOR, découpage de la valeur, hexadécimal à casse mélangée.
- #133, la comparaison HAR, lira les mêmes HAR que cette porte.
- ADR 0008 pour le format des résultats, ADR 0005 pour les bruts cités par
  empreinte.
