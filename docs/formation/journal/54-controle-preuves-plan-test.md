# #54 · Contrôle des preuves dans le plan de test des PR : chaque case cochée chiffrée cite un commit ou une exécution de CI

## Objectif

`CLAUDE.md` exige qu'une preuve cite l'état exact où elle a été obtenue. Les
plans de test des PR #44 à #48 contenaient des cases cochées chiffrées sans
commit ni lien, par exemple « `npm test` : 143 tests » (relevé dans l'issue),
et aucune relecture ne l'avait vu. Ce ticket ajoute ce contrôle au job « Fiche
de formation ». Chaque case cochée qui contient un nombre doit citer un SHA de
commit ou un lien de job de CI (`actions/runs/<id>`). Sinon, le job échoue
avec une annotation `::error::` qui recopie la ligne.

## Notions à connaître

- **Liste de tâches en Markdown** : une case `- [ ]` ou `- [x]` en tête d'un
  élément de liste à puces ou numérotée. GitHub l'affiche comme une case à
  cocher. — [GitHub Docs : About tasklists](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/about-task-lists)
- **Code en ligne et bloc délimité** (CommonMark) : un code en ligne est
  entouré de backticks, `` ` `` ou ` `` ` `` `, et peut s'étendre sur plusieurs
  lignes. Un bloc délimité s'ouvre par trois ``` ` ``` ou `~` (ou plus) et se
  ferme par la même suite, ou à la fin du document. —
  [CommonMark 0.31.2 : Code spans](https://spec.commonmark.org/0.31.2/#code-spans) ;
  [Fenced code blocks](https://spec.commonmark.org/0.31.2/#fenced-code-blocks)
- **Commandes de workflow GitHub** : une ligne `::error::<message>` écrite sur
  la sortie d'une étape crée une annotation d'erreur. Dans le message, `%`,
  `\r` et `\n` s'écrivent `%25`, `%0D` et `%0A`. —
  [GitHub Docs : Workflow commands for GitHub Actions](https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions)
- **`process.exitCode` plutôt que `process.exit()`** : `exit()` termine le
  processus tout de suite. Sur un pipe, ce qui n'est pas encore écrit sur la
  sortie peut alors être perdu. `exitCode` laisse Node finir d'écrire. —
  [Node.js 22 : process.exitCode](https://nodejs.org/docs/latest-v22.x/api/process.html#processexitcode_1) ;
  [A note on process I/O](https://nodejs.org/docs/latest-v22.x/api/process.html#a-note-on-process-io)
- **Mots-clés de fermeture de GitHub** : `Closes #N`, `Fixes #N`,
  `Resolves #N` et leurs variantes, dans le corps d'une PR, ferment le ticket à
  la fusion. — [GitHub Docs : Linking a pull request to an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)

> À vérifier : les liens de cette section n'ont pas été ouverts pendant la session.

## Ce qui a été construit

- **`scripts/pr-body.ts`** : `stripCode(body, keepSpan)`, l'unique nettoyage
  du corps d'une PR. La fonction retire les blocs délimités, puis le code en
  ligne, même sur deux lignes. Chaque ligne reste à sa place, ce qui permet de
  recopier la ligne d'origine. `keepSpan` choisit les codes en ligne dont le
  contenu reste.
- **`scripts/test-plan-evidence.ts`** : `uncitedLines(body)` rend les cases
  cochées chiffrées qui ne citent aucun état, telles qu'écrites et sans leur
  `\r`. Les règles :
  - **case lue** : liste à puces `-`, `*`, `+` ou liste numérotée `1.`,
    `1)`, case `[x]` ou `[X]`, suivie d'une espace ou d'une tabulation ;
  - **nombre** : un nombre isolé (`143`, `14/14`, `Node 24`). `R2`, `D-0999`,
    `v22`, `#41` et le numéro d'un élément de liste n'en sont pas ;
  - **état** : un SHA de 7 à 40 caractères hexadécimaux, avec au moins une
    lettre et un chiffre, ou un lien `actions/runs/<id>`. Les deux comptent en
    prose comme seuls dans un code en ligne.
- **`scripts/check-test-plan-evidence.ts`** : lit `PR_BODY`. Il écrit
  `::error::Case cochée chiffrée sans état (…) : <ligne>` pour chaque ligne en
  défaut et sort en échec.
- **`scripts/training-sheet.ts`** et **`scripts/check-training-sheet.ts`** :
  la vérification de fiche, portée du perl vers TypeScript. `closedTickets`
  lit les mots-clés de fermeture sur le corps nettoyé par `stripCode`. Les
  messages sont les mêmes qu'avant.
- **`.github/workflows/fiche-ticket.yml`** : `setup-node` (Node de `.nvmrc`,
  épinglé par SHA), puis les deux scripts. Le second tourne même si le premier
  échoue (`if: ${{ !cancelled() }}`).
- **Tests** :
  - `tests/test-plan-evidence.test.ts` (16 tests) ;
  - `tests/check-test-plan-evidence.test.ts` (3) ;
  - `tests/pr-body.test.ts` (4) ;
  - `tests/training-sheet.test.ts` (7) ;
  - `tests/fixtures/test-plans/pr41.md`, `pr44.md`, `pr48.md`, `pr50.md` : les
    corps réels de ces PR (`gh pr view <N> --json body`).

## Les choix faits et pourquoi

- **Un SHA seul dans un code en ligne compte comme état.** L'issue disait
  qu'un SHA écrit dans du code ne compte pas. Or toutes les PR citent leurs
  commits entre backticks : #50 aurait échoué sur « commit `2efc6c3` ». Tout
  autre code en ligne est retiré, et ses nombres ne comptent pas. Décision de
  l'humain.
- **« Nombre » = nombre isolé.** Avec « tout chiffre », `R2`, `R17` et
  `D-0999` auraient compté. Décision de l'humain.
- **#41 et #50 échouent, chacun sur une ligne nommée.** L'issue attendait que
  leurs plans passent, mais même avec les deux lectures souples, ces deux
  lignes ne citent aucun état :
  - #41 : « … R2 et R17 réussis, … 0 ligne avec … » ;
  - #50 : « Les 5 JSON du job de preuve … relancé sur eux en local ».

  L'autre option était qu'une case sans état hérite de l'état de la case
  précédente. Elle a été écartée : une preuve aurait alors pu citer l'état
  d'une autre mesure. Le test vérifie les deux lignes. Décision de l'humain,
  et le critère d'acceptation est amendé dans la PR.
- **Le perl de la vérification de fiche est remplacé par TypeScript.** Les
  deux contrôles lisent le même corps dans le même job, ils le nettoient avec
  une seule fonction. La première version recopiait les expressions du perl
  en TypeScript : relevé par la revue de code (standards), refait sur
  demande de l'humain (`ee6a88c`, `c0523be`).
- **Corrections après la revue de code (spec)**, sur demande de l'humain
  (`55456ca`) :
  - `#N` est un identifiant ;
  - un SHA contient au moins une lettre et un chiffre, sinon `20261121` ou
    `defaced` passaient pour des SHA ;
  - les listes numérotées et la tabulation sont lues ;
  - un lien `actions/runs/` en code en ligne compte ;
  - le `\r` est retiré des lignes recopiées ;
  - les messages du script sont en français, comme ceux de la vérification de
    fiche.
- **« Job de CI » plutôt qu'« exécution de CI ».** Dans `PROTOCOL.md`, un run
  est « une exécution complète d'un outil ». Relevé par la revue de code.
- **`setup-node` ajouté au job.** Les scripts sont en TypeScript, lancés sans
  compilation par le Node de `.nvmrc`. L'action est épinglée au même SHA que
  dans les autres workflows (`docs/agents/pinned-actions.md`).

## Difficultés rencontrées

- **Les critères d'acceptation de l'issue se contredisaient.**
  - Symptôme : une sonde a appliqué la règle à la lettre aux quatre plans
    réels. Elle refusait 3 lignes de #44, 5 de #48, 1 de #41 et 2 de #50,
    dont « commit `2efc6c3` » (SHA en code en ligne).
  - Cause : la règle « le code ne compte pas » et la lecture « tout chiffre ».
  - Résolution : les trois décisions de l'humain ci-dessus.
- **Huit tests n'ont jamais été rouges.**
  - Symptôme : après la première tranche, les 8 tests suivants sont passés dès
    leur première exécution (`Tests  10 passed (10)`).
  - Cause : l'implémentation de la première tranche couvrait déjà leurs
    règles.
  - Résolution : chaque règle a été cassée à tour de rôle dans le code, puis
    restaurée. Chaque mutation a fait échouer au moins un test, par exemple
    « sans retrait des blocs délimités » → `1 failed | 9 passed`. Un test
    n'était attrapé par aucune mutation : « does not take a commit from a
    fenced block », retiré.
- **Le numéro d'un élément de liste comptait comme un nombre.** Trouvé
  pendant la réécriture sur `stripCode`, après l'ajout des listes numérotées.
  Dans `1. [x] Sélecteurs sémantiques`, le `1` était pris pour un nombre. Le
  contrôle retire maintenant la case avant de chercher un nombre.
- **`process.exit(1)` pouvait tronquer les annotations.** Il a été remplacé
  par `process.exitCode = 1` avant le premier commit.

### Les tests rouges vus dans la session

Chaque état cite le commit de départ et ce qui n'était pas encore commité.

1. **Plans réels de #44 et #48.**
   - État : `15b66c6` (main), avec le test et les quatre corps de PR non
     commités, sans `scripts/test-plan-evidence.ts`.
   - Sortie : `Cannot find module '../scripts/test-plan-evidence.ts'`.
2. **Script du job.**
   - État : la tranche 1 non commitée, plus `check-test-plan-evidence.test.ts`.
   - Sortie : `Tests  3 failed (3)`.
3. **`#N` identifiant.**
   - État : `66c5efd`, plus le test.
   - Sortie : `Tests  1 failed | 9 passed (10)`.
4. **SHA avec une lettre et un chiffre.**
   - État : `66c5efd`, plus les corrections précédentes et le test.
   - Sortie : `1 failed | 10 passed (11)`.
5. **Listes numérotées et tabulation.**
   - État : `66c5efd`, plus les corrections précédentes et le test.
   - Sortie : `1 failed | 11 passed (12)`.
6. **Lien `actions/runs/` en code en ligne.**
   - État : `66c5efd`, plus les corrections précédentes et le test.
   - Sortie : `1 failed | 12 passed (13)`.
7. **`\r` retiré, messages en français.**
   - État : `66c5efd`, plus les corrections précédentes et les tests.
   - Sortie : `3 failed | 14 passed (17)`.
8. **`stripCode` partagé.**
   - État : `55456ca`, plus `tests/pr-body.test.ts`.
   - Sortie : `Cannot find module '../scripts/pr-body.ts'`.
9. **Code en ligne sur deux lignes.**
   - État : `55456ca`, plus `stripCode` non commité et le test.
   - Sortie : `1 failed | 14 passed (15)`.
10. **Numéro d'un élément de liste.**
    - État : `55456ca`, plus la réécriture non commitée et le test.
    - Sortie : `1 failed | 15 passed (16)`.
11. **Vérification de fiche en TypeScript.**
    - État : `ee6a88c`, plus `tests/training-sheet.test.ts`.
    - Sortie : `Cannot find module '../scripts/training-sheet.ts'`.

## Vérifier soi-même

```sh
npx vitest run tests/test-plan-evidence.test.ts tests/check-test-plan-evidence.test.ts tests/pr-body.test.ts tests/training-sheet.test.ts
```

Attendu (observé sur `c0523be`, fichier par fichier) : 16, 3, 4 et 7 tests
passés.

```sh
PR_BODY="$(cat tests/fixtures/test-plans/pr44.md)" node scripts/check-test-plan-evidence.ts; echo "exit $?"
```

Attendu (observé sur `c0523be`) : trois lignes, dont
`::error::Case cochée chiffrée sans état (SHA de commit ou lien de job de CI
actions/runs/<id>) : - [x] `npm test` : 143 tests`, puis `exit 1`.

```sh
PR_BODY="$(gh pr view 57 --json body -q .body)" node scripts/check-training-sheet.ts
PR_BODY="$(gh pr view 57 --json body -q .body)" node scripts/check-test-plan-evidence.ts
```

Attendu (observé sur `c0523be`) : `Fiche trouvée pour #53.`, puis
`Chaque case cochée chiffrée cite un état.`, avec le code de sortie `0` pour
les deux.

Parité du perl et de TypeScript : sur les corps des PR #17 à #57, les tickets
trouvés sont les mêmes (observé sur `c0523be` : `identiques: 23,
différents: 0`).

```sh
npm test
```

Attendu (observé sur `c0523be`, pile Docker démarrée) :
`Test Files  37 passed (37)`, `Tests  259 passed (259)`.

> À vérifier après l'exécution de la CI de la PR : le lien du job « Fiche de
> formation » sur la PR du ticket, son head SHA, et la sortie des deux étapes.

## Pour aller plus loin

- Limite connue : une case cochée qui cite un nombre en toutes lettres
  (« cinq exécutions ») n'est pas contrôlée.
- Limite connue : un SHA cité ne prouve pas que la mesure a été faite sur ce
  commit. Le contrôle vérifie seulement qu'un état est cité.
- [#53](53-controle-resultats-oracle-versionnes.md) : le même principe,
  appliqué aux résultats d'oracle versionnés.
