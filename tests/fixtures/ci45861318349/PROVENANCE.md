# Provenance : exécution 45861318349 (job des mesures, PR #147)

Copies, sans aucune modification, de fichiers produits par le banc lors du job
des mesures de l'[exécution 45861318349](https://github.com/karAmmi12/migrabench/actions/runs/45861318349),
sur le commit `0d2eb7a` de la branche `feat/128-accessibility-gate` (PR #147).
Elles viennent de l'artefact `measures` de cette exécution, téléchargé le
2026-11-26 avec `gh run download 45861318349 -n measures`, et sont identiques
octet pour octet à l'artefact (vérifié avec `cmp`). Ce sont les premières
mesures avec la porte d'accessibilité (#128) et `environment.gateTools`.

| Copie | Mesure |
|---|---|
| `results/diagnostic/20261126T164430Z-0d2eb7a-reference-candidate/measure.json`, `oracle.json` | candidat de référence : tableaux `failed` sur les trois écrans, `axe/critical` et `axe/serious` `failed`, phase `gates` 2 285 ms |
| `results/diagnostic/20261126T165025Z-0d2eb7a-conforming-candidates-relay-untouched/measure.json`, `oracle.json` | candidat sans écran : porte d'accessibilité `not-evaluable` |
