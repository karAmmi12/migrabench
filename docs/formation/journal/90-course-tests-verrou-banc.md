# #90 · Tests du verrou du banc : course entre bench-lock-tools.test.ts et refused-usage.test.ts

## Objectif

Vitest lance les fichiers de test en parallèle. Deux fichiers arrivés avec
#88 se gênaient et faisaient échouer `npm test` par intermittence.
`bench-lock-tools.test.ts` lance de vraies mesures sous un faux `docker`.
`refused-usage.test.ts` vérifie qu'un refus de `migrabench measure` n'écrit
rien sous `results/diagnostic/` ni sous `.oracle-artifacts/`. Le ticket corrige
deux échecs : un relevé des appels à `docker` fait trop tôt, et un refus qui
voyait le dossier d'une mesure lancée par l'autre fichier.

## Notions à connaître

- **Parallélisme des fichiers de test dans Vitest** : par défaut, Vitest
  exécute plusieurs fichiers en même temps, chacun dans son propre processus.
  Deux fichiers qui lisent ou écrivent le même dossier du dépôt peuvent donc
  se voir l'un l'autre. —
  [Vitest, Projects](https://vitest.dev/guide/projects)
- **`sequence.groupOrder`** : avec plusieurs projets Vitest, les projets qui
  ont le même numéro tournent ensemble, et les groupes passent du plus petit
  numéro au plus grand. Un projet au numéro 1 attend donc la fin de tous les
  projets au numéro 0, qui est la valeur par défaut. —
  [Vitest, sequence.groupOrder](https://vitest.dev/config/sequence#sequence-grouporder).
  Cette page documente la dernière version de Vitest. Le banc utilise la
  version 5.1.0, dont les types (`node_modules/vitest`) décrivent la même règle.
- **`$PPID` en shell** : c'est le PID du processus parent du shell. Le faux
  `docker` est un script `sh` lancé directement par l'outil du banc, sans
  shell intermédiaire (`shared/process.ts`). `$PPID` y vaut donc le PID de
  l'outil. —
  [POSIX, Shell Variables](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html#tag_19_05_03)
- **Point de synchronisation plutôt qu'attente en temps** : un test qui doit
  attendre un autre processus attend un signal explicite que ce processus
  émet (ici, un fichier témoin), et pas une durée fixe. Il reste juste quelle
  que soit la vitesse de la machine. — source : la piste de correction de
  l'issue #90.

Liens ouverts le 2026-11-24 (`curl`) : chaque page répond `200`, et les ancres
`sequence-grouporder` et `tag_19_05_03` existent.

## Ce qui a été construit

- **`tests/runner/bench-lock-tools.test.ts`** :
  - en mode `block`, le faux `docker` crée le fichier témoin
    `reached-<PID de l'outil>` dans son dossier temporaire, juste avant de
    bloquer ;
  - `holding()` rend la main seulement quand l'outil tient le verrou du banc
    **et** que ce fichier témoin existe. Les appels relevés ensuite par
    `stubCalls()` contiennent donc déjà ceux de l'outil de fond.
- **`vitest.config.ts`** : deux projets Vitest.
  - `default` : tous les fichiers `tests/**/*.test.ts` sauf
    `bench-lock-tools.test.ts`, avec les exclusions par défaut de Vitest.
  - `bench-tools` : `bench-lock-tools.test.ts` seul, avec
    `sequence.groupOrder: 1`. Il tourne après tous les autres fichiers, et
    rien ne tourne en même temps que lui.

## Les choix faits et pourquoi

- **Échec 1 : un fichier témoin, et non une attente en temps.** C'est la
  piste de l'issue. Le nom du fichier contient le PID de l'outil, pour que
  `holding()` attende le signal de l'outil qu'il a lancé, et non celui d'un
  autre.
- **Échec 2 : exécution en série** (troisième piste de l'issue), choix validé
  par l'humain. Les deux autres pistes ont été écartées :
  - *la mesure n'écrit pas dans les dossiers surveillés* : la mesure écrit
    toujours sous `ROOT`, que `shared/root.ts` déduit de l'emplacement du
    code. Le verrou du banc vit aussi sous `ROOT`. Changer d'emplacement
    demanderait de modifier le runner pour un besoin de test. Lancer la mesure
    depuis une autre copie du dépôt lui donnerait un autre verrou du banc, et
    le test ne vérifierait plus rien ;
  - *`refused-usage.test.ts` ne compte que les entrées du candidat refusé* :
    les tests négatifs y perdraient. Un refus sans candidat (options
    invalides) ne peut pas être reconnu au nom de son dossier. Le refus d'un
    `--timeout-cap-ms` invalide vise `fixtures/reference-candidate`, le même
    candidat que les mesures de `bench-lock-tools.test.ts`.
- **Le fichier tourne seul, et pas seulement à l'écart de
  `refused-usage.test.ts`.** Il prend le vrai verrou du banc. Tout autre
  fichier qui lancerait un outil du banc en même temps pourrait être refusé
  à cause de lui.

## Difficultés rencontrées

- **L'échec 2 se reproduisait à chaque fois.**
  - Symptôme : sur `main` (`25b5ef5`), `npx vitest run
    tests/runner/refused-usage.test.ts tests/runner/bench-lock-tools.test.ts`
    a échoué 3 fois sur 3, toujours sur « refuses a candidate directory
    outside candidates/ and fixtures/ ».
  - Cause : celle de l'issue. Une mesure de `bench-lock-tools.test.ts` crée son
    dossier pendant que `refused-usage.test.ts` compare le contenu avant et
    après un refus.
  - Résolution : exécution en série. Les deux fichiers passent ensuite 10 fois
    sur 10.
- **L'échec 1 n'a pas été reproduit.** La course dépend de la vitesse de la
  machine. Aucun test rouge n'a été obtenu avant la correction : la correction
  repose sur la cause décrite dans l'issue, à partir de l'exécution CI qui y
  est citée.
- **La première piste n'était pas réalisable sans toucher au runner** (voir
  « Les choix faits »). Ce constat a été fait en lisant `runner/measure.ts` et
  `shared/root.ts`, avant d'écrire le moindre code.
- **La relecture a trouvé deux défauts**, corrigés par `e9feed1` :
  - Symptôme : `exclude: [BENCH_TOOLS]` remplaçait la liste d'exclusion par
    défaut de Vitest au lieu de la compléter, et un commentaire de
    `bench-lock-tools.test.ts` disait encore que les tests des refus tournaient
    en parallèle.
  - Résolution : `exclude: [...configDefaults.exclude, BENCH_TOOLS]`, et le
    commentaire réécrit.
- **La durée « avant » du job `tests` n'était pas sur `main`.**
  - Symptôme : les exécutions déclenchées par une poussée sur `main` n'ont pas
    de job `tests`. Sur les derniers commits des PR #87 et #88, il a été
    ignoré, car ces commits ne touchaient que `docs/**`.
  - Résolution : la référence vient des exécutions de PR où le job a vraiment
    tourné avec `bench-lock-tools.test.ts` (tableau ci-dessous). Une troisième
    exécution candidate, `6a135fe` (PR #87), a été écartée : son journal
    compte 58 fichiers, sans `bench-lock-tools.test.ts`.

## Vérifier soi-même

```sh
npx vitest run tests/runner/refused-usage.test.ts tests/runner/bench-lock-tools.test.ts
```

Observé 10 fois de suite sur `e9feed1` : `Tests  12 passed (12)`.
Avec `--reporter=verbose`, `|default| tests/runner/refused-usage.test.ts`
passe avant `|bench-tools| tests/runner/bench-lock-tools.test.ts`.

```sh
npm test
```

Observé sur `e9feed1` : `Test Files  60 passed (60)`, `Tests  495 passed (495)`.

```sh
npm run typecheck
```

Observé sur `e9feed1` : aucune erreur.

**Coût de l'exécution en série sur la CI**, job `tests` du workflow « Tests du
banc ». Les durées sont lues dans
`gh api repos/karAmmi12/migrabench/actions/runs/<id>/jobs`.

La CI teste le commit de fusion de la PR dans `main`. Le nombre de fichiers
de test vient du journal de l'étape `Tests`.

| État | Exécution | Tête de la PR | Fichiers de test | Job `tests` | Étape `Tests` | `Duration` de Vitest | `bench-lock-tools.test.ts` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| avant | [45282567598](https://github.com/karAmmi12/migrabench/actions/runs/45282567598) | `527ee6d` (PR #88) | 56 | 2 min 34 s | 72 s | 71,67 s | 4685 ms |
| avant | [45285926481](https://github.com/karAmmi12/migrabench/actions/runs/45285926481), tentative 2 | `9a43cb2` (PR #87) | 60 | 2 min 35 s | 63 s | 62,05 s | 5814 ms |
| après | [45402570763](https://github.com/karAmmi12/migrabench/actions/runs/45402570763) | `ed14c54` (PR #91) | 60 | 2 min 45 s | 81 s | 80,26 s | 7830 ms |

Exécution de la PR : `Test Files  60 passed (60)`, `Tests  495 passed (495)`.

Lecture : face à la ligne `9a43cb2`, qui a les mêmes 60 fichiers, la
`Duration` de Vitest passe de 62,05 s à 80,26 s, soit 18,21 s de plus. Le
fichier mis en série dure 7830 ms : il ne peut expliquer qu'une partie de cet
écart, et seulement s'il ne recouvrait plus rien d'autre. Le reste est de la
variation d'une exécution à l'autre : la ligne `527ee6d`, avec moins de
fichiers, durait déjà 71,67 s. Une seule exécution de chaque côté ne permet pas
de séparer le coût de la série de cette variation. Il faudrait plusieurs
exécutions de chaque côté.

## Pour aller plus loin

- **#73** : l'étape suivante du runner (mesure qui compte).
- **Limite connue** : `refused-usage.test.ts` compare toujours tout le contenu
  de `results/diagnostic/` et de `.oracle-artifacts/`. Un futur test qui y
  écrirait, en parallèle et hors du projet `bench-tools`, recréerait la même
  course. Un tel test doit rejoindre le projet `bench-tools`.
- **Spec de l'étape 3, « Verrou du banc »**, et la fiche
  [`69-verrou-du-banc.md`](69-verrou-du-banc.md) : ce que les outils du banc
  se refusent l'un l'autre.
