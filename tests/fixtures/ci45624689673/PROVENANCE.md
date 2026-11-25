# Provenance : exécution 45624689673 (job des mesures, `main`)

Copies, sans aucune modification, de fichiers produits par le banc lors du job
des mesures de l'[exécution 45624689673](https://github.com/karAmmi12/migrabench/actions/runs/45624689673),
sur le commit `52303ae` de `main`. Elles viennent de l'artefact `measures` de
cette exécution, téléchargé le 2026-11-25 avec
`gh run download 45624689673 -n measures` (#115).

Chaque fichier garde son chemin dans l'artefact, à une exception près : le
dossier `.oracle-artifacts/` de l'artefact est copié sous `oracle-artifacts/`,
sans le point, car `.gitignore` ignore `.oracle-artifacts/` à toute profondeur.

| Copie | Chemin dans l'artefact | Mesure |
|---|---|---|
| `oracle-artifacts/20261125T133422Z-52303ae-reference-candidate/start.log` | `.oracle-artifacts/20261125T133422Z-52303ae-reference-candidate/start.log` | candidat de référence, mesure comptée |
| `oracle-artifacts/20261125T133422Z-52303ae-reference-candidate/access.log` | `.oracle-artifacts/20261125T133422Z-52303ae-reference-candidate/access.log` | idem |
| `oracle-artifacts/20261125T133422Z-52303ae-reference-candidate/oracle/report.json` | `.oracle-artifacts/20261125T133422Z-52303ae-reference-candidate/oracle/report.json` | idem (rapport JSON brut de Playwright) |
| `oracle-artifacts/20261125T133512Z-52303ae-reference-candidate/oracle/report.json` | `.oracle-artifacts/20261125T133512Z-52303ae-reference-candidate/oracle/report.json` | candidat de référence, mesure interrompue pendant l'oracle |
| `oracle-artifacts/20261125T133634Z-52303ae-defective-candidates-isolation-probe/start.log` | `.oracle-artifacts/20261125T133634Z-52303ae-defective-candidates-isolation-probe/start.log` | sonde d'isolation (version de #110) |
| `oracle-artifacts/20261125T133634Z-52303ae-defective-candidates-isolation-probe/oracle/report.json` | `.oracle-artifacts/20261125T133634Z-52303ae-defective-candidates-isolation-probe/oracle/report.json` | idem |
| `results/diagnostic/20261125T133634Z-52303ae-defective-candidates-isolation-probe/measure.json` | `results/diagnostic/20261125T133634Z-52303ae-defective-candidates-isolation-probe/measure.json` | idem |
| `results/diagnostic/20261125T133634Z-52303ae-defective-candidates-isolation-probe/oracle.json` | `results/diagnostic/20261125T133634Z-52303ae-defective-candidates-isolation-probe/oracle.json` | idem |
| `oracle-artifacts/20261125T133740Z-52303ae-defective-candidates-relay-alters-label/oracle/report.json` | `.oracle-artifacts/20261125T133740Z-52303ae-defective-candidates-relay-alters-label/oracle/report.json` | relais qui altère un libellé |
| `results/diagnostic/20261125T133740Z-52303ae-defective-candidates-relay-alters-label/measure.json` | `results/diagnostic/20261125T133740Z-52303ae-defective-candidates-relay-alters-label/measure.json` | idem |
| `results/diagnostic/20261125T133740Z-52303ae-defective-candidates-relay-alters-label/oracle.json` | `results/diagnostic/20261125T133740Z-52303ae-defective-candidates-relay-alters-label/oracle.json` | idem |
| `oracle-artifacts/20261125T133535Z-52303ae-defective-candidates-contract-invalid/oracle-list/list.json` | `.oracle-artifacts/20261125T133535Z-52303ae-defective-candidates-contract-invalid/oracle-list/list.json` | contrat invalide (oracle non lancé : liste des scénarios) |
| `results/diagnostic/20261125T133535Z-52303ae-defective-candidates-contract-invalid/measure.json` | `results/diagnostic/20261125T133535Z-52303ae-defective-candidates-contract-invalid/measure.json` | idem |

Le `measure.json` et l'`oracle.json` de la mesure comptée
`20261125T133422Z-52303ae-reference-candidate`, du même artefact, ont été
copiés par #114 dans
`tests/fixtures/measure-cases/20261125T133422Z-52303ae-reference-candidate/`.
