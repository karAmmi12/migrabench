# Provenance : exécution 45509307133 (étalonnage, `main`)

Copies, sans aucune modification, de fichiers produits par le banc lors de
l'étalonnage de l'[exécution 45509307133](https://github.com/karAmmi12/migrabench/actions/runs/45509307133),
sur le commit `aeb3037` de `main`. Elles viennent de l'artefact `calibration`
de cette exécution, téléchargé le 2026-11-25 avec
`gh run download 45509307133 -n calibration` (#115).

Chaque fichier garde son chemin dans l'artefact, à une exception près : le
dossier `.oracle-artifacts/` de l'artefact est copié sous `oracle-artifacts/`,
sans le point, car `.gitignore` ignore `.oracle-artifacts/` à toute profondeur.

| Copie | Chemin dans l'artefact |
|---|---|
| `results/calibration/20261124T232316Z-aeb3037-ci45509307133.1-1.json` | `results/calibration/20261124T232316Z-aeb3037-ci45509307133.1-1.json` |
| `oracle-artifacts/calibration-20261124T232316Z-aeb3037-ci45509307133.1-1/reading-1/usage/{fetch,install,build}/{cpu.stat,memory.peak}` | `.oracle-artifacts/calibration-20261124T232316Z-aeb3037-ci45509307133.1-1/reading-1/usage/{fetch,install,build}/{cpu.stat,memory.peak}` |

Le résultat d'étalonnage est identique, octet pour octet, au fichier versionné
par #109 sous `results/calibration/`. Les relevés `usage/` sont ceux du
relevé 1 : leurs valeurs sont celles des étapes de `readings[0].build.steps`
de ce résultat.
