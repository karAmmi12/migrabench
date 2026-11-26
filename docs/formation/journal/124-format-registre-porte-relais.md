# #124 · Étape 4 · Fil traceur : format des résultats, registre des portes et porte du relais

## Objectif

Jusqu'ici, une mesure s'arrêtait à l'oracle : sa phase `gates` était vide.
Ce ticket pose ce que toutes les portes de l'étape 4 vont partager :

- un format commun des résultats (ADR 0008) ;
- un registre qui lance les portes dans un ordre fixe, avec un contexte
  fourni par le runner ;
- la règle qui rend une mesure invalide quand une porte plante avant
  d'examiner le candidat.

Il le prouve par une première vraie porte, la porte du relais. Elle vérifie
qu'un candidat ne touche jamais le port `8080` du legacy, en lisant le
journal d'accès de la mesure.

## Notions à connaître

- **Résultat jugé et résultat relevé** : une porte rend des résultats nommés.
  Un résultat jugé finit `passed`, `failed`, `not-evaluable` ou `errored`.
  Un résultat relevé rapporte des valeurs sans critère de réussite : il finit
  `measured`, `not-evaluable` ou `errored`. Un résultat qui n'a rien examiné
  (`examined: 0`) est non évaluable, jamais réussi. —
  `docs/adr/0008-resultats-des-portes.md`, `GLOSSARY.md` (« Non évaluable »,
  « Résultat relevé », « Porte en erreur »).
