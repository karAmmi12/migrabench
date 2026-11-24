# #73 · Étape 3 · Mesure prévue pour compter (--counted) et contrôle de measure.json versionné

## Objectif

Jusqu'ici, `migrabench measure` ne produisait que des mesures de diagnostic,
écrites sous `results/diagnostic/`, ignoré par Git. Ce ticket ajoute la mesure
prévue pour compter, avec `--counted`. Elle est refusée avant toute action si
elle ne part pas d'un état publié, et elle est écrite sous `results/counted/`,
pour être versionnée. Le contrôle des résultats versionnés de #53 s'étend à son
`measure.json` et à son `oracle.json`.

## Notions à connaître

- **Ascendance d'un commit** : `git merge-base --is-ancestor A B` réussit si
  `A` est `B` ou l'un de ses ancêtres. C'est ce qui dit si `HEAD` est
  « atteignable depuis `origin/main` », et si le commit du banc d'une mesure
  est dans l'historique de `originMain`. Il faut l'historique complet : dans
  un clone superficiel, les ancêtres manquent. —
  [git-merge-base, --is-ancestor](https://git-scm.com/docs/git-merge-base#Documentation/git-merge-base.txt---is-ancestor)
- **Refspec de `git fetch`** : `+refs/heads/main:refs/remotes/origin/main`
  récupère la branche `main` du dépôt distant dans la référence locale
  `origin/main`. Le runner fait ce `fetch` lui-même, pour ne pas juger sur une
  copie périmée (récit 13). —
  [git-fetch, &lt;refspec&gt;](https://git-scm.com/docs/git-fetch#Documentation/git-fetch.txt-refspec)
- **Dépôt nu (`--bare`)** : un dépôt sans arbre de travail, qui sert de dépôt
  distant. Les tests en créent un dans un dossier temporaire et en font
  l'`origin` d'un clone. Le `fetch` reste alors sur la machine : ni réseau, ni
  références du dépôt du banc touchées. —
  [git-init, --bare](https://git-scm.com/docs/git-init#Documentation/git-init.txt---bare)
- **Test sauté de Vitest** : `it.skip` déclare un test sans le lancer. Le
  rapport le liste comme sauté, avec son nom. Le test des mesures versionnées
  s'en sert pour dire que `results/counted/` est vide, au lieu de passer en
  silence. — [Vitest, test.skip](https://vitest.dev/api/test#test-skip)

Liens ouverts le 2026-11-24 (`curl`) : chaque page répond `200`, et les ancres
`Documentation/git-merge-base.txt---is-ancestor`,
`Documentation/git-fetch.txt-refspec`, `Documentation/git-init.txt---bare` et
`test-skip` existent.

## Ce qui a été construit

- **`runner/counted.ts`** : `countedPreconditions(facts)`, fonction pure. Elle
  rend `{ ok: true, originMain }`, ou toutes les conditions manquantes dans un
  seul message :
  - arbre de travail modifié ;
  - `origin/main` non récupéré ;
  - `HEAD` non atteignable depuis `origin/main` ;
  - sel imposé (`ORACLE_SALT`) ;
  - plafond des délais imposé (`--timeout-cap-ms`) ;
  - aucun étalonnage versionné.
- **`runner/counted-facts.ts`** : `countedGitFacts(cwd)` relève les faits Git :
  état de l'arbre de travail, `git fetch` de `origin/main`, ascendance de
  `HEAD`.
- **`runner/measure.ts`** et **`runner/cli.ts`** : `migrabench measure
  --counted`.
  - Le refus `refused-counted` (code `4`) vient après les refus d'options et
    avant le verrou du banc.
  - Une mesure acceptée est écrite sous `results/counted/<identifiant>/`.
  - `measure.json` porte `counted: true` et `originMain`
    (`runner/measure-record.ts`).
- **`oracle/worktree.ts`** : un nouveau fichier non suivi sous
  `results/counted/` laisse l'arbre de travail propre, comme un nouveau
  résultat sous `results/oracle/`. **`shared/root.ts`** porte le nom du
  dossier.
- **`oracle/result-check.ts`** : `checkMeasureResult`, le contrôle d'un
  `measure.json` versionné. Il reprend les règles de #53 et ajoute :
  - `counted: true` ;
  - `originMain` connu ;
  - `benchCommit` égal à `originMain` ou ancêtre de lui ;
  - empreinte de `oracle.json` conforme.

  `oracle/repository.ts` fournit l'environnement : `measureEnvironment`, avec
  l'ascendance.
- **`oracle/execute.ts`** : il accepte un `saltImposed` explicite, que la
  mesure lui passe (voir « Difficultés »).
- **`tests/runner/versioned-measures.test.ts`** : chaque dossier de
  `results/counted/` passe le contrôle : son `measure.json`, et son
  `oracle.json` au contrôle de #53. Un dossier sans `measure.json` est un
  manquement.
  - Le même chemin est éprouvé sur des fixtures
    (`tests/fixtures/counted-measures/`) : une mesure valide qui doit passer,
    et trois variantes qui doivent échouer (empreinte fausse, `oracle.json` au
    sel imposé, dossier sans `measure.json`).
  - Tant que `results/counted/` est vide, le test sauté « 0 versioned measure
    in results/counted/: check not evaluable » le dit.
- **Tests** : `tests/runner/counted-preconditions.test.ts`,
  `tests/runner/counted-facts.test.ts`, `tests/runner/counted-measure.test.ts`
  (de bout en bout), `tests/oracle/measure-check.test.ts`, et
  `tests/oracle/worktree.test.ts` complété.
- **Spec de l'étape 3** : `results/counted/` remplace « un dossier versionné »,
  et un `fetch` manqué est la seule condition d'atteignabilité nommée.

## Les choix faits et pourquoi

- **Quatre points de test, validés par Karim.**
  - Préconditions pures.
  - Faits Git sur un dépôt temporaire dont `origin` est un dépôt nu local.
  - Refus de bout en bout.
  - Contrôle de `measure.json`.
- **Le test de bout en bout tourne dans une copie du banc**, correction de
  Karim. Un vrai `git fetch` vers le vrai `origin` aurait modifié
  `origin/main` de sa copie de travail pendant les tests, et dépendu du
  réseau. La copie reprend les fichiers de l'arbre de travail, puis devient un
  dépôt dont `origin` est un dépôt nu local. La commande réelle tourne dedans,
  avec un faux `docker` et un verrou du banc temporaire. Le test vérifie aussi
  que le refus liste toutes les conditions, pas seulement le sel.
- **Test en process de `refused-usage.test.ts` retiré.** Il appelait
  `measureCandidate({ counted: true })` dans le vrai dépôt, ce qui aurait lancé
  un vrai `fetch`. Ce qu'il couvrait, un plafond des délais refusé avec
  `--counted`, l'est par les préconditions et par le test de bout en bout.
- **`results/counted/`**, choix de Karim parmi deux noms. Le nom dit pourquoi
  le dossier est versionné ; une mesure de diagnostic n'y va pas.
- **Fixtures et test sauté nommé**, ajout de Karim. Le dossier versionné est
  vide aujourd'hui : sans fixtures, le test des mesures versionnées serait vert
  sans rien vérifier.
- **`oracle.json` passe aussi le contrôle de #53**, décision de Karim après la
  relecture. L'empreinte prouve qu'il n'a pas changé, pas qu'il est sain.
- **L'exception de l'arbre propre reste étroite**, confirmée par Karim. Seul un
  nouveau fichier non suivi sous `results/counted/` est toléré. Un fichier
  suivi modifié sous `results/counted/`, ou un fichier non suivi ailleurs,
  rend l'arbre modifié. Sans l'exception, une deuxième mesure prévue pour
  compter, dans le même job de CI, serait refusée à cause du dossier de la
  première.
- **Un `fetch` manqué ne nomme que lui-même.** Sans `origin/main`,
  l'ascendance de `HEAD` ne se vérifie pas : la nommer aussi serait affirmer
  un fait non vérifié.
- **« Écrit à la main » reste un critère faible**, décision de Karim : il ne
  sera pas renforcé dans ce ticket (voir #97).

## Difficultés rencontrées

- **Tous les `oracle.json` de mesure disaient `saltImposed: true`.**
  - Symptôme : passé au contrôle de #53, le vrai `oracle.json` de la mesure
    `results/diagnostic/20261124T133844Z-40649ac-reference-candidate`, lancée
    sans `ORACLE_SALT`, rend `[{"rule":"saltImposed","detail":"true, expected
    false"}]`.
  - Cause : `executeOracle` (`oracle/execute.ts`) prend tout sel donné pour un
    sel imposé (`salt !== undefined`). Or la mesure lui donne toujours le sien,
    tiré par elle. Le défaut existait avant #73. Le contrôle de `oracle.json`
    demandé dans ce ticket le rend bloquant : aucune vraie mesure comptée ne
    l'aurait passé.
  - Résolution : `71d8c18`. `executeOracle` accepte un `saltImposed`
    explicite, et la mesure lui passe celui de l'opérateur. Aucun test Vitest
    ne couvre ce point, car `executeOracle` exige la pile. La preuve est une
    vraie mesure, au commit `e11f402` (voir « Vérifier soi-même »).
- **Un défaut du test du contrôle de `measure.json`.**
  - Symptôme : deux échecs, dont `expected [] to deeply equal [ 'oracle' ]`
    pour « refuses a measure that cites an oracle.json that is missing ».
  - Cause : le paramètre par défaut de l'aide `rules()` remplaçait le
    `undefined` passé exprès par l'empreinte par défaut.
  - Résolution : l'aide prend `{ digest }`. 15 tests verts ensuite.
- **Le test du dossier sans `measure.json` n'a pas été rouge d'abord.**
  - Symptôme : relevé à la relecture, il passait dès son écriture.
  - Cause : sa règle vit dans le même fichier de test que lui.
  - Résolution : une mutation temporaire, qui retire la règle, le fait
    échouer (`ENOENT … no-measure-json/measure.json`).
- **Les tests de l'exception étroite n'ont pas été rouges d'abord.**
  - Cause : ils décrivent un comportement déjà en place.
  - Résolution : une mutation temporaire (préfixe sans `/` final) fait échouer
    deux tests.
- **Relecture : vocabulaire et chiffres.**
  - « Témoin » est réservé à la valeur témoin, et « run » est un mot du
    vocabulaire : remplacés.
  - Les fixtures portaient des chiffres de forme « 38 réussis » qu'aucun run
    n'avait produits : retirés.
  - La CLI annonçait une mesure « versioned » alors qu'elle est seulement
    écrite : corrigé.

## Vérifier soi-même

Les tests propres au ticket, sans la pile :

```sh
npx vitest run tests/runner/counted-preconditions.test.ts tests/runner/counted-facts.test.ts tests/runner/counted-measure.test.ts tests/runner/measure-record.test.ts tests/oracle/measure-check.test.ts tests/runner/versioned-measures.test.ts
```

Observé sur `fcc8023` pour cet ensemble : `Tests  43 passed | 1 skipped (44)`.
Le test des fixtures a gagné un test au commit `973a513`.

Le test sauté, avec son nom :

```sh
npx vitest run tests/runner/versioned-measures.test.ts --reporter=verbose
```

Observé sur `8a0e833` : `↓ … versioned measures planned to count > 0
versioned measure in results/counted/: check not evaluable`.

La suite complète, après `npm run stack:up` :

```sh
npm test
```

Observé sur `e11f402` : `Test Files  65 passed (65)`,
`Tests  540 passed | 1 skipped (541)`.

Une vraie mesure de diagnostic, avec Docker, sur un arbre propre :

```sh
npm run migrabench -- measure --candidate fixtures/reference-candidate
```

Observé sur `e11f402` : `Outcome: completed (ok)`, `Diagnostic measure.`
Son `oracle.json` porte `"saltImposed":false`, et le contrôle de #53 rend `[]`.
`measure.json` donne 38 scénarios, 38 réussis.

> À vérifier après l'exécution de la CI de la PR : lien de l'exécution
> « Tests du banc », head SHA, nombre de fichiers et de tests du job `tests`.

## Pour aller plus loin

- **#74** : la mesure comptée du candidat de référence en CI, critère de fin
  de l'étape. Son job doit cloner l'historique complet (`fetch-depth: 0`),
  exigence ajoutée en commentaire de #74.
- **#97** (`needs-triage`) : provenance des mesures comptées, à trancher à la
  clôture de l'étape.
- **#71** : interruption d'une mesure. Le dossier d'une mesure comptée
  interrompue reste aujourd'hui sans `measure.json` ; le contrôle le signale.
- Fiche [`53-controle-resultats-oracle-versionnes.md`](53-controle-resultats-oracle-versionnes.md) :
  le contrôle des résultats de l'oracle versionnés, dont les règles sont
  reprises ici.
