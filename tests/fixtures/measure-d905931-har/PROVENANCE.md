# Provenance : deux HAR de l'oracle, mesure `20261127T133436Z-d905931-reference-candidate`

Copies, sans aucune modification (vérifié avec `cmp`), de deux HAR de la
mesure de diagnostic `20261127T133436Z-d905931-reference-candidate`. Cette
mesure porte sur le candidat de référence, au commit `d905931` de la branche
`feat/134-lighthouse`, fusionnée depuis dans `main` en `ea61812`. Son
`measure.json` donne `environment.worktree: "clean"` et le verdict
`completed (ok)`. Les HAR viennent de son dossier
`.oracle-artifacts/20261127T133436Z-d905931-reference-candidate/oracle/`, dans
la copie principale du dépôt. Leur empreinte est celle que `measure.json`
cite :

| Copie | Empreinte citée par `measure.json` |
|---|---|
| `search-search-status-chromium/scenario.har` | `sha256:450e1153af5e84061bc7ed7d4e6c3d92664944bf9e5556922e8dc40dc59802df` |
| `sheet-sheet-save-brouillon-chromium/scenario.har` | `sha256:4b77d9f634aebb7f525d32fbf325ac140b6c13393b626c2c4609af957b608a27` |

Ce que ces HAR montrent, et que lit la porte d'authentification (#132) :

- toutes les entrées visent `http://127.0.0.1:8100`, l'adresse du candidat
  vue du banc ;
- `search-search-status` : deux `GET`, `BASE_URL` puis la recherche par
  statut `REMIS`, dont la réponse liste des numéros du jeu de données ;
- `sheet-sheet-save-brouillon` : sept `GET` et un `POST /enregistrer.do`
  (réponse `302`, corps vide), que la porte ne rejoue pas ;
- les en-têtes gardent leur casse (`Authorization`, `Cookie`, `Set-Cookie`).
  La première requête (`GET /`) n'a ni `Authorization` ni `Cookie`.
