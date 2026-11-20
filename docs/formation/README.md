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
