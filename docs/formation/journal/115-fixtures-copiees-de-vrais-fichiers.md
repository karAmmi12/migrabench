# #115 — Fixtures copiées de vrais fichiers produits

<!-- Fiche commencée avant /fiche-ticket pour sauver le journal rouge/vert, tenu
dans un dossier temporaire de la session. /fiche-ticket complète les autres
sections. -->

## Preuves : chaque test converti vu rouge, puis vert

État de chaque preuve : les tests tels qu'au commit cité (lancés juste avant
ce commit, sur son contenu exact), plus un seul fichier de production modifié
à la main pour y placer le défaut, puis remis en place avec `git checkout`.
Commande : `npx vitest run --project <projet> <fichier de test>`.

| Test | Commit | Défaut volontaire | Avec le défaut | Défaut retiré |
|---|---|---|---|---|
| `tests/start-report.test.ts` | `a162b4d` | `eachReport` découpe la ligne par `line.split(" ").slice(4)` : il suppose qu'aucun préfixe de compose (`candidate-1  \| `) ne précède l'horodatage | 13 échoués, 5 réussis. **L'ancien test, écrit à la main, passait : 17 réussis** | 18 réussis |
| `tests/runner/versioned-measures.test.ts` (tests sur fixtures) | `fe57f4a` | `checkResult` lit les métadonnées à la racine d'`oracle.json` (l'erreur de #73) | 3 échoués, 1 réussi | 7 réussis |
| `tests/oracle/measure-check.test.ts` | `7b1b44c` | `checkMeasureResult` lit `environment.originMain` (l'erreur corrigée par #114) | 13 échoués, 2 réussis | 15 réussis |
| `tests/oracle/closing-lines.test.ts` | `7b1b44c` | `passed` et `failed` inversés dans la ligne de résumé | 1 échoué, 2 réussis | 3 réussis |
| `tests/oracle/result-check.test.ts` | `f632430` | `/var/folders/` retiré de `MACHINE_PREFIXES` | 2 échoués, 11 réussis | 13 réussis |
| `tests/oracle/proof.test.ts` | `8f2c856` | les sels ne sont refusés que s'ils sont tous identiques (`size < 2`) | 1 échoué, 13 réussis | 14 réussis |
| `tests/oracle/collect.test.ts` | `5362b1a` | 1) `mb:reach` lu dans les seules annotations du test | 1 échoué, 22 réussis | 23 réussis |
| `tests/oracle/collect.test.ts` | `5362b1a` | 2) un chemin hors du dépôt gardé tel quel au lieu de son seul nom de fichier | 5 échoués, 18 réussis | 23 réussis |
| `tests/oracle/collect.test.ts` | commit suivant `ee46de1` | 3) garde-fou des chemins machine (`/home/`, `/Users/`, `/var/folders/`), rendu explicite sur les deux racines : la racine n'est plus retirée des textes, et le refus des chemins machine de `collect()` est désactivé | 8 échoués, 16 réussis, dont les deux variantes de « makes every other absolute path relative » | 24 réussis |
| `tests/runner/access-log.test.ts` | `337758b` | requête témoin reconnue à l'inclusion de son chemin, pas au chemin exact de la requête | 1 échoué, 12 réussis | 13 réussis |
| `tests/runner/witness.test.ts` | `337758b` | l'expression du chemin de requête n'accepte que `HTTP/1.0` | 1 échoué, 4 réussis | 5 réussis |
| `tests/runner/interrupted-measure.test.ts` (`-t "during the oracle"`, 3 tests) | `88ca8cf` | la liste des scénarios de la clôture écrite dans le dossier de l'oracle interrompu | 1 échoué, 2 réussis | 3 réussis |
| `tests/runner/calibration-check.test.ts` | `31435dd` | l'étalonnage contrôlé avec la règle du sel | 6 échoués | 6 réussis |
| `tests/runner/calibration.test.ts` | `31435dd` | pic de mémoire du build pris à la dernière étape, pas à la plus gourmande | 1 échoué, 8 réussis. **L'ancien test passait : 9 réussis** (son étape la plus gourmande était aussi la dernière) | 9 réussis |
| `tests/runner/resource-usage.test.ts` | `fa740b2` | temps CPU lu dans `user_usec` au lieu de `usage_usec` | 2 échoués, 1 réussi | 3 réussis |

Défauts essayés qui ne rendent pas le test rouge :

- `closing-lines` : `passed` calculé comme `scenarios - failed`. Le vrai résumé
  de la mesure comptée (38 réussis, 0 échoué, 0 non atteint) ne distingue pas
  ces champs.
- `interrupted-measure` : `launch` qui lit le rapport malgré le signal, et le
  garde-fou du signal retiré. Voir « Limites connues ».

## Limites connues

- **`interrupted-measure` : chemins du runner de CI dans le rapport partiel.**
  Le faux Playwright copie le vrai `report.json` partiel de la mesure
  interrompue de l'exécution 45624689673. Ses pièces jointes citent des chemins
  absolus du runner (`/home/runner/work/migrabench/migrabench/.oracle-artifacts/20261125T133512Z-…`),
  absents de la machine qui lance le test. Un runner défectueux qui lirait ce
  rapport après le signal échouerait au hachage des pièces jointes, et cette
  erreur, levée après l'interruption, est ignorée : le test reste vert. L'ancien
  rapport fabriqué (`suites: []`) aurait été collecté, et le test serait passé
  au rouge.
- **`collect.test.ts` : comparaison circulaire des empreintes HAR et trace.**
  Les HAR et les traces ne sont pas copiés. Les empreintes passées à
  `collect()` sont tirées des annotations `mb:har` et `mb:trace` de
  l'`oracle.json` auquel le résultat est ensuite comparé. Sur ces deux
  annotations, la comparaison ne prouve donc que l'ordre et l'emplacement des
  annotations, pas les empreintes. C'est acceptable parce que `collect()`
  reçoit les empreintes sans les calculer (`oracle/execute.ts` les calcule).
