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

### Hors étape

- [#10 · CI : figer l'environnement d'exécution](journal/10-ci-figer-environnement-execution.md) : figer le runner et les actions de la CI pour qu'elle parte du même état à chaque exécution.
- [#20 · CI : exécuter npm test avec la pile Docker](journal/20-ci-npm-test-pile-docker.md) : ajouter un workflow qui construit la pile Docker, attend ses healthchecks, lance `npm test` et publie les traces en artefact.
- [#22 · CI : refuser les actions non épinglées par SHA](journal/22-ci-refuser-actions-non-epinglees.md) : faire respecter l'épinglage des actions par SHA par un contrôle automatique sur chaque PR, et écrire la procédure pour trouver ce SHA.
- [#23 · CI : lancer npm run typecheck sur chaque PR](journal/23-ci-lancer-typecheck-pr.md) : ajouter un job qui lance `npm ci` puis `npm run typecheck` sur chaque PR, et fixer `.nvmrc` à une version exacte de Node.
- [#24 · /fiche-ticket : reporter une preuve obtenue après l'ouverture de la PR](journal/24-fiche-ticket-preuve-apres-pr.md) : écrire dans le skill `/fiche-ticket` comment traiter une preuve qui n'existe qu'une fois la PR ouverte.
- [#46 · Tests de la référence d'archivage en échec après npm run oracle](journal/46-sel-perime-apres-oracle.md) : faire échouer les tests de la référence d'archivage avec un message qui dit de relancer `npm run stack:up` quand le sel est périmé, au lieu d'un écart de HMAC.

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