- **`@ts-expect-error`** : ce commentaire exige une erreur de type à la ligne
  suivante. Si la ligne compile, c'est la directive elle-même qui devient une
  erreur (TS2578). Un test peut donc prouver qu'un appel est refusé par le
  compilateur, ici `gateResultPassed` appelé sur un résultat relevé. —
  [TypeScript 3.9, `// @ts-expect-error` Comments](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html),
  [Vitest, Testing Types](https://vitest.dev/guide/testing-types)
- **`AbortController` et `AbortSignal`** : un objet qui annonce une
  annulation. Le registre passe un `signal` à chaque porte et l'interrompt à
  son délai, pour qu'une porte qui sait s'arrêter s'arrête. —
  [MDN, AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- **`%a` de la valve d'accès de Tomcat** : « Remote IP address », l'adresse
  source de la requête. C'est le troisième champ d'une ligne du journal
  d'accès du banc. La porte du relais s'en sert pour écarter le healthcheck
  (`0:0:0:0:0:0:0:1`). —
  [Tomcat 9, Access Logging](https://tomcat.apache.org/tomcat-9.0-doc/config/valve.html)

Liens ouverts le 2026-11-26 (`curl -L`) : chaque page répond `200`. La page de
TypeScript 3.9 cite `ts-expect-error`, et celle de la valve cite « Remote IP
address ».

## Ce qui a été construit

- **`gates/result.ts`** : le format d'un résultat.
  - `judged()`, `measured()` et `errored()` construisent un résultat ;
    `examined: 0` donne `not-evaluable`.
  - `findings` est borné à `FINDINGS_LIMIT` (50) ; `findingsTotal` et
    `findingsKept` disent si la liste est tronquée.
  - `gateResultPassed()` est la seule règle de réussite. Elle n'accepte qu'un
    résultat jugé.
  - `beforeCandidateEvidence()` construit la preuve d'une mesure invalide par
    une erreur de porte avant le candidat.
- **`gates/registry.ts`** : le registre.
  - Quatre groupes, dans l'ordre fixe de la spec : fichiers, navigateur en
    lecture, écritures, relais. `checkGateOrder` refuse un registre dans le
    désordre.
  - `runGates()` lance chaque porte : sa préparation (`prepare`), puis son
    examen (`examine`). Une erreur prend le `stage` de la partie qui l'a
    levée, et la cause `timeout`, `tool-missing` ou `exception`.
  - Il applique le délai de chaque porte et celui de la phase. Il laisse
    passer une panne de la pile (`StackIncident`). Il refuse des résultats
    qui ne correspondent pas aux résultats nommés déclarés par la porte.
- **`gates/context.ts`** : le contexte qu'une porte reçoit.
  - L'URL du candidat, son dossier remis et sa copie construite.
  - Le résultat de l'oracle et ses HAR, et le journal d'accès contrôlé
    (pour la clôture seulement).
  - Un client de l'API interne en lecture.
  - `restartLegacy()`, et le `signal` d'annulation.
- **`gates/relay.ts`** : la porte du relais.
  - `examineRelay()` lit les lignes de `start-1` à `end`. Toute ligne qui
    n'est ni une requête témoin ni le healthcheck est un constat.
- **`runner/verdict.ts`** : la nouvelle cause d'invalidité
  `gate-error-before-candidate`, et les nouvelles issues des phases `gates`
  et `closing`.
- **`runner/measure-record.ts`** : `gates[]` reçoit les résultats.
- **`runner/measure.ts`** : le branchement.
  - La phase `gates` construit le contexte et lance les portes du registre,
    candidat en marche. Elle relève l'état de la pile après chaque porte.
  - La clôture lance la porte du relais après la requête témoin `end`, si le
    journal est contrôlé `ok`.
  - `readyCandidate()` est extrait du rappel de l'oracle et réutilisé par
    `restartLegacy()`.
- **`shared/internal-api.ts`** : l'appel à l'API interne depuis `mb-internal`.
  Il a été déplacé hors de `tests/seam-a/internal-api-client.ts`, qui le
  réutilise en ajoutant le marqueur du Seam A.
- **Candidats et CI** :
  - `fixtures/conforming-candidates/relay-untouched/` : le premier candidat
    conforme du dépôt ;
  - `fixtures/defective-candidates/relay-forged-healthcheck/` : un candidat
    défectueux, défini plus bas ;
  - deux étapes ajoutées à `.github/workflows/measures.yml` ;
  - le champ `gates` des cas attendus dans `scripts/measure-cases.ts` ;
  - `fixtures/conforming-candidates/` ajouté au périmètre du job des
    mesures (`scripts/ci-scope.ts`).
- **Tests** (`tests/gates/`) :
  - `result.test.ts` : le format, les deux sortes et la troncature ;
  - `registry.test.ts` : l'ordre, `stage`, les causes, les délais et la porte
    de test à 0 élément ;
  - `relay.test.ts` : la porte sur le vrai journal de l'exécution
    45624689673 ;
  - `passed-rule.test.ts` : refuse toute comparaison de `outcome` à
    `"passed"` hors de `gates/result.ts`, avec ses témoins.
- **Spec** (`docs/specs/04-gates.md`) : le nom de la cause, la place du relais
  dans la clôture, et les précisions de G0.

## Les choix faits et pourquoi

- **Porte du relais dans la clôture.** La spec la place après la requête
  témoin `end`, envoyée dans la clôture, alors que la phase `gates` précède la
  clôture. Karim a choisi, parmi trois options :
  - **retenue** : la lancer dans la clôture, après le contrôle du journal.
    Son erreur `before-candidate` devient l'issue de la clôture. L'ordre des
    phases et la clôture de l'étape 3 ne changent pas ;
  - **écartée** : avancer `end` à la fin de la phase `gates`, ce qui change
    la clôture de l'étape 3 ;
  - **écartée** : déplacer la phase `gates` après la clôture, ce qui change
    l'ordre des phases et coûte un redémarrage.
- **Nom de la cause : `gate-error-before-candidate`.** La spec annonçait
  `gate-error`, « nom exact fixé par G0 ». Le suffixe suit les causes déjà
  là (`runner-error-before-candidate`, `stack-failed-before-candidate`) et
  dit pourquoi la mesure est invalide.
- **Délai de la phase dépassé : `errored`, `on-candidate`, `timeout`.**
  Confirmé par Karim. Le temps a été pris par l'examen des portes
  précédentes, que le candidat a pu ralentir. L'option `before-candidate`
  est écartée : elle laisserait un candidat lent faire invalider sa mesure
  (règle 7).
- **Candidat qui ne redémarre pas après `restartLegacy()` : échec du
  candidat.** Confirmé par Karim. Seule la pile qui ne redevient pas saine
  rend la mesure invalide. L'option « tout échec du redémarrage invalide la
  mesure » est écartée : un candidat échapperait à la mesure en ne
  redémarrant pas.
- **Candidats du relais qui coupent les connexions.** Les candidats conforme
  et défectueux répondent à la première requête, l'attente de disponibilité
  du runner, puis coupent chaque connexion suivante. Chaque scénario de
  l'oracle échoue ainsi dès l'ouverture de `BASE_URL`, au lieu d'attendre le
  délai de Playwright. L'option écartée est le candidat d'étalonnage comme
  candidat conforme : il sert une page qui ne contient pas les écrans,
  l'oracle y aurait attendu son délai à chaque scénario, sans compter
  `npm ci` et la construction Vite. En local, chaque mesure a pris une
  quinzaine de secondes (voir « Difficultés »).
- **Candidat défectueux qui imite le healthcheck.** Il appelle `8080` avec
  le User-Agent `curl/8.18.0`, relevé dans le vrai journal de l'exécution
  45624689673. Il montre que le healthcheck est écarté par son adresse
  source seulement.
- **Pas de portes après un oracle en échec.** Si la phase `oracle` finit par
  une pile tombée ou une erreur de l'oracle, la mesure est déjà décidée.
  Ni les portes ni le relais ne tournent sur une pile qui n'est plus sûre.
- **Résultats partiels gardés.** Une panne de la pile pendant une porte
  n'efface pas les résultats des portes déjà passées (option `results` de
  `runGates`). Point relevé par la revue « spec ».
- **`FINDINGS_LIMIT` à 50 et délai de phase à 30 min.** Ce sont des valeurs
  de conception, que la spec laisse ouvertes et que #100 étalonnera.
- **Preuve de `restartLegacy()` reportée à #131.** Confirmé par Karim :
  aucune porte ne l'appelle encore. Sa première preuve réelle viendra de la
  porte de rôle. L'option écartée est une porte de test injectable dans une
  mesure.

## Difficultés rencontrées

- **Mesure locale `stack-not-from-this-copy`.** La première mesure de
  diagnostic du candidat conforme a été invalide en 2 s : la pile en marche
  avait été construite depuis une autre copie du dépôt. Résolution :
  `npm run stack:up`, puis une nouvelle mesure, `completed`.
- **Pile cassée par un `| head -2`.** Deux mesures locales (candidat
  défectueux et candidat de référence) ont fini invalides en
  `stack-failed-before-candidate` (`docker compose up … exited with code
  255`).
  - Cause : la commande était lancée avec `| head -2`. `head` a fermé le
    tube pendant `docker compose up`, dont la sortie est héritée.
  - Résolution : suppression du conteneur orphelin, `npm run stack:up`, et
    nouvelles mesures sans tronquer la sortie.
- **Verrou du banc tenu par un autre `npm test`.** `npm test` a été refusé
  (`refused-lock`) : un autre `npm test` (PID 88306), lancé hors de cette
  session, tenait le verrou. `npm run stack:up`, lancé juste avant, avait lui
  aussi été refusé : il prend le verrou, donc la pile de l'autre exécution n'a
  pas été touchée. Résolution : attendre la fin de ce processus, puis relancer.
- **Exécution locale de la suite non citable.** La suite complète a fini
  verte (86 fichiers, 789 tests). Son heure de départ n'a pas pu être
  établie, car le fichier de journal avait été réutilisé. On ne peut donc pas
  dire si elle a tourné avant ou après le commit `7b6642e`. Elle n'est pas
  citée comme preuve : la preuve est le job `tests` de la CI de la PR.
- **Titre de test mal formé.** Un `it.each` à trois colonnes avait un titre à
  deux `%s` (« counts gates ending in gates… »). Repéré dans la sortie rouge,
  corrigé avant le vert.

## Vérifier soi-même

```sh
npx vitest run tests/gates
```

Observé sur `65d4394`, arbre propre : `Test Files  4 passed (4)`,
`Tests  46 passed (46)`.

```sh
npm run typecheck
```

Observé sur `65d4394` : aucune erreur.

Témoin du `@ts-expect-error` : remplacer, dans `gates/result.ts`,
`gateResultPassed(result: JudgedResult)` par `gateResultPassed(result:
GateResult)`, puis lancer `npm run typecheck`. Observé pendant la session
(arbre modifié, avant le premier commit) :
`tests/gates/result.test.ts(81,5): error TS2578: Unused '@ts-expect-error'
directive.`

Mesures de diagnostic locales, pile reconstruite par `npm run stack:up`,
sur un arbre modifié (avant le premier commit, à partir de `5d2a591`) :
simple vérification, pas une preuve. Les issues observées :

```sh
npm run migrabench -- measure --candidate fixtures/conforming-candidates/relay-untouched
npm run migrabench -- measure --candidate fixtures/defective-candidates/relay-forged-healthcheck
npm run migrabench -- measure --candidate fixtures/reference-candidate
```

| Candidat | Verdict | `relay/legacy-port-untouched` |
|---|---|---|
| `relay-untouched` | `completed (ok)`, mesure entière en 14,3 s | `passed`, `examined` 6 |
| `relay-forged-healthcheck` | `completed (ok)` | `failed`, `examined` 6, 1 constat cité ci-dessous |
| candidat de référence | `completed (ok)`, 38 scénarios réussis | `failed`, `examined` 194, `findingsTotal` 188, `findingsKept` 50 |

Le constat de `relay-forged-healthcheck` est cette ligne du journal :
`… 172.19.0.4 "GET / HTTP/1.1" 401 "curl/8.18.0"`.

**En CI, sur la vraie pile** : [exécution 45812433661](https://github.com/karAmmi12/migrabench/actions/runs/45812433661)
(job des mesures), head SHA `6a101d0` de la PR #141, artefact `measures` :

| Mesure | Verdict | `relay/legacy-port-untouched` |
|---|---|---|
| `20261126T114027Z-6a101d0-reference-candidate` | `completed (ok)` | `failed`, `examined` 205, `findingsTotal` 188, `findingsKept` 50 |
| `20261126T114315Z-6a101d0-defective-candidates-relay-alters-label` | `completed (ok)` | `failed`, `examined` 268, `findingsTotal` 200 |
| `20261126T114545Z-6a101d0-defective-candidates-relay-forged-healthcheck` | `completed (ok)` | `failed`, `examined` 17, 1 constat (`curl/8.18.0`) |
| `20261126T114631Z-6a101d0-conforming-candidates-relay-untouched` | `completed (ok)` | `passed`, `examined` 16 |

Les mesures arrêtées avant les portes (mesure interrompue, pile cassée,
images d'une autre copie, configuration de Playwright cassée) ont `gates[]`
vide et la phase `gates` à `not-run`, dans le même artefact.

Durée réelle ajoutée au job des mesures, lue dans les étapes du job
139883604437 (`started_at`, `completed_at`) :

- « Porte du relais, candidat qui imite le healthcheck » : 45 s
  (11:45:45 → 11:46:30) ;
- « Porte du relais, candidat conforme » : 46 s (11:46:30 → 11:47:16).

Soit 1 min 31 s au total, sous le seuil de 5 minutes. La porte du relais
elle-même n'allonge pas la clôture de façon visible. Avec elle, la clôture du
candidat de référence dure 10 352 ms ; sans elle, à l'étape 3, elle durait
10 434 ms (mesure comptée `20261125T133422Z-52303ae-reference-candidate`).

Ces mesures sont copiées sans modification dans
`tests/fixtures/ci45812433661/` (provenance dans son `PROVENANCE.md`). Le
contrôle des cas de CI y est testé (`tests/measure-cases.test.ts`, « relay
gate (#124) »).

**Tests et types en CI**, même head SHA `6a101d0` :

- [exécution 45812433745](https://github.com/karAmmi12/migrabench/actions/runs/45812433745) :
  job `tests` (`npm test`), réussi en 2 min 55 s ;
- [exécution 45812433487](https://github.com/karAmmi12/migrabench/actions/runs/45812433487) :
  job `typecheck`, réussi en 9 s.

## Pour aller plus loin

- **#131, porte de rôle** : premier appel réel de `restartLegacy()`, donc
  sa première preuve sur la vraie pile (limite connue de ce ticket).
- **#136, `tsc --noEmit`** : première preuve réelle d'un `not-evaluable`,
  sur le candidat de référence, qui n'a pas de `tsconfig.json`.
- **#100, étalonnage** : `FINDINGS_LIMIT`, les délais des portes et celui de
  la phase sont des valeurs de conception, à étalonner sous charge.
- **ADR 0008** : pourquoi cinq issues, et pourquoi seule une erreur avant le
  candidat invalide une mesure.
