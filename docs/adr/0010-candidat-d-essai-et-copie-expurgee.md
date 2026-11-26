# Un candidat d'essai, produit avant l'étape 6 à partir d'une copie expurgée du legacy, donne aux portes un vrai candidat à juger

Les portes doivent écrire leurs fixtures à partir de vraies mesures. Or le
candidat de référence est un relais JSP, sans TypeScript, sans bundle et
presque sans dépendances. Avant l'étape 6, on fait donc produire un
**candidat d'essai** par un vrai outil agentique (Claude Code, puis
éventuellement Gemini CLI). Ce n'est pas un run : le prompt n'est pas figé,
et le candidat d'essai n'est jamais compté. Il vit sous
`fixtures/trial-candidates/<outil>-<date>/`, avec sa provenance.

L'agent ne doit rien savoir du banc. Un agent qui comprend qu'il est évalué
peut changer de comportement, ce qui fausserait l'étape 6. Il part donc
d'une **copie expurgée du legacy**, produite par un script du banc testé et
déterministe, que l'étape 6 réutilisera tel quel :

- chaque commentaire du legacy destiné au banc porte un marqueur fixe
  `[banc]`, et le script retire ces commentaires ;
- `TRAPS.md`, `Dockerfile` et `access-log/` sont exclus de la copie ;
- `dossiers.json` est réduit aux dossiers qui ne figurent dans aucune
  réservation, sans la clé `reservations` ;
- le paquet Java `fr.migrabench.legacy` est renommé avec un nom métier
  neutre ;
- les indices du banc hors commentaires, que le marqueur ne peut pas
  retirer, sont réécrits dans la copie seule : un message d'erreur qui
  parlait du banc, le champ `reservations` de `DatasetLoader`.

L'agent tourne dans un conteneur Docker qui ne monte que son répertoire de
travail, avec une configuration de Claude Code vierge, propre au conteneur,
et sans question d'autorisation (mode `bypassPermissions`, sous un
utilisateur non root). Il s'authentifie avec un jeton d'abonnement
(`claude setup-token`, variable `CLAUDE_CODE_OAUTH_TOKEN`), jamais écrit
dans le dépôt ni dans un journal versionné. Une sonde prouve l'isolement,
depuis le conteneur : ni le dépôt, ni le `$HOME` de l'hôte, ni la pile du
banc n'y sont visibles.

## Options écartées

- **Un run anticipé sous `candidates/`** : il faudrait figer le prompt dès
  l'étape 4, ce qui avance une décision de l'étape 6, au risque qu'il soit
  pris pour un run comptable.
- **Retirer les commentaires du legacy lui-même** : on perd les garde-fous
  que lisent nos propres sessions, et `dossiers.json` révèle de toute façon
  les pièges (charge XSS, objet « réservé à la porte XSS », clés
  `scenario:`).
- **Une copie faite à la main** : elle n'est pas reproductible, et l'étape 6
  ne peut pas la réutiliser.
- **`--bare` avec une clé d'API** : l'isolement est documenté, mais la
  facturation à l'usage coûterait cher sur les N runs par outil de
  l'étape 6. La sonde de `CLAUDE_CONFIG_DIR` est gratuite et resservira.
- **L'agent sur le poste de Karim, avec seulement `CLAUDE_CONFIG_DIR`
  vierge** (première version de la procédure) : l'agent voyait tout le
  disque, dont le dépôt et `$HOME`, et un mode sans question d'autorisation
  y aurait été dangereux. Le conteneur borne à la fois ce qu'il voit et ce
  qu'il peut abîmer.

## Conséquences

- Un test sur `fixtures/legacy-app` échoue si un commentaire parle du banc
  sans porter le marqueur. Un test témoin échoue si la copie contient encore
  un mot du banc.
- Le conteneur joint Internet et les ports publiés sur l'hôte : la pile du
  banc est arrêtée pendant que l'agent tourne, et le script refuse de le
  lancer sinon.
- Un candidat d'essai n'est jamais retouché pour passer une porte. Seules
  sont permises une correction pour respecter le contrat et le retrait d'une
  donnée personnelle, chacune dans un commit séparé, décrite dans la
  provenance, et sans changer le comportement du candidat.
- Si la mesure de diagnostic d'un candidat d'essai n'est pas `completed`, ou
  si aucun scénario de l'oracle n'y réussit, il ne sert pas de fixture aux
  portes. On rouvre alors la question d'une pile exécutable pour l'agent.
