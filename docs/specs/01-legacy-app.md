---
etape: 1
titre: Application legacy de test
statut: ready-for-agent
sources: PROTOCOL.md, docs/PLAN.md (étape 1), GLOSSARY.md, fixtures/legacy-app/TRAPS.md, ADR 0001, 0003, 0004
---

# Spec — Étape 1 : application legacy de test

## Problème

Le banc doit comparer des candidats produits par des agents IA, mais il n'a
encore rien à migrer. Sans legacy de référence, l'oracle de l'étape 2 n'a
rien contre quoi s'écrire, les portes n'ont pas de test négatif pour les
pièges à corriger, et la règle 1 du protocole (même état initial pour tous
les outils) ne peut pas être tenue. Il faut une application Struts 1 / JSP
réaliste et petite, avec des pièges volontaires, qui démarre à l'identique à
chaque fois et dont l'API interne n'est joignable que par la couche serveur
du candidat.

## Solution

Une application Struts 1.3.10 + JSP en UTF-8 (Java 8, Maven, Tomcat 9),
livrée dans Docker avec un service d'archivage simulé. `docker compose up`
sert trois écrans (recherche de dossiers, fiche dossier, remise) sur le port
`8080`, et une API interne JSON minimale sur le port `8081`, sur le réseau
`mb-internal` seulement. Le jeu de données est fictif, versionné, chargé en
mémoire au démarrage et remis à zéro par redémarrage. L'horloge est figée
par le banc. Deux utilisateurs fixes, un agent et un instructeur, sont
authentifiés en `BASIC` par Tomcat. Six pièges sont plantés et documentés
dans `TRAPS.md`, chacun avec le comportement observable qui le rend
mesurable.

## User stories

### Mainteneur du banc

1. En tant que mainteneur du banc, je veux lancer tout le legacy avec `docker compose up`, pour que chaque run parte du même état initial.
2. En tant que mainteneur du banc, je veux que le legacy soit en Java 8, Struts 1.3.10, Maven et Tomcat 9, pour qu'il ressemble aux applications réellement migrées.
3. En tant que mainteneur du banc, je veux que le modèle et le service métier soient séparés des actions et des JSP, pour que l'API interne et les écrans appliquent les mêmes règles.
4. En tant que mainteneur du banc, je veux un jeu de données versionné dans un fichier JSON lu par Jackson, pour que son contenu soit relu en revue.
5. En tant que mainteneur du banc, je veux que le jeu de données soit rechargé à chaque démarrage, pour le remettre à zéro par un simple redémarrage, sans endpoint `reset`.
6. En tant que mainteneur du banc, je veux une horloge figée transmise au legacy, pour que les dates de remise soient reproductibles.
7. En tant que mainteneur du banc, je veux qu'un test vérifie qu'aucun dossier réservé n'est partagé entre deux scénarios ou portes, pour éviter les interférences entre écritures.
8. En tant que mainteneur du banc, je veux qu'un test vérifie que l'API interne est refusée sur le port `8080`, pour qu'aucun front ne contourne la couche serveur du candidat.
9. En tant que mainteneur du banc, je veux que seuls trois ports soient publiés sur l'hôte (JSP du legacy, service d'archivage, candidat), pour que la topologie de l'ADR 0004 soit tenue.
10. En tant que mainteneur du banc, je veux que les utilisateurs soient décrits dans un fichier versionné qui génère `tomcat-users.xml`, pour que le legacy et la couche serveur du candidat partagent les mêmes identités.
11. En tant que mainteneur du banc, je veux que chaque piège soit documenté dans `TRAPS.md` avec sa famille et sa mesure, pour qu'aucun piège ne soit corrigé par erreur.
12. En tant que mainteneur du banc, je veux que les versions du legacy restent figées, pour qu'il reste un vrai legacy.
13. En tant que mainteneur du banc, je veux que la valeur témoin soit injectée par l'environnement (`ARCHIVE_TOKEN`), pour pouvoir la rechercher plus tard côté navigateur.

### Agent (rôle métier)

