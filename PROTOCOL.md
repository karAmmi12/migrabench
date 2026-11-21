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
- **Candidat** : une version migrée produite par un outil, dans
  `candidates/<outil>/<run>`. Elle se compose d'un front React + TypeScript et
  d'une couche serveur placée devant l'API interne du legacy (ADR 0003).
- **Run** : une exécution complète d'un outil, à partir du même prompt et du même état initial.
- **Porte** : une vérification automatique qui rend des résultats objectifs
  et nommés (JSON).
- **Piège** : un défaut planté volontairement dans le legacy. Un piège est
  soit *à corriger* (une bonne migration ne reproduit pas le défaut, et une
  porte le mesure), soit *à préserver* (une bonne migration ne perd pas le
  comportement implicite, et l'oracle le mesure). Voir l'ADR 0001.

Le vocabulaire du domaine du legacy et les termes dérivés sont définis dans
`GLOSSARY.md`.

## Métriques

| Critère | Métrique | Outil de mesure |
|---|---|---|
| Fidélité aux usages | % de scénarios de l'oracle passés | Playwright |
| Fidélité aux usages | scénarios clavier seul passés (tabulation, raccourcis) | Playwright |
| Fidélité aux usages | écarts de payload HTTP par rapport au legacy | comparaison HAR |
| Sécurité | charge XSS non exécutée, et affichée en texte (deux résultats) | Playwright + jeu de données piégé |
| Sécurité | aucun secret serveur dans ce qui arrive au navigateur ou en part (bundle, HTML, requêtes et réponses du HAR) | recherche d'une valeur témoin |
| Sécurité | contrôle de rôle refusé côté serveur | rejeu de la requête de remise de l'instructeur avec les identifiants de l'agent |
| Sécurité | authentification exigée côté serveur : aucune requête rejouée sans identifiants ne renvoie de données ni ne modifie un dossier | rejeu sans identifiants des requêtes enregistrées dans le HAR |
| Sécurité | vulnérabilités des dépendances | npm audit, Semgrep |
| Accessibilité | violations par gravité | axe-core |
| Accessibilité | mise en page sans tableau (nombre et imbrication des tableaux) | arbre d'accessibilité, ou comptage dans le DOM à défaut |
| Performance | score Lighthouse, poids du bundle | Lighthouse CI |
| Qualité | erreurs de typage | tsc --noEmit |
| Coût | durée, tokens, nombre de corrections humaines | relevé par run |

## Règles

1. Même prompt et même état initial pour tous les outils. Le prompt est versionné.
2. N runs par outil (N >= 3), parce que la sortie d'un LLM varie. On rapporte
   la médiane et la dispersion, jamais un seul run.
3. L'oracle est en lecture seule pour l'agent. Un candidat qui modifie les
   tests est disqualifié.
4. Les résultats JSON sont versionnés. Les bruts lourds (traces, captures,
   HAR) sont conservés hors du dépôt et cités dans le JSON par leur
   empreinte (ADR 0005).
5. Toute correction humaine sur un candidat est comptée et décrite.
6. Le banc est validé sur lui-même : le legacy, déclaré comme candidat, doit
   obtenir 100 % à l'oracle, et échouer aux portes qui mesurent les pièges à
   corriger (ADR 0001).

## Limites connues

- axe-core ne couvre qu'une partie des critères RGAA. Le reste demande une
  revue humaine, hors périmètre automatique.
- L'application de test est petite. Les résultats ne se généralisent pas tels
  quels à une application de plusieurs centaines d'écrans.
- Le diff visuel n'a de sens qu'en stratégie AS-IS. En stratégie Design
  System, on compare la structure (arbre d'accessibilité) et le comportement.
- Le legacy fournit une API JSON interne minimale (rechercher, lire, modifier,
  remettre) sur laquelle s'appuie la couche serveur du candidat. C'est une
  facilité du banc : beaucoup de vrais legacy n'en ont pas, et la migration
  doit alors aussi extraire ces services.
- Les textes visibles du legacy font partie du contrat, quelle que soit la
  stratégie : libellés des champs, noms des boutons et des liens, messages.
  L'oracle les compare au texte exact, espaces normalisés. Seuls les
  libellés de champs tolèrent des deux-points et une marque d'obligation
  (`*`) finales. Une reformulation volontaire des textes, même fidèle au
  sens, fait échouer le scénario : l'oracle ne mesure pas l'équivalence de
  sens.
- Seul Chromium est mesuré. Un candidat qui fonctionne mal dans Firefox ou
  Safari n'est pas pénalisé.
- La recherche de secret porte sur la valeur témoin en clair et sur ses
  encodages courants (base64, encodage URL). Elle ne détecte pas une
  obfuscation volontaire.
- La vérification des tableaux de mise en page est une heuristique du banc.
  Les navigateurs masquent parfois eux-mêmes ces tableaux dans l'arbre
  d'accessibilité. Si l'arbre s'avère trop indulgent sur le legacy, on compte
  à la place, dans le DOM, les éléments `table` sans `role="presentation"`
  ni `role="none"`.
- Struts 1.3.10 a des failles connues, inhérentes au legacy : sa branche
  n'est plus maintenue. Au 18/11/2026, OSV recense 4 avis sur `struts-core`
  1.3.10, et la GitHub Advisory Database en recense 5. Ces failles ne font
  pas partie des pièges mesurés : aucune porte ne les vérifie, et un candidat
  n'est pas noté sur elles. La pile du banc (legacy, service d'archivage,
  candidat) ne doit donc jamais être exposée hors de la machine locale.
