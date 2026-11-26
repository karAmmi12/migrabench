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

HAR de l'oracle, ajoutés par #130 depuis le même artefact (`.oracle-artifacts/`,
dossier des bruts de la mesure), identiques octet pour octet (`cmp`) :

| Copie | Scénario | Entrées |
|---|---|---|
| `oracle-artifacts/20261126T164430Z-0d2eb7a-reference-candidate/oracle/remise-receipt-agent-chromium/scenario.har` | accusé de remise, agent : la valeur témoin dans le HTML de `remise.do` et dans l'URL de l'accusé | 5 |
| `oracle-artifacts/20261126T164430Z-0d2eb7a-reference-candidate/oracle/search-search-empty-form-chromium/scenario.har` | recherche sans critère : la valeur n'y est pas | 3 |

Ajoutés par #153, depuis le même artefact, identiques octet pour octet (`cmp`) :

| Copie | Scénario | Entrées |
|---|---|---|
| `oracle-artifacts/20261126T164430Z-0d2eb7a-reference-candidate/oracle/sheet-sheet-save-brouillon-chromium/scenario.har` | enregistrement d'un brouillon : le `POST /enregistrer.do` du legacy répond `302`, `Content-Length: 0`, `Content-Type: text/html`, sans corps (`bodySize: 0`) | 8 |
| `oracle-artifacts/20261126T165025Z-0d2eb7a-conforming-candidates-relay-untouched/oracle/search-search-empty-form-chromium/scenario.har` | candidat qui coupe toute connexion : une entrée sans réponse (`status -1`, `net::ERR_EMPTY_RESPONSE`, pas de `Content-Type`) | 1 |
