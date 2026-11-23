# #64 · Étape 3 · Contrat de candidat : schéma publié et sources du package-lock.json

## Objectif

Jusqu'ici, le runner lisait `candidate.json` sans le valider : un champ
inconnu était ignoré, une `url` déclarée passait, et une dépendance tirée
d'un dépôt Git ou d'un autre registre aurait été installée. Ce ticket donne
au banc un **contrat de candidat** vérifiable : un schéma JSON publié, une
fonction pure qui valide le dossier du candidat, et son branchement dans la
phase 2 d'une mesure. Un contrat invalide arrête la mesure avant tout code
du candidat, et la range à part (`contract-failure`), pour ne pas confondre
un agent qui déclare mal et un agent qui migre mal.

## Notions à connaître

- **JSON Schema 2020-12 et `additionalProperties: false`** : par défaut, un
  objet JSON Schema accepte les propriétés non décrites ;
  `additionalProperties: false` les refuse. C'est ce qui fait d'un champ
  inconnu, `url` comprise, un manquement et non un champ ignoré. —
  [Understanding JSON Schema : Additional Properties](https://json-schema.org/understanding-json-schema/reference/object#additionalproperties)
- **Ajv et la classe `Ajv2020`** : Ajv compile un schéma en fonction de
  validation. La classe par défaut vise le draft-07 ; un schéma 2020-12
  demande une autre classe, importée de `ajv/dist/2020.js`. —
  [Ajv : draft-2020-12](https://ajv.js.org/json-schema.html#draft-2020-12)
  > À vérifier : le nom `Ajv2020` n'a pas été lu sur cette page (bloc de code non extrait) ; il a été lu dans `node_modules/ajv/dist/2020.d.ts`.
- **Options `allErrors` et `strict` d'Ajv** : `allErrors` collecte toutes les
  erreurs au lieu de s'arrêter à la première ; `strict` fait échouer la
  compilation d'un schéma mal écrit. —
  [Ajv : options](https://ajv.js.org/options.html)
- **Section `packages` et champ `resolved` du `package-lock.json`** : chaque
  entrée de `packages` est un chemin (`node_modules/left-pad`) et son
  `resolved` dit d'où le paquet a été pris : registre, Git, archive, chemin
  local. C'est ce champ que le contrat contrôle. —
  [npm Docs : package-lock.json](https://docs.npmjs.com/cli/v10/configuring-npm/package-lock-json)
- **Import nommé d'un module CommonJS sous ESM** : Ajv est publié en
  CommonJS. Node détecte par analyse statique les exports nommés d'un module
  CommonJS, ce qui permet `import { Ajv2020 } from "ajv/dist/2020.js"`. —
  [Node.js 22 : CommonJS Namespaces](https://nodejs.org/docs/latest-v22.x/api/esm.html#commonjs-namespaces)
- **Codes d'erreur système `ENOENT` et `EISDIR`** : `ENOENT`, fichier absent ;
  `EISDIR`, un fichier attendu est un dossier. La phase 2 traite le premier
  comme un manquement du contrat, le second comme une erreur du runner. —
  [Node.js 22 : Common system errors](https://nodejs.org/docs/latest-v22.x/api/errors.html#common-system-errors)
  > À vérifier : la présence d'`EISDIR` dans la liste de cette page n'a pas été lue mot pour mot.

## Ce qui a été construit

- `runner/schemas/candidate-1.schema.json` : le **schéma publié**, en JSON
  Schema 2020-12. Champs `$schema`, `contract` (`const` 1), `build`
  facultatif, `start` obligatoire, `additionalProperties: false`. Le `1` du
  nom est la version du contrat : une montée de version ajoutera un schéma.
- `runner/contract.ts` : `checkContract`, **fonction pure** qui prend le
  contenu brut de `candidate.json`, `package.json` et `package-lock.json`
  (`undefined` pour un fichier absent) et rend le contrat validé ou la liste
  des manquements. Elle lit le schéma dans son fichier et le donne à Ajv :
  une seule définition du contrat. Elle contrôle aussi chaque source du
  `package-lock.json` (registre imposé `https://registry.npmjs.org/`, Git,
  autre hôte, archive distante, chemin local).
- `runner/contract-phase.ts` : `contractPhase`, la **phase 2** sur la copie
  du candidat. Elle lit les trois fichiers, appelle `checkContract` et rend
  `ok`, `contract-invalid` (les manquements, un par ligne, en `detail`) ou
  `runner-error-before-candidate` (l'erreur en `detail`), avec les champs
  `contract`, `build`, `start` destinés à `measure.json`.
- `runner/measure.ts` : la phase 2 branchée. Après un contrat invalide, la
  construction, le démarrage, l'oracle et les portes restent `not-run`,
  `candidate.contract` est absent, aucune composition du candidat n'est
  écrite (`environment.composeOverride` absent) et la clôture n'a aucun
  conteneur à arrêter.
- `fixtures/defective-candidates/contract-invalid/` : le **candidat
  défectueux 1**. Copie du candidat de référence, avec une `url` déclarée
  dans `candidate.json` et `left-pad@1.3.0` résolu sur
  `registry.example.org` dans `package-lock.json`.
- `package.json`, `package-lock.json` : Ajv `^8.20.0` en `dependencies`.
- Tests :
  - `tests/runner/contract.test.ts` : chaque champ du schéma, champ inconnu,
    `url` et `port` refusés avec leur message, fichiers absents, JSON mal
    formé, chaque sorte de source refusée, chemin local dans le candidat
    accepté ;
  - `tests/runner/contract-phase.test.ts` : le candidat défectueux 1 et son
    verdict, le candidat de référence et les autres candidats défectueux qui
    passent le contrat, fichier absent contre fichier illisible.

## Les choix faits et pourquoi

- **Ajv plutôt qu'une validation écrite à la main** : le schéma est le
  contrat publié, que l'étape 6 donnera à l'agent ; le valider avec lui-même
  évite une seconde définition qui pourrait diverger. Ajv est en
  `dependencies`, pas en `devDependencies`, parce que le runner s'en sert à
  l'exécution.
- **`Ajv2020` plutôt que la classe par défaut** : la classe par défaut vise
  le draft-07, et le schéma est en 2020-12.
- **Import nommé `{ Ajv2020 }` plutôt que l'import par défaut** : sous
  `module: NodeNext`, l'import par défaut d'un module CommonJS rend
  `module.exports` et le typage devient ambigu. Précaution vérifiée par le
  typecheck et par un appel sous `node` seul, pas une erreur rencontrée.
- **Une fonction pure qui prend le contenu des fichiers, plutôt qu'un
  dossier** : la lecture du disque reste à la phase 2 ; le contrat se teste
  sans dossier. La phase est un module à part (`contract-phase.ts`), testé
  sur les vrais dossiers de `fixtures/` sans Docker.
- **Fichier absent = manquement, autre erreur de lecture = erreur du
  runner** : un `candidate.json` absent est une faute du candidat ; un
  fichier illisible pour une autre raison (`EISDIR`) n'est pas un défaut de
  déclaration, et la spec range une erreur imprévue avant `npm ci` en
  `runner-error-before-candidate`.
- **Message dédié pour `url` et `port`** : ils sont refusés par
  `additionalProperties: false` comme tout champ inconnu ; le code reconnaît
  ces deux noms pour dire que le banc impose le port (variable `PORT`).
- **Sources du `package-lock.json`** :
  - registre comparé par protocole et hôte : `http://registry.npmjs.org` est
    refusé ;
  - une entrée sans `resolved` est acceptée : `npm ci` la prend sur le
    registre configuré, le registre imposé ;
  - « autre hôte » contre « archive distante » : une URL dont le chemin a la
    forme `/<paquet>/-/<fichier>.tgz` est rangée « autre hôte ». C'est une
    heuristique : les deux sont refusées, seule l'étiquette change ;
  - un chemin local est accepté s'il reste dans le candidat, refusé s'il est
    absolu ou s'il en sort, même par un détour (`packages/../../shared`) ;
  - tout autre préfixe (`npm:…`) est refusé comme source inconnue, au lieu
    d'être pris pour un chemin local.
- **Lockfile sans section `packages` (lockfileVersion 1) refusé** : hors du
  texte de la spec, mais sans cette règle ses sources passeraient sans
  contrôle.
- **`package.json` seulement présent et bien formé** : la spec vise les
  sources du `package-lock.json`, et `npm ci` refuse un `package.json` en
  désaccord avec le lock.
- **Contrat invalide : pas de composition du candidat écrite** : aucun
  service `candidate` n'est décrit, donc la clôture n'a rien à arrêter, et
  `environment.composeOverride` est absent plutôt que l'empreinte d'un
  fichier qui ne sert pas.
- **Candidat défectueux 1 sur `registry.example.org`** : domaine réservé,
  jamais résolu. `package.json` déclare `left-pad` pour rester cohérent avec
  le lock ; pas d'`integrity`, le contrat échoue avant `npm ci`.

## Difficultés rencontrées

- **Premier rouge à l'import.**
  - Symptôme : `npx vitest run tests/runner/contract.test.ts` →
    `Tests  no tests`, échec à l'import de `runner/contract.ts`.
  - Cause : le module n'existait pas ; ce rouge ne prouve aucune assertion.
  - Résolution : une fonction qui rend toujours `{ ok: false, failures: [] }`,
    qui a donné `Tests  38 failed | 1 passed (39)`.
- **Deux tests jamais vus rouges, relevés par l'utilisateur.**
  - Symptôme : le test « source inconnue », écrit après sa règle, et le test
    du schéma publié, écrit avec le schéma, étaient verts dès le départ.
  - Cause : test écrit après le code.
  - Résolution : rouges montrés par mutation temporaire, sur `e9f665b` (SHA
    d'avant le rebase, devenu `e23ebd4`). Sans la règle `npm:` :
    `Tests  1 failed | 39 passed (40)`. Sans `additionalProperties: false`
    dans le schéma : `Tests  6 failed | 34 passed (40)`. Code remis, puis
    `Tests  40 passed (40)`.
- **Travail parallèle de #62, #63 et #65.**
  - Symptôme : le chemin du candidat de référence et la catégorie de
    `contract-invalid` n'existaient pas encore ; le branchement et le
    candidat défectueux 1 ont été reportés.
  - Résolution : reprise après leur fusion, par un rebase sur `7c5242c`. Seul
    conflit : `include` de `tsconfig.json`, résolu en gardant la version de
    `main`, qui contenait déjà `runner` et ajoutait `shared`.
- **Un rouge de la phase 2 qui n'était pas une assertion.**
  - Symptôme : avec un `contractPhase` vide, `Tests  7 failed (7)`, dont un
    sur `Error: Outcome runner-error-before-candidate of phase contract makes
    the measure invalid without evidence`.
  - Cause : le stub rendait une issue invalide sans preuve, que `verdict`
    refuse avant toute assertion du test.
  - Résolution : accepté tel quel (les six autres échouaient sur leurs
    assertions), puis `Tests  7 passed (7)` après l'implémentation.
- **La pile Docker occupée par une autre session (étalonnage).**
  - Symptôme : ni mesure réelle, ni `tests/seam-a` et `tests/seam-b`, qui
    interrogent la pile en marche.
  - Résolution : critères prouvés d'abord par Vitest sur la fonction de
    phase et sur `measureRecord`, le reste des tests lancé avec ces deux
    dossiers exclus ; mesures réelles lancées une fois la pile libérée, sur
    `0e13c81` ; `npm test` complet laissé à la CI.

## Vérifier soi-même

Sorties observées au commit `8d6f60d`, arbre propre, Node 22.23.5, sous
macOS, sans Docker.

```sh
npx vitest run tests/runner/contract.test.ts tests/runner/contract-phase.test.ts
#  Test Files  2 passed (2)
#       Tests  47 passed (47)
npm run typecheck
# tsc --noEmit, sans erreur
npx vitest run --exclude "tests/seam-a/**" --exclude "tests/seam-b/**"
#  Test Files  45 passed (45)
#       Tests  360 passed (360)
```

La phase 2 sous `node` seul, hors Vitest, sur le candidat défectueux 1 puis
le candidat de référence :

```sh
node -e 'import("./runner/contract-phase.ts").then(async m => { for (const d of ["fixtures/defective-candidates/contract-invalid","fixtures/reference-candidate"]) console.log(JSON.stringify(await m.contractPhase(d))) })'
# {"outcome":"contract-invalid","candidate":{},"detail":"candidate.json: field \"url\" is not allowed: the bench imposes the port, read it from the PORT variable\npackage-lock.json: \"node_modules/left-pad\" is resolved on another host: https://registry.example.org/left-pad/-/left-pad-1.3.0.tgz"}
# {"outcome":"ok","candidate":{"contract":1,"start":"node server.js"}}
```

Le candidat défectueux 1, mesuré sur la pile :

Sorties observées au commit `0e13c81`, arbre propre, pile levée par
`npm run stack:up` :

```sh
npm run migrabench -- measure --candidate fixtures/defective-candidates/contract-invalid; echo "exit=$?"
# Measure: results/diagnostic/20261123T215039Z-0e13c81-defective-candidates-contract-invalid
# Outcome: contract-failure (contract-invalid)
# exit=0
```

Son `measure.json` contient :

- phases : `preparation:ok contract:contract-invalid build:not-run
  start:not-run oracle:not-run gates:not-run closing:ok` ;
- `detail` de la phase `contract` : les deux manquements, `field "url" is
  not allowed: the bench imposes the port…` et `"node_modules/left-pad" is
  resolved on another host: https://registry.example.org/…` ;
- `candidate` : `path` et `contentDigest` seulement, sans `contract` ;
- `oracle` : `executed: false`, 38 non atteints ; pas de `composeOverride` ;
- `verdict` : `{"category":"contract-failure","reason":"contract-invalid"}`.

Une première mesure (`20261123T215032Z`) a été lancée avec la sortie passée
à `tail` : le code affiché était celui de `tail`, d'où la seconde.

Le candidat de référence, mesuré sur la pile (`candidate.contract` doit
valoir `1`, la version lue) :

```sh
npm run migrabench -- measure --candidate fixtures/reference-candidate; echo "exit=$?"
# Measure: results/diagnostic/20261123T215048Z-0e13c81-reference-candidate
# Outcome: completed (ok)
# exit=0
```

Son `measure.json` contient :

- phases : les sept à `ok` ;
- `candidate` : `"contract":1,"start":"node server.js"` ;
- `oracle` : `executed: true`, 38 scénarios, 38 réussis, 0 échoué,
  0 non atteint ;
- `verdict` : `{"category":"completed","reason":"ok"}`.

`npm test` complet, `tests/seam-a` et `tests/seam-b` compris :

> À vérifier après l'exécution de la CI de la PR : le lien du job « Tests du banc », son head SHA et le nombre de tests passés

## Pour aller plus loin

- #74 : le job de CI qui mesure les candidats défectueux sur une vraie pile,
  dont le 1.
- Étape 6 (`docs/PLAN.md`) : le schéma publié donné à l'agent dans le prompt.
- ADR 0007 et #65 : le contrat refuse une source hors du registre imposé ;
  la construction impose ce registre à l'exécution.
- Limite connue : le `$id` du schéma pointe vers
  `raw.githubusercontent.com/karAmmi12/migrabench/main/…`, choix provisoire
  qui ne vaut que si le dépôt est public.
