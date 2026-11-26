# Provenance : exécution 45812433661 (job des mesures, PR #141)

Copies, sans aucune modification, de fichiers produits par le banc lors du job
des mesures de l'[exécution 45812433661](https://github.com/karAmmi12/migrabench/actions/runs/45812433661),
sur le commit `6a101d0` de la branche `feat/124-gates-tracer` (PR #141). Elles
viennent de l'artefact `measures` de cette exécution, téléchargé le 2026-11-26
avec `gh run download 45812433661 -n measures`, et sont identiques octet pour
octet à l'artefact (vérifié avec `cmp`). Ce sont les premières mesures dont
`gates[]` contient un résultat de porte (#124).

Chaque fichier garde son chemin dans l'artefact.

| Copie | Mesure |
|---|---|
| `results/diagnostic/20261126T114027Z-6a101d0-reference-candidate/measure.json`, `oracle.json` | candidat de référence : `relay/legacy-port-untouched` `failed` |
| `results/diagnostic/20261126T114545Z-6a101d0-defective-candidates-relay-forged-healthcheck/measure.json`, `oracle.json` | candidat qui imite le healthcheck : `failed`, constat `curl/8.18.0` |
| `results/diagnostic/20261126T114631Z-6a101d0-conforming-candidates-relay-untouched/measure.json`, `oracle.json` | candidat conforme : `passed` |
