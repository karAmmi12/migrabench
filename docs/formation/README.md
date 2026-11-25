# Formation

Les fiches de `journal/` racontent chaque ticket : son objectif, les notions à
connaître, ce qui a été construit et comment le vérifier soi-même.

## Sommaire

### Étape 1 · Application legacy de test

- [#2 · Squelette du legacy servi en BASIC](journal/2-squelette-legacy-basic.md) : poser une application Struts 1.3.10 démarrée par `docker compose up`, protégée par l'authentification `BASIC` de Tomcat, avec l'outillage de tests du banc et le premier test du seam A.
- [#3 · Jeu de données et recherche de dossiers](journal/3-jeu-donnees-recherche-dossiers.md) : donner au legacy son jeu de données fixe et son écran de recherche de dossiers, avec les pièges des `<table>` imbriquées et du XSS par `<bean:write filter="false">`.
- [#4 · Validation et focus de la recherche](journal/4-validation-focus-recherche.md) : ajouter à l'écran de recherche ses règles de saisie, présentes seulement dans `validation.xml`, et son focus initial, deux pièges à préserver.
- [#5 · Fiche dossier](journal/5-fiche-dossier.md) : construire la fiche dossier, modifiable sous un verrou de statut appliqué par la vue et par le service métier, avec ses pièges de saisie, de `Ctrl+S`, de focus et de mise en page.
- [#6 · Remise et horloge figée](journal/6-remise-horloge-figee.md) : construire l'écran de remise, daté par une horloge figée transmise par le banc, avec le piège du contrôle de rôle fait seulement dans la vue.
- [#7 · Service d'archivage et accusé de remise](journal/7-service-archivage-accuse-remise.md) : ajouter le service d'archivage simulé et le lien « Accusé de remise », qui fait fuir `ARCHIVE_TOKEN` dans le HTML et dans l'URL.
- [#8 · API interne isolée sur le port 8081](journal/8-api-interne-port-8081.md) : ajouter l'API interne JSON servie sur le port `8081` et la refuser sur `8080` par un filtre par port.

### Étape 2 · Oracle

- [#32 · Fil traceur : npm run oracle de bout en bout](journal/32-fil-traceur-npm-run-oracle.md) : poser une exécution complète de l'oracle, avec deux scénarios seulement, qui tire un sel, recrée le legacy, lance Playwright et écrit un résultat JSON versionné citant traces et HAR par empreinte.
- [#33 · Référence d'archivage sur l'accusé de remise](journal/33-reference-archivage-accuse-remise.md) : ajouter à l'accusé de remise une référence d'archivage calculée avec un sel que seuls le service d'archivage et l'oracle connaissent, pour qu'un faux accusé ne puisse pas la porter.
- [#34 · Scénarios @recherche](journal/34-scenarios-recherche.md) : ajouter les 16 scénarios de recherche restants (focus initial, critères, règles de `validation.xml`, utilisateur inconnu) au fil traceur.
- [#35 · Scénarios @fiche : lecture, enregistrement et Ctrl+S](journal/35-scenarios-fiche-enregistrement-ctrl-s.md) : ajouter huit scénarios de la fiche (lecture, enregistrement par bouton et par `Ctrl+S`, focus, tabulation, lien « Remise ») et les outils de navigation et de mesure réutilisés par les scénarios suivants.
- [#36 · Scénarios @fiche : validation et verrou](journal/36-scenarios-fiche-validation-verrou.md) : ajouter les scénarios F7 à F12, qui vérifient les champs obligatoires, les longueurs maximales et le verrou par statut, en enregistrant la variante observée quand le moyen est libre.
- [#37 · Scénarios @remise : récapitulatif et remise](journal/37-scenarios-remise-recapitulatif-remise.md) : ajouter M1 à M4, qui vérifient le récapitulatif en lecture seule, le dossier déjà remis, le refus à un agent et la remise par un instructeur à la date de l'horloge figée.
- [#38 · Scénarios @remise : accusé de remise](journal/38-scenarios-remise-accuse-remise.md) : ajouter M5 et M6, qui vérifient que l'accusé de remise s'ouvre comme une page et porte la référence d'archivage calculée avec le sel de l'exécution.
- [#39 · Critère de fin : 5 exécutions vertes et job de CI de l'oracle](journal/39-cinq-executions-job-ci-oracle.md) : faire tourner l'oracle en CI et ajouter un job de preuve qui le lance 5 fois sur les mêmes images, puis refuse les résultats si un critère de la spec n'est pas tenu.

### Étape 3 · Contrat de candidat et runner

- [#62 · Fil traceur : mesure de diagnostic du candidat de référence de bout en bout](journal/62-fil-traceur-mesure-diagnostic.md) : poser le premier chemin complet d'une mesure, où `migrabench measure` copie, construit et démarre le candidat de référence, rejoue l'oracle contre lui et écrit `measure.json` et `oracle.json`.
- [#63 · Verdict, codes de sortie et candidat jamais disponible](journal/63-verdict-codes-sortie-jamais-disponible.md) : donner au banc la seule définition de « invalide », une fonction pure qui range chaque mesure dans une catégorie et en tire le code de sortie, et traiter le candidat qui ne devient jamais disponible.
- [#64 · Contrat de candidat : schéma publié et sources du package-lock.json](journal/64-contrat-candidat-schema-sources.md) : valider `candidate.json` par un schéma JSON publié et les sources du `package-lock.json`, et arrêter avant tout code du candidat une mesure au contrat invalide (`contract-failure`).
- [#65 · Phase de construction : build, délais, limites et registre imposé](journal/65-construction-delais-limites-registre.md) : construire le candidat par `npm ci` puis `build`, avec le seul registre npm imposé, sous un délai global et des limites de mémoire et de CPU.
- [#66 · Isolation du candidat et sonde d'isolation](journal/66-isolation-candidat-sonde.md) : durcir le démarrage du candidat (capacités, privilèges, ressources) et prouver chaque protection sur une vraie pile avec le candidat défectueux 5, la sonde d'isolation.
- [#67 · Journal d'accès du legacy, marqueur et requêtes témoins](journal/67-journal-acces-marqueur-temoins.md) : conserver le journal d'accès du port `8080` du legacy à chaque mesure, prouver qu'il était actif par deux requêtes témoins, et rendre invalide une mesure pendant laquelle `npm test` a tourné.
- [#68 · Pannes de la pile et erreurs du runner](journal/68-pannes-pile-erreurs-runner.md) : ranger chaque panne qui ne vient pas du candidat (legacy malade, Playwright, erreur du runner) dans la bonne catégorie au lieu de faire planter la commande ou de la compter contre le candidat.
- [#69 · Verrou du banc](journal/69-verrou-du-banc.md) : empêcher deux outils du banc de recréer la pile en même temps par un verrou du banc qui nomme son détenteur et se reprend sur un processus mort.
- [#70 · Fidélité du relais de référence](journal/70-fidelite-relais-reference.md) : prouver par un test du Seam A que le relais du candidat de référence ne modifie aucune réponse du legacy, et montrer avec le candidat défectueux 6 que l'oracle voit un relais qui altère une page.
- [#71 · Mesure interrompue](journal/71-mesure-interrompue.md) : faire d'une interruption une mesure conservée, invalide pour la cause `interrupted`, avec le candidat arrêté et le verrou du banc libéré quelle que soit la phase.
- [#72 · Candidat d'étalonnage et migrabench calibrate](journal/72-candidat-etalonnage-migrabench-calibrate.md) : faire sortir les délais et les limites d'une mesure d'un étalonnage, et faire citer par chaque mesure l'empreinte du résultat d'étalonnage dont elles viennent.
- [#73 · Mesure prévue pour compter (--counted) et contrôle de measure.json versionné](journal/73-mesure-comptee-controle-versionne.md) : ajouter la mesure prévue pour compter, refusée si elle ne part pas d'un état publié et écrite sous `results/counted/`, et étendre le contrôle des résultats versionnés à ses fichiers.
- [#74 · Critère de fin : candidat de référence à 100 % dans une mesure comptée en CI](journal/74-critere-fin-mesure-comptee.md) : mesurer en CI, sur une vraie pile, le candidat de référence, les huit candidats défectueux, un refus par le verrou du banc et une mesure interrompue, et versionner les mesures comptées obtenues sur `main`.

### Hors étape

- [#10 · CI : figer l'environnement d'exécution](journal/10-ci-figer-environnement-execution.md) : figer le runner et les actions de la CI pour qu'elle parte du même état à chaque exécution.
- [#20 · CI : exécuter npm test avec la pile Docker](journal/20-ci-npm-test-pile-docker.md) : ajouter un workflow qui construit la pile Docker, attend ses healthchecks, lance `npm test` et publie les traces en artefact.
- [#22 · CI : refuser les actions non épinglées par SHA](journal/22-ci-refuser-actions-non-epinglees.md) : faire respecter l'épinglage des actions par SHA par un contrôle automatique sur chaque PR, et écrire la procédure pour trouver ce SHA.
- [#23 · CI : lancer npm run typecheck sur chaque PR](journal/23-ci-lancer-typecheck-pr.md) : ajouter un job qui lance `npm ci` puis `npm run typecheck` sur chaque PR, et fixer `.nvmrc` à une version exacte de Node.
- [#24 · /fiche-ticket : reporter une preuve obtenue après l'ouverture de la PR](journal/24-fiche-ticket-preuve-apres-pr.md) : écrire dans le skill `/fiche-ticket` comment traiter une preuve qui n'existe qu'une fois la PR ouverte.
- [#46 · Tests de la référence d'archivage en échec après npm run oracle](journal/46-sel-perime-apres-oracle.md) : faire échouer les tests de la référence d'archivage avec un message qui dit de relancer `npm run stack:up` quand le sel est périmé, au lieu d'un écart de HMAC.
- [#52 · Environnement de l'agent : Node de .nvmrc à l'ouverture de session, commentaires lus par /fiche-ticket, rappel du sel après l'oracle, dossier des sondes](journal/52-environnement-agent-session.md) : régler par de petits changements d'environnement quatre difficultés relevées à la rétro de l'étape 2, sans toucher au legacy ni à la mesure.
- [#53 · Contrôle des résultats d'oracle versionnés : arbre propre, Node de .nvmrc, sel tiré, commit connu, aucun chemin machine](journal/53-controle-resultats-oracle-versionnes.md) : faire refuser par `npm test` tout résultat d'oracle versionné qui viole l'une des cinq règles, avec un message qui nomme le fichier et la règle.
- [#54 · Contrôle des preuves dans le plan de test des PR : chaque case cochée chiffrée cite un commit ou une exécution de CI](journal/54-controle-preuves-plan-test.md) : faire échouer le job « Fiche de formation » sur une case cochée chiffrée du plan de test qui ne cite ni commit ni exécution de la CI.
- [#76 · CI : réduire la consommation de minutes](journal/76-ci-reduire-consommation-minutes.md) : annuler l'exécution remplacée par un nouveau commit, ignorer les jobs lourds quand seul `docs/**` a changé depuis leur dernier succès, et ne lancer `proof` que si la PR touche ce qu'il prouve.
- [#83 · CI : ignorer les jobs lourds d'une PR qui ne touche que docs/**](journal/83-ignorer-jobs-pr-docs.md) : ignorer `tests` et `oracle` dès le premier commit d'une PR dont le diff complet ne touche que `docs/**`.
- [#90 · Tests du verrou du banc : course entre bench-lock-tools.test.ts et refused-usage.test.ts](journal/90-course-tests-verrou-banc.md) : supprimer la course entre deux fichiers de test lancés en parallèle par Vitest, qui faisait échouer `npm test` par intermittence.
- [#92 · Verrou du banc : un verrou pris dans un worktree n'est pas vu depuis un autre](journal/92-verrou-banc-commun-worktrees.md) : placer le verrou du banc dans le dossier d'état de l'utilisateur, commun à toutes les copies du dépôt, comme l'est la pile.
- [#94 · Verrou du banc : npm test ne le tient pas pendant qu'il utilise la pile](journal/94-npm-test-tient-verrou.md) : faire tenir le verrou du banc à `npm test` du début à la fin, y compris sur échec et sur interruption.
- [#96 · Contrôle des preuves du plan de test : reconnaître un SHA par l'existence du commit, pas par son mélange de lettres et de chiffres](journal/96-sha-reconnu-existence-commit.md) : reconnaître un SHA cité dans le plan de test en vérifiant avec Git qu'il désigne un commit réel du dépôt.
- [#102 · La mesure doit tourner contre une pile construite depuis son propre commit](journal/102-pile-construite-propre-commit.md) : faire refuser à la mesure, à l'oracle et à l'étalonnage une pile dont les images ne viennent pas de leur propre copie du dépôt.

## Parcours de lecture

### Étape 1 · Application legacy de test

1. **[#2](journal/2-squelette-legacy-basic.md), seule et en premier.** Elle
   introduit le socle utilisé par toutes les autres fiches : authentification
   `BASIC`, realm Tomcat, `struts-config.xml`, build Maven et Docker,
   healthcheck Compose, Vitest et `fetch`.
2. **[#3](journal/3-jeu-donnees-recherche-dossiers.md) puis
   [#4](journal/4-validation-focus-recherche.md), ensemble.** Elles
   construisent le même écran, la recherche de dossiers. #3 introduit
   `ActionForm`, `Action`, les balises `html`, `bean`, `logic` et Jackson. #4
   s'appuie sur `<html:form>` pour ajouter Struts Validator, `<html:errors/>`
   et l'attribut `focus`.
3. **[#5](journal/5-fiche-dossier.md).** Elle réutilise Struts Validator (#4)
   avec `required` et `maxlength`, et ajoute ce qui touche au clavier :
   `readonly`, `tabindex`, `preventDefault`, ainsi que Post/Redirect/Get.
4. **[#6](journal/6-remise-horloge-figee.md).** Elle suit le dossier de la
   fiche (#5) jusqu'à sa remise. Elle introduit les rôles
   (`isUserInRole`, attribut `roles`, `AuthorizeAction`), l'horloge figée,
   le fichier `.env` de Compose et le statut HTTP 409.
5. **[#7](journal/7-service-archivage-accuse-remise.md) puis
   [#8](journal/8-api-interne-port-8081.md), ensemble.** Elles ajoutent les
   services autour du legacy et leur isolation réseau. #7 introduit les
   scriptlets JSP, `System.getenv` et le réseau Compose `internal: true`. #8
   s'appuie sur ce réseau (un service Compose sur deux réseaux), sur Jackson
   (#3) et sur le statut 409 (#6), et introduit le connecteur Tomcat et le
   filtre de servlet.

### Entre les étapes 1 et 2 · Outillage de la CI

Ces fiches ne relèvent d'aucune étape du plan, mais l'étape 2 s'appuie sur
elles : les lire après l'étape 1.

1. **[#10](journal/10-ci-figer-environnement-execution.md) puis
   [#22](journal/22-ci-refuser-actions-non-epinglees.md), ensemble.** #10
   introduit les labels de runner et l'épinglage d'une action par SHA ; #22
   fait respecter cet épinglage et ajoute les commandes de workflow
   (`::error`).
2. **[#23](journal/23-ci-lancer-typecheck-pr.md).** Elle introduit
   `actions/setup-node`, `npm ci`, `tsc --noEmit` et le script `pretest`.
3. **[#20](journal/20-ci-npm-test-pile-docker.md).** Elle s'appuie sur le
   typecheck de #23 et introduit `docker compose up --wait`,
   `actions/upload-artifact` et `if: always()`.
4. **[#24](journal/24-fiche-ticket-preuve-apres-pr.md).** Elle s'appuie sur
   les exécutions de la CI des fiches précédentes et introduit le head SHA
   d'une exécution et le mot « exécution de la CI », distinct de « run ».

### Étape 2 · Oracle

1. **[#32](journal/32-fil-traceur-npm-run-oracle.md), seule et en premier.**
   Elle introduit le socle de tout l'oracle : fixtures Playwright,
   `httpCredentials`, HAR, traces, `test.step` et annotations, reporter JSON,
   et `docker compose up --force-recreate`.
2. **[#33](journal/33-reference-archivage-accuse-remise.md) puis
   [#46](journal/46-sel-perime-apres-oracle.md), ensemble.** #33 introduit
   le HMAC, `crypto.createHmac`, la fusion de fichiers Compose et
   `GITHUB_ENV` ; elle s'appuie sur l'accusé de remise du legacy (#7). #46
   s'appuie sur #32 et #33 : elle explique pourquoi le sel tiré par
   `npm run oracle` périme celui de `npm test`.
3. **[#34](journal/34-scenarios-recherche.md).** Premiers scénarios
   ajoutés au fil traceur. Elle s'appuie sur les règles de `validation.xml`
   de #4 et introduit `expect.poll`, `selectOption` et le `LockOutRealm`.
4. **[#35](journal/35-scenarios-fiche-enregistrement-ctrl-s.md) puis
   [#36](journal/36-scenarios-fiche-validation-verrou.md), ensemble.** Elles
   couvrent le même écran, la fiche (#5). #35 introduit `defaultPrevented`,
   `page.exposeFunction`, `framenavigated` et les outils de navigation
   réutilisés ensuite. #36 introduit `readonly`, `disabled`,
   `aria-readonly`, l'état « éditable » de Playwright et les variantes
   observées.
5. **[#37](journal/37-scenarios-remise-recapitulatif-remise.md) puis
   [#38](journal/38-scenarios-remise-accuse-remise.md), ensemble.** Elles
   couvrent l'écran de remise (#6). #37 reprend l'état « éditable » de #36
   et ajoute les boîtes de dialogue et le mode strict des localisateurs.
   #38 reprend `framenavigated` (#35) et le HMAC (#33), et ajoute les
   téléchargements, les nouveaux onglets et `Promise.race`.
6. **[#39](journal/39-cinq-executions-job-ci-oracle.md), en dernier.** Elle
   clôt l'étape. Elle s'appuie sur `actions/upload-artifact` (#20) et
   `GITHUB_ENV` (#33), et introduit le déclencheur `pull_request` et son
   commit de fusion, `GITHUB_RUN_ID` et `GITHUB_RUN_ATTEMPT`.

### Entre les étapes 2 et 3 · Environnement de l'agent et contrôle des preuves

Ces fiches viennent de la rétro de l'étape 2. L'étape 3 s'appuie sur elles :
les lire après l'étape 2.

1. **[#52](journal/52-environnement-agent-session.md).** Elle s'appuie sur
   le sel périmé de #46 et sur `npm run oracle` (#32). Elle introduit le hook
   `SessionStart`, `nvm` et `.nvmrc`, la résolution des paquets par Node et
   la couture testable.
2. **[#53](journal/53-controle-resultats-oracle-versionnes.md) puis
   [#54](journal/54-controle-preuves-plan-test.md), ensemble.** Deux
   contrôles automatiques de la règle « une preuve cite l'état exact ». #53
   introduit la fusion en squash, `git cat-file -e`, `fetch-depth`, l'union
   discriminée et le test négatif d'une porte. #54 reprend les commandes de
   workflow (#22) et ajoute les listes de tâches en Markdown,
   `process.exitCode` et les mots-clés de fermeture de GitHub.

### Étape 3 · Contrat de candidat et runner

1. **[#62](journal/62-fil-traceur-mesure-diagnostic.md), seule et en
   premier.** Elle introduit le socle de toute mesure : montage d'un dossier
   de l'hôte, options de `docker run`, image épinglée par empreinte,
   configuration de npm par variables d'environnement, `rawHeaders` et
   `util.parseArgs`. Elle reprend la fusion de fichiers Compose (#33) et
   `npm ci` (#23).
2. **[#63](journal/63-verdict-codes-sortie-jamais-disponible.md).** Elle
   classe les mesures du fil traceur. Elle s'appuie sur l'union discriminée
   (#53) et introduit `as const`, les types mappés, `satisfies`, `Exclude` et
   les codes de sortie de Node.
3. **[#76](journal/76-ci-reduire-consommation-minutes.md) puis
   [#83](journal/83-ignorer-jobs-pr-docs.md), ensemble (hors étape).** Elles
   allègent la CI pendant l'étape. #76 introduit les groupes de concurrence,
   les conditions de job, le filtre `paths`, `needs`, les sorties de job et
   `git merge-base --is-ancestor`. #83 ajoute le diff à trois points et
   reprend le commit de fusion d'une PR (#39).
4. **[#64](journal/64-contrat-candidat-schema-sources.md) puis
   [#65](journal/65-construction-delais-limites-registre.md), ensemble.**
   Elles couvrent les phases 2 et 3 d'une mesure. #64 introduit JSON Schema,
   Ajv et le `package-lock.json`. #65 reprend la configuration de npm (#62)
   et ajoute le journal de npm, `--ignore-scripts`, les scripts
   d'installation et les limites d'un conteneur.
5. **[#69](journal/69-verrou-du-banc.md), puis
   [#90](journal/90-course-tests-verrou-banc.md) et
   [#92](journal/92-verrou-banc-commun-worktrees.md) (hors étape).** #69
   introduit le verrou du banc : création exclusive, identité d'un processus,
   `pgrep -f`, scripts `pre` de npm. #90 et #92 le corrigent : #90 introduit
   le parallélisme des fichiers de Vitest et `sequence.groupOrder`, #92 le
   worktree, le nom de projet Compose et le dossier d'état XDG.
6. **[#72](journal/72-candidat-etalonnage-migrabench-calibrate.md).** Elle
   remplace les valeurs provisoires de #65, sous le verrou du banc (#69).
   Elle reprend le filtre `paths` (#76) et introduit cgroup v2,
   `docker run --cpus` et `workflow_dispatch`.
7. **[#70](journal/70-fidelite-relais-reference.md).** Elle reprend
   `rawHeaders` (#62) et les écrans du legacy (#3, #5, #8), et introduit les
   en-têtes hop-by-hop, la réécriture d'URL par la session et les
   redirections de Tomcat.
8. **[#96](journal/96-sha-reconnu-existence-commit.md) (hors étape) puis
   [#73](journal/73-mesure-comptee-controle-versionne.md), ensemble.** Elles
   relient une preuve à un commit réel. #96 corrige le contrôle de #54 et
   reprend `fetch-depth` (#53) ; elle introduit `git rev-parse --verify`, le
   clone superficiel et les têtes de PR. #73 étend le contrôle de #53 à la
   mesure prévue pour compter et introduit l'ascendance d'un commit, la
   refspec de `git fetch` et le dépôt nu.
9. **[#66](journal/66-isolation-candidat-sonde.md).** Elle reprend les
   limites d'un conteneur (#65) et introduit les capacités Linux,
   `no-new-privileges`, les sockets Unix et le conteneur sans réseau.
10. **[#67](journal/67-journal-acces-marqueur-temoins.md).** Elle reprend le
    montage d'un dossier de l'hôte (#62) et `sequence.groupOrder` (#90), et
    introduit les valves de Tomcat, `globalSetup` et `provide`/`inject` de
    Vitest.
11. **[#94](journal/94-npm-test-tient-verrou.md) puis
    [#102](journal/102-pile-construite-propre-commit.md), ensemble (hors
    étape).** Elles ferment deux trous révélés par #67. #94 fait tenir le
    verrou du banc (#69) à `npm test` et introduit les groupes de processus,
    `detached` et les événements de signal de Node. #102 s'appuie sur les
    worktrees (#92) et introduit le contexte de construction, les labels
    posés par Compose et `docker inspect`.
12. **[#68](journal/68-pannes-pile-erreurs-runner.md).** Elle complète le
    verdict (#63). Elle reprend `docker compose up --wait` (#20), le
    healthcheck (#2) et `docker inspect` (#102), et introduit le code `125`
    de `docker run`, `COMPOSE_FILE` et `outputDir`.
13. **[#71](journal/71-mesure-interrompue.md).** Elle reprend les signaux et
    les groupes de processus (#94), et introduit `AsyncLocalStorage`, les
    signaux du shell, l'annulation d'un job et le renommage atomique.
14. **[#74](journal/74-critere-fin-mesure-comptee.md), en dernier.** Elle
    clôt l'étape en faisant produire sur une vraie pile chaque issue des
    fiches précédentes. Elle introduit le clone complet, `exec`, le délai
    d'une étape, le résumé d'un job et le nombre de workers de Playwright.

## Rétros

- **Étape 1 · Application legacy de test** : pas de rétro écrite.
- **Étape 2 · Oracle** : le « Constat » de l'issue
  [#52](https://github.com/karAmmi12/migrabench/issues/52).
- **Étape 3 · Contrat de candidat et runner** :
  [`retros/etape-3.md`](retros/etape-3.md).
