# #63 · Étape 3 · Verdict, codes de sortie et candidat jamais disponible

## Objectif

Le fil traceur (#62) savait mesurer un candidat. Il ne savait pas encore
classer une mesure : les issues de phase y étaient des chaînes libres, et
toute issue inconnue faisait planter le runner. Ce ticket donne au banc la
**seule définition de « invalide »**. C'est le verdict, une fonction pure qui
range chaque mesure dans une catégorie et en tire le code de sortie : `0`
pour une mesure valide, `3` pour une mesure invalide, `4` quand aucune mesure
n'est écrite. Il ajoute aussi le cas d'un candidat qui ne devient jamais
disponible, avec un résultat explicite « oracle non lancé ».

## Notions à connaître

- **Unions de littéraux et `as const`** : `["ok", "build-failed"] as const`
  garde chaque chaîne comme un type littéral. `(typeof T)[number]` en tire
  l'union des valeurs. On obtient ainsi une liste vérifiable à l'exécution et
  un type fermé, issus d'une seule déclaration. —
  [TypeScript Handbook : Literal Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types)
- **Types mappés indexés** : `{ [N in PhaseName]: … }[PhaseName]` construit
  une union discriminée, avec une forme d'enregistrement par phase. Ici,
  chaque phase n'accepte que ses propres issues. —
  [TypeScript Handbook : Mapped Types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html)
- **Opérateur `satisfies`** : il vérifie qu'une valeur respecte un type sans
  élargir le type déduit. `PHASE_OUTCOMES` garde ses littéraux, mais ne peut
  citer que des issues connues. —
  [TypeScript 4.9 : The satisfies Operator](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator)
- **Types conditionnels, `Exclude` et `never`** :
  `[Exclude<A, B>] extends [never] ? true : never` ne compile que si chaque
  membre de `A` est dans `B`. Le verdict s'en sert pour exiger que chaque
  issue d'échec soit produite par au moins une phase. —
  [TypeScript Handbook : Conditional Types](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html)
- **`playwright test --list`** : liste les tests sans les exécuter. Avec le
  reporter JSON de la configuration de l'oracle, il écrit un rapport dont les
  tests n'ont aucun résultat. —
  [Playwright : Command line, option `--list`](https://playwright.dev/docs/test-cli)
- **`util.parseArgs` en mode strict** : une option inconnue lève une
  exception (`ERR_PARSE_ARGS_UNKNOWN_OPTION`). Si personne ne l'attrape, Node
  sort avec le code `1`. —
  [Node.js 22 : util.parseArgs](https://nodejs.org/docs/latest-v22.x/api/util.html#utilparseargsconfig)
- **Code de sortie de Node** : une exception non attrapée donne `1` ;
  `process.exit(n)` et `process.exitCode` fixent le code. —
  [Node.js 22 : Process, exit codes](https://nodejs.org/docs/latest-v22.x/api/process.html#exit-codes)

## Ce qui a été construit

- `runner/verdict.ts`, le **verdict** :
  - `PHASES` et `PHASE_OUTCOMES` : le type fermé des issues de chaque phase,
    pris dans le tableau de la spec, plus `not-run` ;
  - `INVALIDITY_CAUSES` : la liste fermée du glossaire. La catégorie
    `invalid` ne reçoit qu'elle ;
  - `verdict(phases)` : rend `{ verdict: { category, reason, evidence? },
    exitCode }`. Il refuse une issue inconnue, une issue que sa phase ne peut
    pas produire, et une mesure invalide sans preuve. La preuve est le
    `detail` de la phase qui décide.
- `runner/measure-record.ts` : `measureRecord` s'appuie sur le verdict et rend
  `{ record, exitCode }`. Un oracle non lancé s'enregistre avec son compte de
  scénarios (`{ executed: false, summary }`).
- `runner/measure.ts` :
  - refus préalable : un dossier absent, ou hors de `candidates/` et
    `fixtures/`, rend `refused-usage` et le code `4`, avant toute écriture ;
  - une fermeture typée par phase, qui n'accepte que les issues de sa phase ;
  - `oracle-error` porte en `detail` les messages d'erreur de Playwright ;
  - un oracle non lancé est compté par `listOracle`.
- `runner/cli.ts` : une option invalide ou un refus rendent le code `4`, avec
  `refused-usage: <raison>` sur la sortie d'erreur.
- `runner/measure-id.ts` : `candidateName` est exporté, pour le refus
  préalable.
- `oracle/collect.ts` : `unreachedSummary` compte chaque scénario listé comme
  non atteint.
- `oracle/execute.ts` :
  - `listOracle` lance `playwright test --list` sans toucher à la pile ;
  - `executeOracle` rend aussi `errorMessages`.
- `fixtures/defective-candidates/never-ready/` : le **candidat défectueux 4**.
  C'est une copie du candidat de référence dont `server.js` tourne sans
  jamais écouter sur `PORT`.
- Tests :
  - `tests/runner/verdict.test.ts` : chaque issue vers sa catégorie et son
    code, et les refus ;
  - `tests/runner/refused-usage.test.ts` : la vraie CLI, code `4`, rien
    d'écrit ;
  - `tests/oracle/collect.test.ts` : le résumé d'un oracle non lancé ;
  - `tests/runner/measure-record.test.ts` : mis à jour.
- `docs/specs/03-candidate-runner.md` : le tableau des issues, la règle de
  classement et la clôture, corrigés à la demande de l'humain.

## Les choix faits et pourquoi

- **Les issues rangées par catégorie, la liste fermée en bloc.** `FAILURES`
  donne à la catégorie `invalid` exactement `INVALIDITY_CAUSES`. Une issue
  ajoutée ailleurs ne peut donc pas rendre une mesure invalide par mégarde.
  L'option écartée était une table issue → catégorie écrite à la main, où
  une erreur de saisie passerait inaperçue. C'est la demande du commentaire
  sur #63 : la liste fermée est un sous-ensemble vérifié par le compilateur.
- **Une mesure invalide exige sa preuve.** Sans `detail`, le verdict lève une
  erreur et la commande plante (code `1`). La spec (user story 40) veut une
  preuve pour chaque cause. L'humain a confirmé que ce plantage est correct.
- **La preuve vient du `detail` de la phase.** Première version : un champ
  `evidence` dans chaque phase. La relecture de la spec l'a écarté, parce que
  `measure.json` ne le prévoit pas pour une phase (`62cf0bb`).
- **Règle de classement : la première issue autre que `ok` décide, seule
  l'interruption passe devant.** Ce choix est confirmé par l'humain et écrit
  dans la spec (`542d902`). Raison : un incident du banc postérieur à l'échec
  du candidat ne peut pas en être la cause. Invalider la mesure offrirait au
  candidat une seconde chance, contraire à la règle 7.
- **Le tableau des issues élargi, sauf pour les portes.**
  - `stack-down-while-candidate` est accepté à partir de la construction : une
    erreur du runner après `npm ci` y est comptée comme une panne.
  - `interrupted` est accepté dans toutes les autres phases.
  - Les portes, vides à l'étape 3, n'ont que `ok` et `not-run`. Première
    version : les portes acceptaient aussi les deux issues. L'humain a tranché
    (`4c5c2e1`).
- **La clôture tourne toujours** et s'enregistre `ok` après un échec du
  candidat : il faut toujours l'arrêter. C'est précisé dans la spec à la
  demande de l'humain.
- **Le compte des scénarios vient de Playwright, pas d'une constante.** La
  règle « Les chiffres viennent de mesures » interdit d'écrire 38 dans le
  code. `playwright test --list` donne le compte de la version courante de
  l'oracle.
- **Un dossier hors de `candidates/` et `fixtures/` est un refus d'usage.**
  `measureId` le refusait déjà, mais par une exception (code `1`). Ce n'est
  pas nommé par la spec ; la relecture l'a relevé comme raisonnable.
- **`start-exited` prouvé par un candidat temporaire, pas une fixture.** La
  spec liste sept candidats défectueux et n'en prévoit aucun pour
  `start-exited`. Un dossier `candidates/probe-start-exited` (`start:
  "exit 0"`), non versionné, a servi le temps d'une mesure, puis a été
  supprimé. Option écartée : `.probes/`, que `measureId` refuse.
- **Seam 1 (vraie pile) vérifié à la main, pas dans `npm test`.** Une mesure
  change le sel de la pile sous les autres tests. Le passage en CI appartient
  à #74.
- **Relecture en deux axes**, standards et spec. Corrigé :
  - la raison du verdict est une issue fermée ;
  - le refus d'usage n'est plus écrit qu'à un endroit ;
  - les tests couvrent `stack-down-while-candidate` et `interrupted` dans
    chaque phase qui les accepte.

  Laissé : le champ `outcome` de `MeasureResult`, que l'interface de la spec
  nomme ainsi.
- **Un échec de `playwright --list` plante (code `1`).** L'humain l'a jugé
  correct. Un commentaire sur #68 demande si cette erreur doit être rangée
  dans une mesure.

## Difficultés rencontrées

- **Une option inconnue rendait `1`, pas `4`.**
  - Symptôme : le premier test de `refused-usage.test.ts`, rouge, attendait
    `status: 4` et recevait `status: 1`, y compris pour `--bogus`.
  - Cause : `parseArgs` en mode strict lève une exception que la CLI
    n'attrapait pas.
  - Résolution : `parseArgs` est entouré d'un `try`, et l'erreur devient un
    refus d'usage.
- **`measureId` faisait planter un dossier hors de `candidates/`.**
  - Symptôme : le test « refuses a candidate directory outside candidates/
    and fixtures/ », rouge, recevait `status: 1`.
  - Cause : `candidateName` levait une exception pendant la préparation.
  - Résolution : `candidateName` est appelé dans les refus préalables.
- **Une fermeture de phase partagée ne se typait plus.**
  - Symptôme : `error TS2322: Type '(outcome?: PhaseOutcome<"gates">, …) =>
    void' is not assignable to type '(outcome?:
    PhaseOutcome<"preparation">, …) => void'`.
  - Cause : la variable `let done` resservait d'une phase à l'autre. Avec des
    issues propres à chaque phase, son type ne convenait plus qu'à la
    première.
  - Résolution : une fermeture par phase (`closePreparation`, `closeStart`…).
- **La raison du verdict ne se réduisait pas.**
  - Symptôme : `Type '"not-run"' is not assignable to type …` sur
    `reason`.
  - Cause : `Array.find` ne réduit pas le type de l'issue trouvée.
  - Résolution : une conversion explicite, commentée, après le contrôle de la
    phase.
- **Les tests de refus écrits après le code.** Ils passaient d'emblée. Je les
  ai rendus rouges par une mutation temporaire du verdict (contrôles
  désactivés). Trois tests sont devenus rouges, puis le code a été restauré.

## Vérifier soi-même

Sorties observées au commit `542d902`, arbre propre (sauf mention), avec
Node 22.23.5, Docker Engine 29.1.3 et Compose 2.40.3-desktop.1, sous macOS.

Refus préalables, sans Docker :

```sh
node runner/cli.ts measure --candidate fixtures/no-such-candidate; echo "exit=$?"
# refused-usage: The candidate directory does not exist: fixtures/no-such-candidate
# Usage: migrabench measure --candidate <directory>
# exit=4
node runner/cli.ts measure --candidate runner; echo "exit=$?"
# refused-usage: The candidate must be a directory under candidates/ or fixtures/: runner
# exit=4
```

Le candidat défectueux 4 :

```sh
npm run migrabench -- measure --candidate fixtures/defective-candidates/never-ready; echo "exit=$?"
# Measure: results/diagnostic/20261123T154416Z-542d902-defective-candidates-never-ready
# Outcome: candidate-failure (start-not-ready)
# exit=0
```

Son `measure.json` contient :

- phases : `preparation:ok contract:ok build:ok start:start-not-ready
  oracle:not-run gates:not-run closing:ok` ;
- `oracle` : `executed: false`, `scenarios: 38`, `unreached: 38`,
  `reachedPassRate: null` ;
- `verdict` : `{"category":"candidate-failure","reason":"start-not-ready"}`.

La phase `start` a duré 65 146 ms, sous le plafond provisoire de 60 s.

Un candidat dont `start` sort aussitôt :

```sh
mkdir -p candidates/probe-start-exited
cp fixtures/defective-candidates/never-ready/package*.json candidates/probe-start-exited/
printf '{\n  "contract": 1,\n  "start": "exit 0"\n}\n' > candidates/probe-start-exited/candidate.json
npm run migrabench -- measure --candidate candidates/probe-start-exited; echo "exit=$?"
rm -rf candidates
# Measure: results/diagnostic/20261123T154538Z-542d902-probe-start-exited
# Outcome: candidate-failure (start-exited)
# exit=0
```

Le résultat :

- phases : `start:start-exited`, puis `oracle` et `gates` en `not-run`,
  `closing:ok` ;
- `oracle.executed: false`, 38 non atteints ;
- `worktree: dirty`, à cause du seul dossier temporaire.

Non-régression, le candidat de référence :

```sh
npm run migrabench -- measure --candidate fixtures/reference-candidate; echo "exit=$?"
# Measure: results/diagnostic/20261123T154524Z-542d902-reference-candidate
# Outcome: completed (ok)
# exit=0
```

Toutes les phases sont `ok`, avec `scenarios: 38, passed: 38, unreached: 0`.

Les tests, après `npm run stack:up` :

```sh
npx vitest run tests/runner tests/oracle/collect.test.ts
#  Test Files  9 passed (9)
#       Tests  88 passed (88)
npm test
#  Test Files  45 passed (45)
#       Tests  326 passed (326)
npm run typecheck   # aucune erreur
```

En CI, la PR rejoue les tests du banc et l'oracle contre le legacy. Aucun
job ne lance encore `migrabench measure` (#74).

CI de la PR #77, sur le head SHA `c757c90` : tous les jobs sont verts.

- « Tests du banc » ([job](https://github.com/karAmmi12/migrabench/actions/runs/45209282163/job/137813374418), 8 min 29 s) :
  `Test Files  45 passed (45)`, `Tests  326 passed (326)`.
- « Oracle », job `oracle` ([job](https://github.com/karAmmi12/migrabench/actions/runs/45209281838/job/137813374932), 2 min 23 s) :
  `Scenarios: 38, passed: 38, failed: 0, unreached: 0`.
- « Oracle », job `proof` ([job](https://github.com/karAmmi12/migrabench/actions/runs/45209281838/job/137814949001), 5 min 50 s) :
  cinq exécutions complètes à `Scenarios: 38, passed: 38, failed: 0, unreached: 0`, puis `Proof holds on 5 results.`
  L'exécution « Oracle » (les deux jobs) a duré de 15:48:08Z à 15:56:25Z.
- « Vérification des types » ([job](https://github.com/karAmmi12/migrabench/actions/runs/45209282032/job/137813373534), 11 s) : vert.
- « Fiche de formation » ([job](https://github.com/karAmmi12/migrabench/actions/runs/45211046206/job/137819624972), 17 s) :
  `Fiche trouvée pour #63.` et `Chaque case cochée chiffrée cite un état.`
  Cette exécution est la dernière : elle a été relancée après la
  modification de la description de la PR.

## Pour aller plus loin

- **#68, pannes de la pile et erreurs du runner** : produire
  `stack-failed-before-candidate`, `stack-down-while-candidate` et
  `runner-error-before-candidate`. Il faut aussi décider du sort d'un échec
  de `playwright --list` (commentaire sur #68).
- **#71, mesure interrompue** : produire `interrupted`. Le verdict le fait
  déjà passer devant toute autre issue.
- **#65 et #67** : `build-timeout`, `build-resource-limit`,
  `registry-network-error`, puis `access-log-inactive` et
  `marker-out-of-place`. Le verdict les range déjà ; aucune phase ne les
  produit encore.
- **#74, critère de fin** : les candidats défectueux mesurés en CI. C'est là
  que la preuve à la main de ce ticket devient automatique.