14. En tant qu'agent, je veux rechercher des dossiers par numéro exact, pour retrouver un dossier connu.
15. En tant qu'agent, je veux rechercher par demandeur avec « contient », sans tenir compte de la casse, pour retrouver un dossier à partir d'un nom partiel.
16. En tant qu'agent, je veux que la recherche par demandeur tienne compte des accents, pour que « Élodie » et « Elodie » restent distincts, comme dans le legacy.
17. En tant qu'agent, je veux filtrer par statut (Tous par défaut, Brouillon, En instruction, Remis), pour cibler les dossiers à traiter.
18. En tant qu'agent, je veux filtrer par date de dépôt « du » et « au », bornes incluses et chacune facultative, pour retrouver les dossiers d'une période.
19. En tant qu'agent, je veux que les critères se combinent en ET, pour affiner une recherche.
20. En tant qu'agent, je veux qu'un formulaire vide renvoie tous les dossiers, pour parcourir le portefeuille.
21. En tant qu'agent, je veux des résultats triés par numéro et sans pagination, pour lire la liste dans un ordre stable.
22. En tant qu'agent, je veux voir « Aucun dossier ne correspond à vos critères. », sans tableau, quand rien ne correspond, pour savoir que la recherche a abouti.
23. En tant qu'agent, je veux que le numéro de chaque ligne soit un lien vers la fiche, pour ouvrir un dossier en un clic.
24. En tant qu'agent, je veux qu'un numéro mal formé, une date mal formée ou une date « au » antérieure à « du » soient refusés avec un message, pour corriger ma saisie.
25. En tant qu'agent, je veux que le formulaire garde mes valeurs après une erreur de validation, pour ne pas tout ressaisir.
26. En tant qu'agent, je veux que le focus soit sur « Numéro » à l'ouverture de la recherche, pour taper tout de suite.
27. En tant qu'agent, je veux modifier le demandeur et l'objet d'un dossier `BROUILLON`, pour compléter un dossier en préparation.
28. En tant qu'agent, je veux que le demandeur soit verrouillé (`readonly`) sur un dossier `EN_INSTRUCTION`, pour ne pas changer l'identité d'un dossier en cours d'instruction.
29. En tant qu'agent, je veux que tout soit verrouillé et le bouton Enregistrer absent sur un dossier `REMIS`, pour ne pas modifier un dossier transmis.
30. En tant qu'agent, je veux enregistrer avec `Ctrl+S`, pour travailler au clavier.
31. En tant qu'agent, je veux que `Ctrl+S` n'ait aucun effet sur un dossier `REMIS` et n'ouvre pas la boîte d'enregistrement du navigateur, pour ne pas être interrompu.
32. En tant qu'agent, je veux que le focus soit sur « Objet » à l'ouverture de la fiche et que la tabulation suive Objet → Demandeur → Enregistrer, pour saisir dans l'ordre de travail habituel.
33. En tant qu'agent, je veux qu'un demandeur ou un objet vide ou trop long soit refusé avec un message, pour ne pas enregistrer un dossier invalide.
34. En tant qu'agent, je veux un lien « Remise » sur la fiche d'un dossier `EN_INSTRUCTION` ou `REMIS`, pour accéder à l'écran de remise.
35. En tant qu'agent, je veux voir « Remise réservée aux instructeurs » sur un dossier `EN_INSTRUCTION`, pour comprendre pourquoi je ne peux pas le remettre.
36. En tant qu'agent, je veux voir « Ce dossier ne peut pas être remis » sur un dossier `BROUILLON`, pour savoir qu'il n'est pas prêt.

### Instructeur

37. En tant qu'instructeur, je veux voir un récapitulatif en lecture seule du dossier sur l'écran de remise, pour vérifier ce que je remets.
38. En tant qu'instructeur, je veux un bouton « Remettre » sur un dossier `EN_INSTRUCTION`, qui remet sans confirmation et revient au même écran, pour enchaîner les remises.
39. En tant qu'instructeur, je veux voir « Dossier remis le jj/mm/aaaa » après la remise, pour en garder la trace.
40. En tant qu'instructeur, je veux un lien « Accusé de remise » sur un dossier `REMIS`, qui ouvre le document délivré par le service d'archivage, pour prouver la remise. Le lien est visible pour tous les rôles, agent compris : c'est une consultation, pas une action.

