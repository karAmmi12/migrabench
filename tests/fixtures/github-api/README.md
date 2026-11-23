# Réponses enregistrées de l'API GitHub

Réponses réelles de l'API des exécutions de workflow, enregistrées le
2026-11-23 depuis ce dépôt, pour tester l'adaptateur `scripts/github-history.ts`
(#76) sans appel réseau. Workflow « Oracle » :

- `oracle-runs-pr75.json` et `oracle-jobs-run45203285639.json` : PR #75
  (branche `feat/62-measure-tracer`) ;
- `oracle-runs-pr79-*.json` : PR #79 (branche `ci/76-ci-minutes`), la même
  requête sans puis avec `status=completed`. Avec ce filtre, l'API rend
  0 exécution alors que les 2 sont terminées : l'adaptateur filtre lui-même.

Les e-mails d'auteur et de committer de `head_commit` sont remplacés par
`author@example.invalid` ; le reste est tel que l'API l'a rendu.

```sh
redact='walk(if type == "object" and has("email") then .email = "author@example.invalid" else . end)'

gh api "repos/karAmmi12/migrabench/actions/workflows/oracle.yml/runs?event=pull_request&branch=feat/62-measure-tracer&status=completed&per_page=100" \
  | jq "$redact" > oracle-runs-pr75.json

gh api "repos/karAmmi12/migrabench/actions/runs/45203285639/jobs?per_page=100" \
  | jq "$redact" > oracle-jobs-run45203285639.json

# Le 2026-11-23, après les exécutions de 6b2edf4 sur la PR #79.
gh api "repos/karAmmi12/migrabench/actions/workflows/oracle.yml/runs?event=pull_request&branch=ci%2F76-ci-minutes&per_page=100" \
  | jq "$redact" > oracle-runs-pr79-unfiltered.json

gh api "repos/karAmmi12/migrabench/actions/workflows/oracle.yml/runs?event=pull_request&branch=ci%2F76-ci-minutes&status=completed&per_page=100" \
  | jq "$redact" > oracle-runs-pr79-status-completed.json
```
