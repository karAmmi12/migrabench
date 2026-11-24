# #96 · Contrôle des preuves du plan de test : reconnaître un SHA par l'existence du commit, pas par son mélange de lettres et de chiffres

## Objectif

Le job « Fiche de formation » refuse une case cochée chiffrée du plan de test
d'une PR qui ne cite aucun état (règle « Une preuve cite l'état exact » de
`CLAUDE.md`). Jusqu'ici, un SHA y était reconnu à sa forme : 7 à 40 caractères
hexadécimaux, avec au moins une lettre et au moins un chiffre. Ce critère
refusait de vrais commits, comme `6253696` (PR #93, que des chiffres) et
`bcccdea` (PR #88, que des lettres). À la place, le ticket vérifie avec Git
que le SHA cité désigne un commit réel du dépôt.

## Notions à connaître

- **`git rev-parse --verify --quiet <sha>^{commit}`** : `--verify` exige que
  l'argument désigne un seul objet, et `--quiet` fait échouer la commande sans
  message. Le suffixe `^{commit}` demande un commit : un SHA abrégé partagé
  par un commit et un arbre désigne alors ce commit. —
  [git-rev-parse, --verify](https://git-scm.com/docs/git-rev-parse#Documentation/git-rev-parse.txt---verify),
  [gitrevisions, <rev>^{<type>}](https://git-scm.com/docs/gitrevisions#Documentation/gitrevisions.txt-emltrevgtlttypegtemegemv0998commitem)
- **`git rev-parse --disambiguate=<préfixe>`** : liste tous les objets dont
  le nom commence par ce préfixe, de 4 caractères au moins. `git cat-file
  --batch-check` donne ensuite le type de chacun. —
  [git-rev-parse, --disambiguate](https://git-scm.com/docs/git-rev-parse#Documentation/git-rev-parse.txt---disambiguateprefix),
  [git-cat-file](https://git-scm.com/docs/git-cat-file)
- **Clone superficiel** : il n'a que les derniers commits. Il ne peut donc pas
  dire qu'un commit n'existe pas. `git rev-parse --is-shallow-repository`
  répond `true` ou `false`. —
  [git-rev-parse, --is-shallow-repository](https://git-scm.com/docs/git-rev-parse#Documentation/git-rev-parse.txt---is-shallow-repository)
- **`fetch-depth` de `actions/checkout`** : par défaut, un seul commit est
  récupéré ; `fetch-depth: 0` récupère tout l'historique de toutes les
  branches et étiquettes. —
  [actions/checkout, README](https://github.com/actions/checkout)
- **Têtes de PR (`refs/pull/<N>/head`)** : GitHub garde la dernière tête de
  chaque PR sous cette référence. Après une fusion en squash, les commits de
  la branche ne sont joignables que par elle. C'est le cas de `bcccdea`, par
  `refs/pull/88/head`. `npm run fetch:pull-heads` les récupère. —
  [GitHub Docs, Checking out pull requests locally](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/checking-out-pull-requests-locally)
- **`git fast-import`** : il construit des objets Git à partir d'un flux de
  texte. Avec un contenu et des dates fixes, les SHA obtenus sont toujours les
  mêmes. —
  [git-fast-import](https://git-scm.com/docs/git-fast-import)

Liens ouverts le 2026-11-24 (`curl`) : chaque page répond `200`. Les ancres
`---verify`, `---disambiguateprefix` et `---is-shallow-repository` existent
sur la page de `git-rev-parse`, et le README de `actions/checkout` contient la
phrase sur `fetch-depth: 0`.

## Ce qui a été construit

- **`scripts/test-plan-evidence.ts`** :
  - Un SHA cité est un jeton de 7 à 40 caractères hexadécimaux pris dans l'un
    de trois contextes : un code en ligne qui n'est que ce jeton, après le
    mot « commit » ou « SHA », ou dans un lien de commit (`…/commit/<sha>`,
    `…/commits/<sha>`).
  - `refusedLines(body, resolveSha)` rend chaque case cochée chiffrée
    refusée, avec sa raison :
    - aucun état cité ;
    - « ce commit n'existe pas dans le dépôt » ;
    - « SHA abrégé ambigu, il désigne plusieurs commits du dépôt » ;
    - vérification impossible.
  - Chaque SHA cité doit désigner un commit, même à côté d'un vrai commit ou
    d'un lien de job de CI.
  - `resolveShaWithGit(cwd)` est la résolution par Git. Elle rend `commit`,
    `missing`, `ambiguous` ou `unavailable`. `uncitedLines` est retirée.
- **`scripts/pr-body.ts`** : `stripCode` reçoit `rewriteSpan`, qui choisit
  le texte remplaçant un code en ligne (avant, `keepSpan` disait seulement
  s'il restait). Un code en ligne qui n'est qu'un SHA devient `SHA <jeton>`
  dans la prose.
- **`scripts/check-test-plan-evidence.ts`** : chaque annotation `::error::`
  donne la raison, puis recopie la ligne. `tests/check-test-plan-evidence.test.ts`
  lance le script et attend ces annotations, raison comprise.
- **`.github/workflows/fiche-ticket.yml`** : le checkout prend l'historique
  complet (`fetch-depth: 0`), puis le pas « Récupération des têtes de PR »
  lance `npm run fetch:pull-heads`. Le contrôle des preuves ne tourne que si
  ce pas a réussi. Aucune action n'est ajoutée.
- **`tests/test-plan-evidence.test.ts`** :
  - les cas réels de #93 et de #88, sur le vrai Git du dépôt ;
  - les raisons, et le test négatif de la porte ;
  - l'ambiguïté et la vérification impossible, par la couture `resolveSha` ;
  - un dépôt fabriqué avec `git fast-import` (2000 fichiers et 2000 commits)
    pour l'ambiguïté avec le vrai Git ;
  - un clone superficiel, et un dossier hors dépôt.

## Les choix faits et pourquoi

- **L'existence du commit plutôt que la forme du jeton** : c'est la décision
  du ticket, validée par Karim le 24/11. Aucune forme ne sépare `6253696` de
  `20261121`. Seul le dépôt sait lequel est un commit.
- **Git plutôt que l'API GitHub** : le job `tests` récupère déjà l'historique
  complet et les têtes de PR, et les tests restent sans réseau. L'API aurait
  demandé un jeton.
- **`--disambiguate` et `cat-file` plutôt que lire le message d'erreur de
  Git** : sur ce poste, Git répond en français (`fatal : Une seule révision
  attendue`). Un message traduit ne se compare pas. Les codes de sortie et la
  liste des objets, si.
- **Seuls les commits comptent pour l'ambiguïté** : un préfixe partagé par un
  fichier et un arbre ne désigne aucun commit. Il est « inexistant », pas
  « ambigu ».
- **Un clone superficiel rend `unavailable`, jamais `missing`** : il ne voit
  pas les commits anciens. Comme les autres contrôles du banc, une
  vérification impossible ne laisse jamais passer la case.
- **Chaque SHA cité doit exister** (correction de Karim) : la première
  version acceptait une ligne dès qu'un de ses SHA existait. Une ligne qui
  cite un vrai commit et un faux est une preuve fausse en partie : elle est
  refusée, et la raison nomme le SHA inexistant. C'est vrai aussi à côté d'un
  lien de job de CI.
- **Réécrire un SHA seul en code en ligne en `SHA <jeton>`** : la prose n'a
  plus qu'un seul contexte à reconnaître, « après le mot SHA ». L'option
  écartée était de garder le jeton nu : il ne se distinguait plus d'un SHA
  écrit en prose sans contexte, qui n'est plus un SHA cité.
- **Comportements en plus de la spec, validés par Karim** :
  - `^{commit}` : un préfixe partagé par un commit et un autre objet désigne
    ce commit ;
  - les liens `…/commits/<sha>` des PR sont acceptés, comme `…/commit/<sha>`.
- **Le lien de job de CI reste accepté sans vérification**, comme le demande
  le ticket. C'est une limite connue, voir « Pour aller plus loin ».

## Difficultés rencontrées

- **Le premier rouge n'était pas un rouge de comportement.**
  - Symptôme : les deux tests des cas réels ont échoué parce que
    `resolveShaWithGit` n'existait pas encore.
  - Cause : ils appellent la résolution pour dire si le commit est joignable
    localement.
  - Résolution : ils sont passés au vert avec l'implémentation, et
    `6253696` comme `bcccdea` y sont résolus en `commit`.
- **Les tests d'ambiguïté écrits après le code.**
  - Symptôme : ils ont réussi du premier coup.
  - Cause : la résolution par Git avait été écrite avant eux.
  - Résolution : à la demande de Karim, deux défauts introduits à la main sur
    `bd3c0d4`, à la ligne du décompte des commits de `resolveShaWithGit`, puis
    annulés (`git checkout -- scripts/test-plan-evidence.ts`) :
    - compter tous les objets du préfixe (`filter(Boolean)`) fait échouer
      « tells a commit, a prefix shared by two commits and a prefix shared by
      no commit apart » : `Expected: "missing"`, `Received: "ambiguous"`,
      `Tests  1 failed | 27 passed (28)` ;
    - ne jamais répondre `ambiguous` fait échouer le même test :
      `Expected: "ambiguous"`, `Received: "missing"`, `Tests  1 failed | 27
      passed (28)`.

    Après chaque retrait : `Tests  28 passed (28)`.
- **`^{commit}` lève l'ambiguïté entre types.**
  - Symptôme : `git rev-parse --verify --quiet 00cd^{commit}` réussit dans ce
    dépôt, alors que `LC_ALL=C git rev-parse --verify 00cd` répond « short object ID
    00cd is ambiguous » (un commit et un arbre).
  - Cause : le suffixe demande un commit, et un seul objet du préfixe en est
    un.
  - Résolution : gardé, et écrit dans l'en-tête du module.
- **Un fichier et un arbre comptaient pour une ambiguïté** (relevé par la
  revue de la spec).
  - Symptôme : le préfixe `0210` (un fichier et un arbre de ce dépôt, aucun
    commit) aurait été déclaré « ambigu ».
  - Cause : la première version comptait toutes les lignes de
    `--disambiguate`.
  - Résolution : `git cat-file --batch-check=%(objecttype)` et ne compter que
    les commits (`3296a52`).
- **Des tests qui dépendaient de l'état du dépôt.**
  - Symptôme : les premiers tests de cette correction utilisaient `00cd` et
    `0210` du vrai dépôt.
  - Cause : un futur commit qui commence par l'un de ces préfixes aurait
    changé leur résultat.
  - Résolution : un dépôt fabriqué avec `git fast-import`, aux SHA fixes. Les
    préfixes partagés y sont cherchés à l'exécution.
- **Le contrôle pouvait tourner sans les têtes de PR** (revue de la spec).
  - Symptôme : avec `if: !cancelled()`, le contrôle tournait même si
    `npm run fetch:pull-heads` avait échoué.
  - Cause : un commit cité qui n'est joignable que par une tête de PR y
    aurait été annoncé comme inexistant.
  - Résolution : la condition `steps.pull-heads.outcome == 'success'`.
- **Le mot « candidat » employé dans un autre sens** (revue des normes).
  - Symptôme : le code appelait « candidat » un jeton qui pourrait être un
    SHA.
  - Cause : `PROTOCOL.md` réserve « candidat » à une version migrée produite
    par un outil.
  - Résolution : « SHA cité », `CITED_SHA`, `citedShas`.
- **La règle « un SHA qui existe suffit » refusée par Karim.**
  - Symptôme : la ligne `- [x] 143 tests, commit 1111111 puis `6253696`, [CI](…)`
    passait.
  - Cause : la ligne était acceptée dès qu'un SHA désignait un commit, ou dès
    qu'il y avait un lien de job de CI.
  - Résolution : le test « refuses the line when one of its SHAs names no
    commit, and names that SHA » a d'abord été rouge (`Tests  1 failed | 27
    passed (28)`), puis vert après le correctif (`bd3c0d4`).

- **Un test du script oublié, vu seulement par la CI.**
  - Symptôme : le job `tests` de la PR a échoué
    ([exécution 45417193370](https://github.com/karAmmi12/migrabench/actions/runs/45417193370),
    tête `3040146`) : `tests/check-test-plan-evidence.test.ts`, « fails with
    one ::error:: annotation per uncited line, copying the line »,
    `Tests  1 failed | 551 passed (552)`.
  - Cause : ce test attendait l'ancien texte de l'annotation (« Case cochée
    chiffrée sans état … »). Seuls les deux fichiers de test de
    `test-plan-evidence.ts` et de `pr-body.ts` avaient été lancés en local, et
    la recherche des appelants avait porté sur `uncitedLines`, que ce test
    n'appelle pas : il lance le script.
  - Résolution : le test attend la raison dans chaque annotation, avec une
    ligne de plus au commit inexistant `deadbeef` (`58403da`).

## Vérifier soi-même

```sh
npx vitest run tests/check-test-plan-evidence.test.ts tests/test-plan-evidence.test.ts tests/pr-body.test.ts
```

Observé sur `58403da` : `Test Files  3 passed (3)`, `Tests  35 passed (35)`.
Les deux cas réels exigent les têtes de PR : sinon le test le dit et demande
`npm run fetch:pull-heads`.

```sh
npm run typecheck
```

Observé sur `bd3c0d4` : `tsc --noEmit` sans erreur.

```sh
PR_BODY='- [x] Tests sans pile, verts sur `6253696` : 27 tests.
- [x] 143 tests, commit `deadbeef`
- [x] 143 tests, commit 1111111 puis `6253696`' node scripts/check-test-plan-evidence.ts; echo "exit $?"
```

Observé sur `bd3c0d4` :

```text
::error::Case cochée chiffrée refusée, deadbeef : ce commit n'existe pas dans le dépôt : - [x] 143 tests, commit `deadbeef`
::error::Case cochée chiffrée refusée, 1111111 : ce commit n'existe pas dans le dépôt : - [x] 143 tests, commit 1111111 puis `6253696`
exit 1
```

La première ligne, qui cite `6253696` seul, passe.

**Sur la CI de la PR** (workflow « Fiche de formation », job `fiche-ticket`) :
[exécution 45417886204](https://github.com/karAmmi12/migrabench/actions/runs/45417886204),
tête `58403da`, 14 s (`startedAt` 14:46:42, `updatedAt` 14:46:56). Le pas
« Récupération des têtes de PR » réussit et récupère les `refs/pull/*/head`.
Puis le contrôle accepte le plan de test de sa propre PR :

```text
Chaque case cochée chiffrée cite un état.
```

**Sur la CI de la PR** (workflow « Tests du banc », job `tests`, avec la
pile) : [exécution 45417886312](https://github.com/karAmmi12/migrabench/actions/runs/45417886312),
tête `58403da` :

```text
✓  default  tests/test-plan-evidence.test.ts (28 tests)
✓  default  tests/check-test-plan-evidence.test.ts (3 tests)
✓  default  tests/pr-body.test.ts (4 tests)
Test Files  62 passed (62)
     Tests  552 passed (552)
```

Les deux cas réels, `6253696` et `bcccdea`, y sont donc joignables : le job
récupère l'historique complet et les têtes de PR.

## Pour aller plus loin

- **Limite connue, le lien de job de CI n'est pas vérifié** : une case qui ne
  cite qu'un lien `actions/runs/<id>` est acceptée, même si cette exécution
  n'existe pas. Vérifier par l'API GitHub que l'exécution existe est proposé
  dans un commentaire de #97, « Provenance des mesures comptées ».
- **#97** : la même question de provenance pour les mesures comptées.
- Fiche [`54-controle-preuves-plan-test.md`](54-controle-preuves-plan-test.md) :
  la première version du contrôle, et l'origine de `stripCode`.
