# #46 · Tests de la référence d'archivage en échec après npm run oracle

## Objectif

`npm run oracle` recrée le service d'archivage avec un sel tiré pour
l'exécution. `.dev-archive-salt` garde alors le sel de `npm run stack:up`, et
`npm test` le relit. Les tests de la référence d'archivage échouaient avec un
écart de HMAC sans explication (`expected '42220D8B5676' to be
'7A2A5A15F9AD'`, relevé dans l'issue). Ce ticket les fait échouer avec un
message qui dit de relancer `npm run stack:up`.

Le point à retenir : avec un sel périmé, trois tests de non-fuite du sel
passaient **pour rien**. Ils cherchaient dans les réponses un sel que la pile
n'utilisait plus. Ils échouent désormais avec le même message.

## Notions à connaître

- **HMAC** : une empreinte calculée à partir d'un message et d'une clé secrète,
  ici le sel. La même entrée avec un autre sel donne une autre empreinte. Un
  écart de HMAC ne dit donc pas si c'est le code ou le sel qui a changé. —
  [Node.js 22 : crypto.createHmac](https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptocreatehmacalgorithm-key-options)
- **Test qui passe pour rien** : une assertion négative (« ne contient pas »)
  passe aussi quand elle cherche la mauvaise valeur. Ici, « la réponse ne
  contient pas le sel » est vraie pour n'importe quel sel que la pile
  n'utilise pas. Une assertion négative n'a de valeur que si l'on sait qu'elle
  porte sur la bonne valeur, d'où le contrôle préalable du sel.
- **Opérateur `??=`** : affecte la variable seulement si elle vaut `null` ou
  `undefined`. `knownSalt()` garde ainsi une seule promesse pour tout le
  fichier : la pile n'est interrogée qu'une fois, et une promesse rejetée
  renvoie la même erreur à chaque test. —
  [MDN : Nullish coalescing assignment](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_assignment)
- **`docker compose exec -T <service> env`** : lance `env` dans le conteneur
  en marche et renvoie ses variables d'environnement, sans terminal (`-T`).
  C'est ainsi que le test lit le sel réel du service d'archivage. —
  [Docker : docker compose exec](https://docs.docker.com/reference/cli/docker/compose/exec/)

## Ce qui a été construit

- **`scripts/dev-archive-salt.ts`** : `checkStackSalt(stackSalt, knownSalt)`.
  Si le sel de la pile n'est pas celui de `npm test` (ou si la pile n'en a
  pas), elle lève une erreur : « The stack does not run with the archive salt
  of npm test: rerun `npm run stack:up` (after `npm run oracle`, the stack
  keeps the salt of the oracle execution), or start the stack and the tests
  with the same ARCHIVE_SALT (README) ». Le message ne cite aucun des deux
  sels.
- **`tests/dev-archive-salt.test.ts`** : trois tests de `checkStackSalt`, sans
  pile Docker. Même sel : accepté. Autre sel, ou aucun : message. Le message ne
  contient aucun des deux sels.
- **`tests/seam-a/archive-reference.test.ts`** : `knownSalt()` devient
  asynchrone. Elle résout le sel (`ARCHIVE_SALT` du shell, sinon
  `.dev-archive-salt`) puis le compare à celui du conteneur `archive`, une
  seule fois. Le test « passes the salt to the archive service » est supprimé.
- **`README.md`** : le paragraphe « Tests du banc » décrit ce contrôle.

## Les choix faits et pourquoi

- **Le message seul, pas de remise en place automatique de la pile.** L'issue
  laissait les deux options. La remise en place automatique par
  `npm run oracle` est écartée, sans ticket de suivi : l'oracle produit des
  mesures, il ne gère pas l'environnement de développement. Décision de
  l'humain.
- **La comparaison porte sur le sel résolu, pas sur le seul
  `.dev-archive-salt`.** En CI, le sel vient d'`ARCHIVE_SALT` du shell. Le
  même contrôle couvre donc les deux cas, et le message cite les deux remèdes.
- **Une `Error` levée, pas un `expect`.** Un `expect(...).toBe(...)` aurait
  affiché les deux sels dans le diff de Vitest. L'erreur garde le message
  lisible et ne montre aucun sel.
- **Le test « passes the salt to the archive service » est supprimé.**
  `knownSalt()` faisait déjà la même comparaison et levait une erreur avant
  son `expect`, qui ne pouvait donc plus échouer : c'était une fausse
  couverture. La comparaison de `knownSalt()` le remplace. Relevé par la
  revue de code, supprimé sur décision de l'humain (`fee35a2`).
- **« oracle execution » plutôt que « run » dans le message.** Dans
  `PROTOCOL.md`, un run est l'exécution complète d'un outil. Relevé par la
  revue de code (`4e31bd4`).

## Difficultés rencontrées

- **Trois tests de non-fuite passaient pour rien avec un sel périmé.**
  - Symptôme : l'issue ne citait que trois tests en échec. Sur `main`
    (`b3e7ac1`), avec un `ARCHIVE_SALT` différent de celui de la pile, on
    observe `3 failed | 5 passed`. Les trois tests « never returns the salt in
    the 200 receipt / 403 refusal / 404 unknown route » sont en ✓.
  - Cause : ils vérifient que les réponses ne contiennent pas le sel connu de
    `npm test`. Avec un sel périmé, ils cherchaient un sel que la pile
    n'utilise plus, et ne pouvaient donc pas échouer.
  - Résolution : ils passent par `knownSalt()`, qui vérifie d'abord le sel de
    la pile. Sur `fee35a2`, avec le même sel faux : `5 failed | 2 passed`, et
    les cinq échecs portent le message explicite.
- **Le test du message pouvait passer sans erreur levée.**
  - Symptôme : relevé par la revue de code. Si `checkStackSalt` ne levait pas
    d'erreur, le message restait vide, et les deux `not.toContain` passaient.
  - Résolution : une assertion `toContain("npm run stack:up")` sur le message
    (`4e31bd4`).
- **`npm test` refusé sous la mauvaise version de Node.**
  - Symptôme : `npm test requires Node 22.23.5 (.nvmrc), found v22.20.0.`
  - Résolution : `nvm use`.

## Vérifier soi-même

Sorties observées au commit `fee35a2`, Node v22.23.5, Docker Compose
2.40.3-desktop.1, pile lancée par `npm run stack:up`.

```sh
nvm use
npm run typecheck
# > tsc --noEmit        (aucune erreur)

npm test
# Test Files  27 passed (27)
#      Tests  173 passed (173)

# Simuler un sel périmé, sans toucher à .dev-archive-salt :
ARCHIVE_SALT=ffeeddccbbaa99887766554433221100 npx vitest run tests/seam-a/archive-reference.test.ts
# FAIL … archive reference > shows the HMAC of the number under the receipt title
# FAIL … archive reference > changes the reference with the number
# FAIL … archive salt isolation > never returns the salt in the 200 receipt
# FAIL … archive salt isolation > never returns the salt in the 403 refusal
# FAIL … archive salt isolation > never returns the salt in the 404 unknown route
# Error: The stack does not run with the archive salt of npm test: rerun `npm run stack:up` …
#      Tests  5 failed | 2 passed (7)
```

Pour voir l'ancien comportement, copier la version de `main` à côté et la
lancer avec le même sel faux (observé sur `b3e7ac1`) :

```sh
git show main:tests/seam-a/archive-reference.test.ts > tests/seam-a/zz-main.test.ts
ARCHIVE_SALT=ffeeddccbbaa99887766554433221100 npx vitest run tests/seam-a/zz-main.test.ts --reporter=verbose
# × … shows the HMAC of the number under the receipt title
# × … changes the reference with the number
# ✓ … never returns the salt in the 200 receipt
# ✓ … never returns the salt in the 403 refusal
# ✓ … never returns the salt in the 404 unknown route
# × … passes the salt to the archive service
#      Tests  3 failed | 5 passed (8)
rm tests/seam-a/zz-main.test.ts
```

La CI de la PR lance `npm test` avec `ARCHIVE_SALT` défini. Exécution
« Tests du banc »
[45040072305](https://github.com/karAmmi12/migrabench/actions/runs/45040072305),
sur le commit `56e7b6c`, en 2 min 11 s :

```text
Test Files  27 passed (27)
     Tests  173 passed (173)
```

## Pour aller plus loin

- La consigne « start the stack and the tests with the same ARCHIVE_SALT
  (README) » est écrite deux fois, dans `resolveArchiveSalt` et dans
  `checkStackSalt`. La revue l'a relevé, et elle est restée telle quelle.
- Si la pile est arrêtée, tous les tests du fichier échouent sur l'erreur de
  `docker compose exec`, et plus sur le `fetch`.
- Fiche liée : [`33-reference-archivage-accuse-remise.md`](33-reference-archivage-accuse-remise.md),
  sur la référence d'archivage et son sel.