### Couche serveur du candidat (consommatrice de l'API interne)

41. En tant que couche serveur du candidat, je veux rechercher par l'API interne avec la même sémantique que l'écran 1, pour reproduire la recherche sans analyser de HTML.
42. En tant que couche serveur du candidat, je veux lire, modifier et remettre un dossier par l'API interne, pour couvrir les trois écrans.
43. En tant que couche serveur du candidat, je veux que l'API interne refuse la modification d'un champ verrouillé et la remise d'un `BROUILLON`, pour que les règles métier restent au legacy.
44. En tant que couche serveur du candidat, je veux joindre l'API interne et le service d'archivage par `mb-internal`, pour ne rien exposer au navigateur.

### Rédacteur de l'oracle et des portes (étapes 2 et 4)

45. En tant que rédacteur de l'oracle, je veux des libellés et des rôles accessibles stables sur chaque champ et bouton, pour écrire des sélecteurs sémantiques.
46. En tant que rédacteur de l'oracle, je veux que chaque scénario qui écrit dispose de dossiers réservés à partir de `D-0101`, pour éviter les relances et les interférences.
47. En tant que rédacteur de l'oracle, je veux environ 30 dossiers partagés en lecture (`D-0001` à `D-0030`), à peu près un tiers par statut, pour tester les filtres.
48. En tant que rédacteur de l'oracle, je veux des dates de dépôt sur environ 18 mois avant l'horloge figée, dont deux dossiers déposés le même jour, pour tester les bornes incluses.
49. En tant que rédacteur de l'oracle, je veux des demandeurs avec accents, apostrophes et guillemets, pour tester l'encodage et la recherche.
50. En tant que rédacteur de l'oracle, je veux les messages d'erreur exacts dans `ApplicationResources.properties`, pour vérifier leur texte.
51. En tant que rédacteur des portes, je veux que chaque piège à corriger fasse échouer le legacy de façon observable, pour que le legacy serve de test négatif (ADR 0001).

## Décisions d'implémentation

### Modules

- **Modèle et service métier** (Java) : dossier, statut, recherche, lecture,
  modification sous verrou, remise. Seul endroit où vivent les règles
  métier. Pas de contrôle de rôle, pas de règle de `validation.xml`.
- **Chargeur du jeu de données** : lit le fichier JSON au démarrage via
  Jackson, en mémoire. Aucune persistance.
- **Horloge** : `java.time.Clock` injectée dans le service, figée par la
  variable d'environnement `FROZEN_DATE` fournie par le banc. Toute date de
  remise en provient.
- **Actions Struts et JSP** : trois écrans, `ActionForm` sans `validate()`,
  validation déclarée seulement dans `validation.xml`.
- **API interne** : quatre endpoints JSON (rechercher, lire, modifier,
  remettre), qui délèguent au service métier. Elle ignore l'identité de
  l'appelant.
- **Filtre par port** : pièce du banc, ni piège ni comportement à migrer.
  Refuse toute requête vers l'API interne qui n'arrive pas par `8081`.
- **Service d'archivage simulé** : un fichier, une route. Délivre l'accusé
  de remise si le jeton présenté est égal à `ARCHIVE_TOKEN`, et le refuse
  sinon.
- **Fichier des utilisateurs** : versionné, deux entrées (un agent, un
  instructeur), source de `tomcat-users.xml` et de `USERS_FILE` pour la
  couche serveur du candidat.
