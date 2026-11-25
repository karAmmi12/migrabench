# Rétro de l'étape 3 · Contrat de candidat et runner

Période : du 23/11 à 12:08 (ouverture de la PR #59, décisions de l'étape) au
25/11 à 15:07 (fusion de la PR #116, mesures comptées). Tickets de l'étape :
#62 à #74. Tickets hors étape de la même période : #76, #83, #90, #92, #94,
#96 et #102. Les tickets #52, #53 et #54, issus de la rétro de l'étape 2, ont
été fusionnés juste avant.

Sources des chiffres :
- **PR** : API REST de GitHub (`repos/karAmmi12/migrabench/pulls`), relevée le
  25/11.
- **CI** : toutes les exécutions créées entre le 23/11 à 12:00 et le 25/11 à
  15:10 (UTC), soit 555 exécutions et 722 jobs non ignorés, relevées le 25/11
  par `gh api …/actions/runs` puis `…/runs/<id>/jobs`. Une durée est
  `completed_at − started_at` d'un job. C'est une durée réelle, pas des
  minutes facturées, que GitHub arrondit à la minute supérieure par job.
- **Le reste** : les fiches citées.

## Ce qui a marché

- **Le critère de fin est atteint.** Mesure comptée
  `20261125T140819Z-889e111-reference-candidate`, lancée sur `main` au commit
  `889e111` ([exécution 45630451023](https://github.com/karAmmi12/migrabench/actions/runs/45630451023)) :
  38 scénarios attendus, 0 en échec (`oracle.json`, versionné sous
  `results/counted/`).
- **Le fil traceur d'abord.** #62 a posé toutes les phases d'une mesure,
  réduites au plus court. Les douze tickets suivants s'y sont branchés un par
  un, sans refonte du chemin. Les 26 PR fusionnées de la période l'ont été
  en un peu plus de deux jours.
- **Les issues d'une mesure sont prouvées sur une vraie pile.** #74 mesure
  en CI le candidat de référence, les huit candidats défectueux, un refus par
  le verrou du banc et une mesure interrompue. Avant, ces issues n'étaient
  prouvées qu'en Vitest ou à la main.
- **La consommation de la CI a été mesurée avant d'être réduite.** Sur une PR
  type (un commit de code, puis un commit de documentation seule), les jobs
  passent de 1 233 s (20,6 min, PR #80) à 530 s (8,8 min, PR #81). Source :
  [fiche #76](../journal/76-ci-reduire-consommation-minutes.md).
- **Les défauts trouvés en route sont devenus des tickets, sans élargir le
  ticket en cours.** Exemples : #90 (course entre deux fichiers de test),
  #92 (verrou du banc invisible d'un worktree à l'autre), #94 (`npm test` ne
  tenait pas le verrou du banc) et #102 (pile construite depuis une autre
  copie). Chacun a sa fiche.

## Ce qui a coûté

- **CI : 848 min de jobs sur la période**, réparties ainsi :

  | Job | Durée cumulée |
  |---|---|
  | Oracle / `proof` | 277 min |
  | Oracle / `oracle` | 170 min |
  | Tests du banc / `tests` | 151 min |
  | Mesures / `measures` | 120 min |
  | Étalonnage / `calibration` | 41 min |
  | Autres jobs | 89 min |

  `main` en porte 213 min. Les branches les plus coûteuses sont
  `feat/74-measures-ci` (100 min) et `feat/72-calibration` (86 min). Les
  deux PR de mesure de #76 (`mesure/76-avant` et `mesure/76-apres`, non
  fusionnées) ont coûté 70 min.
- **Échecs en CI** : 72 min de jobs ont échoué, et 7 min de jobs ont été
  annulées. Sur les 555 exécutions, 9 ont échoué et 31 ont été annulées.
- **#74 a pris quatre PR** (#109, #110, #114 et #116).
  - La première mesure comptée a été rejetée deux fois sur `main`, au commit
    `52303ae`
    ([exécution 45624562190](https://github.com/karAmmi12/migrabench/actions/runs/45624562190),
    [exécution 45624689673](https://github.com/karAmmi12/migrabench/actions/runs/45624689673)).
    Les mesures étaient complètes, 38 sur 38, mais un contrôle reposait sur
    une fixture écrite de mémoire. C'est le deuxième cas après `saltImposed`
    (#73, #110).
  - La sonde d'isolation prenait 19 min en CI contre 199 s en local : un
    worker au lieu de sept.
  - Le cas du legacy arrêté pendant l'oracle a duré 5 751 s en local. Il a
    été retiré du job (#111).

  Source : [fiche #74](../journal/74-critere-fin-mesure-comptee.md).
- **Le verrou du banc a demandé quatre tickets.** #69 l'a posé. Il a fallu
  ensuite #90 (une course de tests venue de #88, plus un erratum découvert
  dans #67), #92 (worktrees) et #94 (`npm test`). #102 vient du même défaut
  de partage de la pile : pendant #67, une mesure lancée depuis un worktree
  a tourné contre un legacy construit depuis une autre branche.
- **Durée des sessions** : non relevée. Aucun chiffre de temps humain ou de
  temps de session n'est donné ici.

## Règles adoptées pendant l'étape

- **Les fixtures qui imitent un fichier produit par le banc sont copiées d'un
  vrai fichier**, avec leur provenance citée. Origine : #74, écrite dans
  `CLAUDE.md` par la PR #114 (commit `889e111`), après l'exécution
  45624689673 et le précédent `saltImposed` (#73, #110). La conversion des
  fixtures existantes est l'issue #115.
- **Non évaluable** : une porte qui n'a examiné aucun élément compte comme un
  échec, jamais comme une réussite. Origine : les décisions de l'étape 3
  (PR #59), écrites dans `GLOSSARY.md`. Les portes de l'étape 4 l'appliquent.
- **Une preuve cite l'état exact où elle a été obtenue.** La règle date de
  l'étape 1 (`CLAUDE.md`, commit `4b397bd`). Pendant l'étape 3, elle est
  devenue un contrôle à trois endroits :
  - un SHA cité est reconnu par l'existence du commit (#96) ;
  - une mesure comptée est refusée si elle ne part pas d'un état publié (#73) ;
  - une mesure, une exécution de l'oracle ou un étalonnage refuse une pile
    qui n'a pas été construite depuis sa propre copie (#102).
- **Une session par ticket.** Origine non retrouvée : la règle n'est écrite
  ni dans le dépôt ni dans les issues. À consigner dans `CLAUDE.md` si elle
  doit tenir.
- **Tout outil du banc qui utilise la pile tient le verrou du banc**, et ce
  verrou est commun à toutes les copies du dépôt. Origines : #69 (les outils
  du banc), #92 (un seul verrou par machine) et #94 (`npm test` compris).
- **Un test qui lance une mesure ou écrit sous `results/diagnostic/` ou
  `.oracle-artifacts/` rejoint le projet Vitest `bench-tools`.** Origine :
  #90.
- **Une PR qui ne touche que `docs/**` ne relance pas les jobs lourds.** Une
  exécution remplacée par un nouveau commit est annulée. Origine : #76 et #83.

## Ce qu'on change pour l'étape 4

- **Ouvrir l'étape par le tri du 25/11** :
  - #112 d'abord, prioritaire (délai de construction et client `docker run`
    bloqué) ;
  - puis #97 (provenance des mesures comptées), #100 (étalonner le démarrage
    sous la charge de l'oracle) et #78 (figer Chromium en CI) ;
  - #113 est aussi `ready-for-agent` ;
  - #89 et #111 restent `needs-triage`.
- **Traiter #115 avant le 1er décembre.** Les vraies mesures dont les
  fixtures doivent être copiées sont dans des artefacts de CI qui expirent le
  2026-12-01 et le 2026-12-02 ([fiche #74](../journal/74-critere-fin-mesure-comptee.md)).
- **Chaque porte écrit ses fixtures à partir d'une vraie mesure, dès son
  premier test.** On n'attend pas qu'un contrôle faux passe en CI.
- **Prouver tôt en CI ce qui dépend de la machine.** Le nombre de workers et
  les durées ont divergé entre la CI et le poste local (#74), comme les
  relevés d'étalonnage entre deux processeurs (#72). Une porte qui mesure une
  durée ou une ressource tourne en CI avant la fin de son ticket.
- **Porte du relais** : elle réutilise `checkAccessLog`, écarte les lignes du
  `healthcheck` relevées dans #67, et prend le candidat de référence comme
  test négatif (#70).
- **Une rétro écrite à chaque clôture d'étape**, dans ce dossier.

## Reste ouvert

Repris des sections « Pour aller plus loin » et des limites connues des
fiches de l'étape 3 et des fiches hors étape de la période (#52, #53, #54,
#76, #83, #90, #92, #94, #96, #102). Les pistes déjà traitées par un ticket
fusionné depuis sont retirées. C'est le cas, par exemple, de « `npm test` ne
tient pas le verrou du banc », réglé par #94.

### Mesure et verdict

- Un arrêt sur la limite de tas de Node, sans que le conteneur soit tué,
  donne `build-failed` et non `build-resource-limit`. —
  [#65](../journal/65-construction-delais-limites-registre.md)
- Un signal reçu pendant l'écriture de `measure.json` est ignoré. Sous
  `SIGKILL`, le runner s'arrête sans écrire de mesure et laisse un verrou du
  banc orphelin. — [#71](../journal/71-mesure-interrompue.md)
- `migrabench calibrate` n'a pas de mesure interrompue (issue #108). —
  [#71](../journal/71-mesure-interrompue.md)
- Le résultat collecté d'un oracle interrompu et ses bruts partiels restent
  dans `.oracle-artifacts/`, et la mesure ne les cite jamais. —
  [#71](../journal/71-mesure-interrompue.md)
- Une erreur imprévue pendant la vérification des images de la pile (Docker
  injoignable) remontait comme une exception. #68, fusionnée après, range les
  erreurs imprévues du runner, mais ce cas n'a pas été prouvé depuis. —
  [#102](../journal/102-pile-construite-propre-commit.md)
- Plafond des délais de l'oracle pour les mesures de diagnostic (#111). Il
  ramènerait dans la CI le cas du legacy arrêté pendant l'oracle. —
  [#74](../journal/74-critere-fin-mesure-comptee.md)

### Construction, isolation et étalonnage

- Le délai de construction tue-t-il ce qui bloque, le conteneur ou le client
  `docker run` (#112) ? — [#74](../journal/74-critere-fin-mesure-comptee.md)
- Le réseau `default` laisse le candidat joindre le port `8080` du legacy
  (ADR 0007). — [#62](../journal/62-fil-traceur-mesure-diagnostic.md)
- Les limites étalonnées ne s'appliquent qu'aux conteneurs de la
  construction. Le service `candidate` garde une limite provisoire de
  conception, à étalonner sous la charge de l'oracle (#100). —
  [#72](../journal/72-candidat-etalonnage-migrabench-calibrate.md),
  [#66](../journal/66-isolation-candidat-sonde.md)
- Les relevés diffèrent d'une machine à l'autre : 10,1 s de construction sur
  AMD EPYC, 5,8 s sur Intel Xeon. Il faudrait répartir les relevés sur
  plusieurs jobs et garder le maximum (#89). —
  [#72](../journal/72-candidat-etalonnage-migrabench-calibrate.md)
- Les délais sortent d'un candidat d'étalonnage léger (3,6 s jusqu'à la
  disponibilité, 49 s de construction). L'étape 6 réétalonne avant sa
  première mesure comptée. —
  [#72](../journal/72-candidat-etalonnage-migrabench-calibrate.md)
- Le CPU est relevé en moyenne. Échantillonner `cpu.stat` donnerait le pic.
  Le CPU du démarrage est un peu surestimé, et cette valeur n'est pas
  appliquée. — [#72](../journal/72-candidat-etalonnage-migrabench-calibrate.md)
- La validité d'un étalonnage devrait être jugée sur le contenu, pas sur
  l'identifiant d'image (#113). —
  [#74](../journal/74-critere-fin-mesure-comptee.md)

### Pile et verrou du banc

- Le verrou du banc ne couvre que les outils du banc. Une requête envoyée à
  la main au legacy pendant une mesure reste comptée contre le candidat
  (`PROTOCOL.md`, limites). — [#69](../journal/69-verrou-du-banc.md)
- Les limites autour de `npm test` (#94) :
  - sous `SIGKILL`, `scripts/test.ts` ne relaie rien, et Vitest continue
    seul ;
  - `npx vitest` lancé directement ne prend pas le verrou du banc ;
  - Vitest, sorti du groupe de premier plan, ne reçoit plus Ctrl+Z ni Ctrl+\.

  — [#94](../journal/94-npm-test-tient-verrou.md)
- `refused-usage.test.ts` compare tout le contenu de `results/diagnostic/` et
  de `.oracle-artifacts/`. Un futur test qui y écrirait hors du projet
  `bench-tools` recréerait la course. —
  [#90](../journal/90-course-tests-verrou-banc.md)
- L'empreinte de la pile couvre aussi la documentation et les tests, qui
  exigent donc un `npm run stack:up` avant de mesurer. Élargir
  `.dockerignore` réduirait ces refus. —
  [#102](../journal/102-pile-construite-propre-commit.md)
- Piste : reconstruire la pile sans attestation
  (`BUILDX_NO_DEFAULT_ATTESTATIONS=1`) depuis la copie qui mesure, sans
  casser `images` dans les preuves de l'oracle. Non testé en CI. —
  [#102](../journal/102-pile-construite-propre-commit.md)

### Preuves et résultats versionnés

- Provenance des mesures comptées (#97). `imageContexts` pourrait y être
  exigé. On pourrait aussi vérifier par l'API GitHub qu'une exécution citée
  existe, car un lien `actions/runs/<id>` est accepté sans vérification. —
  [#73](../journal/73-mesure-comptee-controle-versionne.md),
  [#96](../journal/96-sha-reconnu-existence-commit.md),
  [#102](../journal/102-pile-construite-propre-commit.md)
- Les fixtures écrites à la main sont à convertir en copies de vrais
  fichiers produits (#115). — [#74](../journal/74-critere-fin-mesure-comptee.md)
- « Commit connu » prouve que le commit existe, pas qu'il vient de la PR qui
  a versionné le résultat. `fetch:pull-heads` récupère toutes les têtes de
  PR, et son coût croît avec leur nombre. —
  [#53](../journal/53-controle-resultats-oracle-versionnes.md)
- Piste pour l'étape 6 : faire passer les résultats des runs par le même
  `checkResult`. — [#53](../journal/53-controle-resultats-oracle-versionnes.md)
- Le contrôle du plan de test a deux angles morts : un nombre écrit en
  toutes lettres n'est pas contrôlé, et un SHA cité ne prouve pas que la
  mesure a été faite sur ce commit. —
  [#54](../journal/54-controle-preuves-plan-test.md)

### Contrat de candidat

- Le `$id` du schéma pointe vers `raw.githubusercontent.com/…`, ce qui ne
  vaut que si le dépôt est public. —
  [#64](../journal/64-contrat-candidat-schema-sources.md)
- Le schéma publié sera donné à l'agent dans le prompt (étape 6). —
  [#64](../journal/64-contrat-candidat-schema-sources.md)

### CI

- La règle de référence lit une page de 100 exécutions. Au-delà, le job
  tourne, ce qui reste sûr. — [#76](../journal/76-ci-reduire-consommation-minutes.md)
- Le filtre `branch` mélange les exécutions d'une PR venue d'un fork et
  d'une branche de même nom. Le contrôle d'ascendance écarte celles qui ne
  sont pas des ancêtres de la tête. —
  [#76](../journal/76-ci-reduire-consommation-minutes.md)
- Si l'on ajoute des vérifications obligatoires sur `main`, les jobs ignorés
  y comptent comme réussis. —
  [#76](../journal/76-ci-reduire-consommation-minutes.md)
- Les tests de `main` ne tournent pas sur `push`. Une PR qui ne touche que la
  documentation s'appuie sur les tests faits à la tête de la PR précédente. —
  [#83](../journal/83-ignorer-jobs-pr-docs.md)

### Environnement de l'agent

- Le hook de session ne connaît que `nvm` (pas Volta, fnm, ni un paquet
  système). — [#52](../journal/52-environnement-agent-session.md)
- Le rappel de `npm run stack:up` n'apparaît pas si l'oracle lève une
  erreur, alors que la pile a peut-être déjà été recréée avec le sel de
  l'exécution. — [#52](../journal/52-environnement-agent-session.md)

### Pour les étapes suivantes

- Étape 4, porte du relais : écarter les lignes du `healthcheck` (`curl`,
  `0:0:0:0:0:0:0:1`) du journal d'accès, et prendre le candidat de référence
  comme test négatif. — [#67](../journal/67-journal-acces-marqueur-temoins.md),
  [#70](../journal/70-fidelite-relais-reference.md)
- Étape 5, score : gérer un `oracle.summary` absent, sans inventer de compte
  de scénarios. — [#68](../journal/68-pannes-pile-erreurs-runner.md)
