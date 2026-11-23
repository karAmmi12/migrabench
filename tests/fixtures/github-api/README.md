# Réponses enregistrées de l'API GitHub

Réponses réelles de l'API des exécutions de workflow, enregistrées le
2026-11-23 depuis ce dépôt, pour tester l'adaptateur `scripts/github-history.ts`
(#76) sans appel réseau. Elles viennent de la PR #75
(branche `feat/62-measure-tracer`), workflow « Oracle ».

Les e-mails d'auteur et de committer de `head_commit` sont remplacés par
`author@example.invalid` ; le reste est tel que l'API l'a rendu.

```sh
redact='walk(if type == "object" and has("email") then .email = "author@example.invalid" else . end)'

gh api "repos/karAmmi12/migrabench/actions/workflows/oracle.yml/runs?event=pull_request&branch=feat/62-measure-tracer&status=completed&per_page=100" \
  | jq "$redact" > oracle-runs-pr75.json

gh api "repos/karAmmi12/migrabench/actions/runs/45203285639/jobs?per_page=100" \
  | jq "$redact" > oracle-jobs-run45203285639.json
```