- **Composition Docker** : réseau `mb-internal` (port `8081` du legacy,
  service d'archivage, future couche serveur du candidat) ; trois ports
  publiés sur l'hôte.

### Écrans

**1. Recherche de dossiers**

- Critères en ET : numéro (égalité exacte) ; demandeur (« contient »,
  `toLowerCase(Locale.ROOT)` des deux côtés, sensible aux accents) ; statut
  (« Tous » par défaut) ; déposé du / au (bornes incluses, facultatives).
- Tri par numéro, sans pagination. Formulaire vide : tous les dossiers.
- Tableau `<logic:iterate>` avec `<th>`, imbriqué dans la mise en page.
  Sans résultat : message « Aucun dossier ne correspond à vos critères. »
  et aucun tableau de données.
- Numéro de chaque ligne : lien vers la fiche. Erreurs par `<html:errors/>`.

**2. Fiche dossier**

- Formulaire d'édition (demandeur, objet) en `<html:text>`.
- Verrou par statut, rendu avec `readonly` et appliqué aussi côté serveur
  (action et API interne) :

  | Statut | Demandeur | Objet | Enregistrer | `Ctrl+S` |
  |---|---|---|---|---|
  | `BROUILLON` | modifiable | modifiable | présent | enregistre |
  | `EN_INSTRUCTION` | verrouillé | modifiable | présent | enregistre |
  | `REMIS` | verrouillé | verrouillé | absent | sans effet |

- Lien « Remise » si le statut est `EN_INSTRUCTION` ou `REMIS`.

**3. Remise**

- Récapitulatif en lecture seule, puis selon le statut et le rôle :
  - `EN_INSTRUCTION` et instructeur : bouton « Remettre », `POST` vers
    `RemiseAction`, sans confirmation, retour au même écran ;
  - `EN_INSTRUCTION` et agent : « Remise réservée aux instructeurs » ;
  - `REMIS` : « Dossier remis le jj/mm/aaaa » et lien « Accusé de remise »,
    pour tous les rôles ;
  - `BROUILLON` : « Ce dossier ne peut pas être remis ». L'action et l'API
    interne refusent la transition.

### Jeu de données

- Fictif, en français, avec accents, apostrophes et guillemets.
- `D-0001` à `D-0030` environ, partagés en lecture, répartis à peu près par
  tiers entre les trois statuts.
- Dossiers réservés à partir de `D-0101`, chacun déclaré dans le fichier
  avec le nom du scénario ou de la porte qui l'utilise. Un dossier réservé
  porte la charge XSS.
- Dates de dépôt sur environ 18 mois avant l'horloge figée, avec deux
  dossiers déposés le même jour.
- Les dossiers `REMIS` du jeu initial portent une date de remise.

### Pièges et comportement observable

Chaque piège est planté tel quel et documenté dans `TRAPS.md` (ADR 0001).

| Piège | Famille | Comportement observable sur le legacy |
|---|---|---|
| `<bean:write filter="false">` sur la colonne Demandeur de l'écran 1 | à corriger | La recherche dédiée au dossier réservé XSS exécute `<img src=x onerror="window.__mbXss=1">` : `window.__mbXss` vaut 1 après chargement. |
| `System.getenv("ARCHIVE_TOKEN")` dans un scriptlet de l'écran 3 | à corriger (face à préserver) | Le lien « Accusé de remise » contient `?jeton=<valeur témoin>` en clair dans le HTML et dans l'URL de la requête ; le service d'archivage délivre l'accusé. |
| Contrôle de rôle dans un scriptlet (`request.isUserInRole("instructeur")`) | à corriger | L'agent ne voit pas « Remettre », mais un `POST` vers `RemiseAction` avec les identifiants de l'agent fait passer le dossier à `REMIS`. |
| Règles seulement dans `validation.xml` | à préserver | Les règles de `TRAPS.md` (`mask`, `date`, `validwhen`, `required`, `maxlength`) refusent la saisie avec le texte exact de `ApplicationResources.properties` et gardent les valeurs. Aucune n'est appliquée par l'API interne. |
| `Ctrl+S`, `focus` initial et ordre de tabulation | à préserver | `Ctrl+S` (gestionnaire `onkeydown` écrit à la main, `preventDefault`, pas de `Cmd+S`) enregistre sur l'écran 2. Focus sur Numéro (écran 1) et Objet (écran 2) via l'attribut `focus` de `<html:form>`. Tabulation Objet → Demandeur → Enregistrer par `tabindex`, Demandeur avant Objet dans le DOM. |
| Mise en page en `<table>` imbriquées | à corriger | Sur les trois écrans, au moins deux niveaux de `<table>` imbriqués, sans `role="presentation"`. |

### Identité

- Authentification Tomcat `BASIC`, sans écran de connexion, deux rôles :
  agent et instructeur.

## Décisions de test

- **Ce qui fait un bon test ici** : il observe le legacy de l'extérieur,
  par HTTP ou par le fichier du jeu de données, jamais par ses classes Java.
  Les comportements fins des écrans et des pièges ne sont pas testés à
  cette étape : c'est l'oracle (étape 2) qui les mesure. Les tests de
  l'étape 1 vérifient ce que le banc suppose du legacy.
- **Outil** : Vitest, en TypeScript, avec `fetch`. Pas de test JUnit dans
  le legacy.
- **Seam A, HTTP contre la pile `docker compose up`** :
  - l'API interne répond sur `8081` (depuis `mb-internal`) et est refusée
    sur `8080` ;
  - les trois écrans répondent pour l'agent et pour l'instructeur, et
    refusent une requête sans identifiants ;
  - le service d'archivage délivre l'accusé avec le bon jeton et le refuse
    avec un jeton faux ou absent.
- **Seam B, lecture statique du jeu de données** :
  - aucun dossier réservé n'est associé à deux scénarios ou portes ;
  - les numéros sont uniques et au format `D-` suivi de quatre chiffres ;
  - les dossiers partagés couvrent les trois statuts et les réservés
    commencent à `D-0101`.
- **TDD** : chaque test est écrit rouge d'abord, avant la pièce qu'il couvre.
- **Antériorité** : aucune, c'est le premier code de test du dépôt. Ces
  tests posent la convention.

## Hors périmètre

- Les scénarios de l'oracle (étape 2), le runner et `candidate.json`
  (étape 3), les portes (étape 4).
- La couche serveur du candidat : la composition Docker lui réserve sa place
  sur `mb-internal`, mais aucun candidat n'est livré.
- Les extensions listées dans `TRAPS.md` : XSS injecté depuis l'écran 2,
  JSP en ISO-8859-1.
- Toute modernisation du legacy (versions, sécurité, accessibilité).
- Un endpoint `reset` dans l'API interne.

## Notes et questions ouvertes

- **Critère de fin** (`docs/PLAN.md`) : `docker compose up` sert les trois
  écrans et le service d'archivage avec le jeu de données fixe, et l'API
  interne n'est joignable que par le port `8081`. Les tests des seams A et B
  sont verts.
- Non tranché, à décider pendant l'implémentation et à noter dans la PR :
  le format JSON exact des quatre endpoints de l'API interne.
- Tranché par #7 : le service d'archivage est écrit en TypeScript, lancé par
  Node 22 (`--experimental-strip-types`) sans dépendance, sur le port `8090`
  publié sur `127.0.0.1:8090`. Sa route est
  `GET /accuse-de-remise?jeton=…&numero=…`. La valeur témoin `ARCHIVE_TOKEN`
  vaut `mbtemoin-7c41e9a2b58d306f`, fixée dans `.env` comme `FROZEN_DATE`.
- Tranché par #6 (PR #15) : l'horloge figée est la variable `FROZEN_DATE`
  (aaaa-mm-jj), qui vaut `2025-11-15`. Elle est fixée dans `.env`, versionné,
  que `docker compose` passe tel quel au legacy (`env_file`) et que lit le
  test du seam B. Sans elle, le legacy refuse de démarrer.
- Question reportée de `TRAPS.md` : garder le texte exact des messages
  d'erreur en stratégie Design System. Sans effet sur l'étape 1.
- Suite prévue par `docs/KICKOFF.md` : `/to-tickets` sur cette spec.
