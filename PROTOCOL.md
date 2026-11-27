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
| Fidélité aux usages | écarts de valeurs métier envoyées par le navigateur, par rapport au legacy (résultat relevé) | comparaison HAR |
| Sécurité | charge XSS non exécutée, et affichée en texte (deux résultats par écran, trois écrans) | Playwright + jeu de données piégé |
| Sécurité | aucun secret serveur dans ce qui arrive au navigateur ou en part (bundle, HTML, requêtes et réponses des HAR de l'oracle) | recherche d'une valeur témoin |
| Sécurité | contrôle de rôle refusé côté serveur | rejeu de la requête de remise de l'instructeur avec les identifiants de l'agent, et accès direct à l'écran de remise |
| Sécurité | authentification exigée côté serveur : aucune requête rejouée sans identifiants ne renvoie de données ni ne modifie un dossier | rejeu sans identifiants des requêtes enregistrées dans le HAR |
| Sécurité | vulnérabilités connues des dépendances | osv-scanner hors ligne, sur une base OSV figée (ADR 0009) |
| Sécurité | motifs dangereux dans le code | ESLint et plugins de sécurité, configuration du banc (ADR 0009) |
| Accessibilité | violations par gravité | axe-core |
| Accessibilité | mise en page sans tableau (nombre et imbrication des tableaux) | arbre d'accessibilité, ou comptage dans le DOM à défaut |
| Performance | score Lighthouse du chargement initial (résultat relevé) | Lighthouse |
| Performance | poids du JS chargé pendant tout l'oracle (résultat relevé) | HAR de l'oracle |
| Qualité | erreurs de typage, et moyens de contourner le typage relevés à part | tsc --noEmit, TypeScript du banc |
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
5. Toute correction humaine sur un candidat est comptée et décrite. Le
   contenu de `candidates/` est la sortie de l'agent : toute modification
   humaine de ce contenu est une correction, comptée et décrite. Les mesures
   de diagnostic servent à mettre au point le banc, pas à corriger un
   candidat.
6. Le banc est validé sur lui-même : le legacy, déclaré comme candidat, doit
   obtenir 100 % à l'oracle, et échouer aux portes qui mesurent les pièges à
   corriger (ADR 0001).
7. Une mesure ne peut être invalidée que sur une preuve que le candidat ne
   peut ni recevoir ni fabriquer. Sinon, un candidat défectueux pourrait
   transformer son échec en invalidité, et échapper indéfiniment à la mesure.

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
- Une requête envoyée à la main au legacy pendant une mesure, sans marqueur
  du banc, n'est pas détectable comme une erreur du banc : elle fait échouer
  la porte du relais au compte du candidat. Le verrou du banc, que tient
  aussi `npm test`, ne couvre que les outils du banc.
- Une panne de la pile du banc pendant que le candidat tourne est comptée
  contre lui, même si elle vient du banc : il aurait pu la provoquer
  (règle 7). Elle est enregistrée comme une catégorie distincte, avec le
  service tombé et ses sorties, et le rapport compte sa fréquence.
- Une connexion du banc à son navigateur qui n'aboutit pas (passerelle qui
  refuse, jeton faux, service `browser` arrêté) rend la mesure invalide
  (`bench-browser-unreachable`, #168) : depuis #160, le candidat ne joint
  pas ce navigateur. Deux limites. Un navigateur qui se ferme pendant qu'il
  affiche une page du candidat reste compté contre lui, puisque la page
  tourne dans ce navigateur. Et le JavaScript d'une page du candidat peut
  joindre `run-server` sur `127.0.0.1:3001`, dans le conteneur `browser`,
  sans jeton : en y épuisant le navigateur, il pourrait rendre injoignable
  la connexion suivante du banc, et transformer son échec en invalidité.
  Ce trou est suivi par #169.
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
- Un comportement du legacy n'est pas mesuré : le message « Ce dossier ne
  peut pas être remis » de l'écran de remise d'un dossier `BROUILLON`. Il
  est inaccessible par navigation : la fiche d'un `BROUILLON` n'a pas de
  lien « Remise », et l'oracle n'atteint un écran qu'en cliquant depuis
  `BASE_URL` (ADR 0006). La règle métier reste garantie : l'API interne
  refuse la remise d'un `BROUILLON`, et la couche serveur du candidat passe
  par elle (ADR 0003).
- Semgrep, cité dans les premières versions de ce protocole, n'est pas
  utilisé : ses règles sont sous Semgrep Rules License v1.0, qui les réserve
  à un usage interne et en interdit la distribution. L'analyse statique du
  code passe par ESLint et des plugins de sécurité sous licence libre
  (ADR 0009).
- La recherche de la valeur témoin lit les HAR de l'oracle. Un morceau de JS
  chargé à la demande, jamais demandé pendant l'oracle, mais servi avec la
  valeur injectée à l'exécution, lui échapperait. Les fichiers construits ne
  sont pas lus : la construction ne reçoit aucune variable du banc
  (ADR 0007), donc la valeur ne peut pas s'y trouver.
- Le HAR de Playwright ne garde pas tout ce qui passe (sonde de #130,
  `tests/fixtures/probe130-d110270/PROVENANCE.md`) : le corps d'une réponse
  que la page n'a jamais lu en est absent, le corps binaire d'une requête
  qui contient un octet nul y est vide, et une requête dont le corps est un
  `Blob` n'y a pas de corps. La valeur témoin qui ne passe que par l'un d'eux
  échappe à la porte. Un corps de réponse absent rend donc la porte non
  évaluable, sauf fuite trouvée ailleurs (#153, #158). Seuls sont écartés la
  réponse vide, l'entrée sans réponse et les types sans intérêt connu
  (`image/*`, `font/*`, `audio/*`, `video/*`, d'après `Content-Type`) : une
  réponse sans `Content-Type`, ou d'un type mal formé ou inconnu, compte
  comme un corps non lu. Un
  candidat qui déclare une image pour servir du texte y échappe.
- Les portes de rôle et d'authentification rejouent des requêtes en
  transplantant les valeurs liées à la session (cookies, jeton anti-CSRF) :
  une valeur de la requête est liée à la session si elle apparaît dans ce
  que la session a reçu. C'est une heuristique du banc. Un jeton dérivé côté
  client (calculé en JS, jamais reçu tel quel) n'est pas reconnu : le rejeu
  de contrôle échoue, et le résultat est non évaluable. Un candidat
  **conforme** dans ce cas est donc pénalisé, puisque non évaluable compte
  comme un échec. C'est visible, mais pas neutre : le constat le dit en
  clair, pour une relecture humaine.
- La porte d'authentification juge une réponse rejouée sans identifiants sur
  les seuls numéros de dossier du jeu de données. Une réponse qui listerait
  des demandeurs sans leur numéro passerait.
- La comparaison HAR compare des valeurs, pas des noms de champs. Elle
  ignore les valeurs vides et triviales, et normalise les dates. Tout autre
  changement légitime de représentation (montants, casse) apparaît comme un
  écart. C'est pour cela qu'elle est relevée, et non jugée.
- Lighthouse ne mesure que le chargement initial de `BASE_URL`. Les écrans
  atteints en cliquant ne sont pas mesurés. Avant l'étalonnage sous charge
  (#100), ses scores sont relevés sous une limite de CPU provisoire et ne
  servent à aucune conclusion.
- `tsc` est celui du banc, pas celui du candidat (ADR 0009). Une syntaxe trop
  récente pour la version épinglée produirait des erreurs au compte du
  candidat.
- Struts 1.3.10 a des failles connues, inhérentes au legacy : sa branche
  n'est plus maintenue. Au 18/11/2026, OSV recense 4 avis sur `struts-core`
  1.3.10, et la GitHub Advisory Database en recense 5. Ces failles ne font
  pas partie des pièges mesurés : aucune porte ne les vérifie, et un candidat
  n'est pas noté sur elles. La pile du banc (legacy, service d'archivage,
  candidat) ne doit donc jamais être exposée hors de la machine locale.
