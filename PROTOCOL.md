# Protocole expérimental

## Question

À cadrage égal, quel outil agentique produit la migration la plus fidèle et la
plus sûre d'un écran Struts/JSP vers React ? Et combien pèse le cadrage
(skills, contexte, portes de vérification) par rapport au choix de l'outil ?

## Hypothèse à tester

Le cadrage pèse plus que l'outil : un même agent, avec et sans harnais, montre
un écart plus grand que deux agents différents avec le même harnais.
L'hypothèse peut être fausse. Le protocole doit pouvoir le montrer.

## Vocabulaire

- **Legacy** : l'application de référence (Struts 1.3 + JSP), dans `fixtures/legacy-app`.
- **Oracle** : les scénarios Playwright écrits et validés sur le legacy. Ils
  définissent le comportement attendu.
- **Candidat** : une version migrée produite par un outil, dans `candidates/<outil>/<run>`.
- **Run** : une exécution complète d'un outil, à partir du même prompt et du même état initial.
- **Porte** : une vérification automatique qui rend un résultat objectif (JSON).
- **Piège** : un défaut planté volontairement dans le legacy, qu'une bonne
  migration doit corriger ou ne pas reproduire.

## Métriques

| Critère | Métrique | Outil de mesure |
|---|---|---|
| Fidélité aux usages | % de scénarios de l'oracle passés | Playwright |
| Fidélité aux usages | scénarios clavier seul passés (tabulation, raccourcis) | Playwright |
| Fidélité aux usages | écarts de payload HTTP par rapport au legacy | comparaison HAR |
| Sécurité | charge XSS non exécutée | Playwright + jeu de données piégé |
| Sécurité | aucun secret serveur dans le bundle | scan du build |
| Sécurité | contrôle de rôle refusé côté serveur | test d'API |
| Sécurité | vulnérabilités des dépendances | npm audit, Semgrep |
| Accessibilité | violations par gravité | axe-core |
| Performance | score Lighthouse, poids du bundle | Lighthouse CI |
| Qualité | erreurs de typage | tsc --noEmit |
| Coût | durée, tokens, nombre de corrections humaines | relevé par run |

## Règles

1. Même prompt et même état initial pour tous les outils. Le prompt est versionné.
2. N runs par outil (N >= 3), parce que la sortie d'un LLM varie. On rapporte
   la médiane et la dispersion, jamais un seul run.
3. L'oracle est en lecture seule pour l'agent. Un candidat qui modifie les
   tests est disqualifié.
4. Les résultats bruts (JSON, traces, captures) sont conservés et versionnés.
5. Toute correction humaine sur un candidat est comptée et décrite.
6. Le banc est validé sur lui-même : le legacy, déclaré comme candidat, doit
   obtenir 100 % à l'oracle.

## Limites connues

- axe-core ne couvre qu'une partie des critères RGAA. Le reste demande une
  revue humaine, hors périmètre automatique.
- L'application de test est petite. Les résultats ne se généralisent pas tels
  quels à une application de plusieurs centaines d'écrans.
- Le diff visuel n'a de sens qu'en stratégie AS-IS. En stratégie Design
  System, on compare la structure (arbre d'accessibilité) et le comportement.
