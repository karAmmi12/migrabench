# #3 · Étape 1 · 2. Jeu de données et recherche de dossiers

## Objectif

Le legacy servait une page vide. Ce ticket lui donne son jeu de données fixe
et son premier vrai écran : la recherche de dossiers. Les dossiers sont lus au
démarrage depuis un fichier JSON versionné, gardés en mémoire, et remis à zéro
par un redémarrage. L'écran plante deux pièges à corriger (`TRAPS.md`) : la
mise en page en `<table>` imbriquées et le XSS par
`<bean:write filter="false">`. Des tests du seam B vérifient ce que le banc
suppose du jeu de données, en particulier qu'aucun dossier réservé n'est
partagé entre deux scénarios ou portes.

## Notions à connaître

- **`ServletContextListener`** : une classe déclarée dans `web.xml` que le
  conteneur appelle au démarrage et à l'arrêt de l'application. Le legacy s'en
  sert pour charger le jeu de données une seule fois. —
  [Java EE 5 : ServletContextListener](https://docs.oracle.com/javaee/5/api/javax/servlet/ServletContextListener.html)
- **Jackson (`jackson-databind`)** : bibliothèque Java qui transforme du JSON
  en objets. `ObjectMapper.readValue` remplit des champs publics qui portent le
  même nom que les clés, et refuse par défaut une clé inconnue. —
  [jackson-databind](https://github.com/FasterXML/jackson-databind)
- **`ActionForm` et `Action` de Struts 1** : l'`ActionForm` reçoit les
  paramètres de la requête par ses setters. L'`Action` exécute le traitement et
  choisit une suite (`findForward`). Le lien entre les deux est déclaré dans
  `struts-config.xml` (`<form-bean>`, `<action name=…>`). —
  [DTD struts-config 1.3](https://struts.apache.org/dtds/struts-config_1_3.dtd)
- **Balises Struts `html`, `bean`, `logic`** : `<html:form>`, `<html:text>`,
  `<html:select>` génèrent le formulaire et gardent les valeurs saisies.
  `<logic:iterate>` parcourt une liste. `<bean:write>` affiche une propriété en
  échappant le HTML, sauf avec `filter="false"`. —
  [Struts 1 : documentation des taglibs](https://struts.apache.org/1.x/struts-taglib/)
  > À vérifier : l'adresse de la documentation Struts 1 archivée n'a pas été ouverte pendant la session.
- **XSS (cross-site scripting)** : du HTML fourni par un utilisateur est
  inséré sans échappement dans la page, et le navigateur l'exécute. Ici, la
  charge `<img src=x onerror="…">` se lance quand l'image `x` ne se charge pas. —
  [OWASP : Cross Site Scripting](https://owasp.org/www-community/attacks/xss/)
- **`toLowerCase(Locale.ROOT)`** : met en minuscules sans dépendre de la
  langue de la machine. « É » devient « é », jamais « e » : la recherche reste
  sensible aux accents. —
  [Java 8 : String.toLowerCase(Locale)](https://docs.oracle.com/javase/8/docs/api/java/lang/String.html#toLowerCase-java.util.Locale-)
- **`DateTimeFormatter` en mode `STRICT`** : un motif `dd/MM/uuuu` refuse les
  dates impossibles comme le 31/02. —
  [Java 8 : ResolverStyle](https://docs.oracle.com/javase/8/docs/api/java/time/format/ResolverStyle.html)
- **Message d'assertion Vitest** : `expect(valeur, "message")` ajoute un
  message à l'échec, ici le numéro du dossier fautif. —
  [Vitest : expect](https://vitest.dev/api/expect.html)

## Ce qui a été construit

- `fixtures/legacy-app/src/main/resources/dossiers.json` : le jeu de
  données.
  - 30 dossiers partagés, `D-0001` à `D-0030`, dix par statut. Les
    demandeurs ont des accents, des apostrophes et des guillemets, par
    exemple `Société "Bâtir Ensemble"` ou `Noël d'Arcy`. « Élodie Marchand »
    et « Elodie Fontaine » coexistent, pour tester la sensibilité aux accents.
  - Les dépôts vont du 06/05/2024 au 27/10/2025. `D-0012` et `D-0019` sont
    déposés le même jour (14/02/2025). Les dossiers `REMIS` portent une date
    de remise.
  - Un dossier réservé, `D-0101`, porte la charge XSS dans son demandeur.
    `reservations` l'associe à la porte XSS : `"gate:xss": ["D-0101"]`.
- `tests/seam-b/dataset.test.ts` : les tests du seam B. Ils lisent le fichier
  sans démarrer le legacy et vérifient cinq points :
  - les numéros sont uniques, au format `D-` suivi de quatre chiffres ;
  - les dossiers partagés vont de `D-0001` à `D-0030` et couvrent les trois
    statuts ;
  - les dossiers réservés commencent à `D-0101` ;
  - chaque dossier réservé appartient à exactement un scénario ou une porte ;
  - les réservations ne citent que des dossiers réservés qui existent.
- Java, sous `fixtures/legacy-app/src/main/java/fr/migrabench/legacy/` :
  - `model/` : `Dossier`, `Status` (avec son libellé : Brouillon, En
    instruction, Remis), `SearchCriteria` ;
  - `service/DossierService` : la recherche. C'est le seul endroit où vivent
    les règles métier. L'API interne (#8) passera aussi par lui ;
  - `data/DatasetLoader` : lit `dossiers.json` dans le classpath avec Jackson ;
  - `web/DossierServiceListener` : charge le jeu au démarrage et publie le
    service dans le contexte de l'application ;
  - `web/SearchForm`, `web/SearchAction` : le formulaire et l'action de
    l'écran 1. Le formulaire n'a pas de `validate()`, comme l'exige
    `TRAPS.md` ;
  - `web/SearchResultRow` : une ligne du tableau prête à afficher (libellé du
    statut, date au format `jj/mm/aaaa`).
- `struts-config.xml` : `/recherche.do` affiche le formulaire seul, et
  `/rechercher.do` affiche le formulaire et les résultats.
- `web.xml` : déclare le listener.
- `pom.xml` : ajoute `jackson-databind`.
- `WEB-INF/jsp/recherche.jsp` : l'écran 1.
  - Champs Numéro, Demandeur, Statut, Déposé du, Déposé au, chacun avec un
    `<label for>`, et le bouton Rechercher.
  - Résultats en `<logic:iterate>` avec des `<th>`.
  - Les deux pièges, chacun marqué d'un commentaire « Ne pas corriger ».
- `fixtures/legacy-app/TRAPS.md` : précise le dossier `D-0101`, sa recherche
  dédiée, et l'imbrication des tableaux sur l'écran 1.

## Les choix faits et pourquoi

- **Le jeu de données est une ressource du classpath**, empaquetée dans le
  war. Il est donc relu à chaque démarrage, sans volume Docker ni chemin à
  configurer. Un fichier monté au lancement a été écarté, parce que le
  `Dockerfile` ne copie déjà que `src/`.
- **Les clés JSON sont en anglais, les valeurs métier en français**
  (`"status": "REMIS"`). Cela suit `CLAUDE.md` (identifiants en anglais) et la
  convention déjà prise par `fixtures/users.json` (`"role": "agent"`).
- **Les réservations sont une table « scénario ou porte → numéros »**, plutôt
  qu'un champ sur chaque dossier. Avec un champ texte par dossier, un dossier
  ne pourrait pas avoir deux propriétaires, et le test « aucun dossier réservé
  associé à deux scénarios ou portes » réussirait par construction. Avec la
  table, il peut échouer pour de bon (voir Difficultés).
- **Un seul dossier réservé, `D-0101`.** Les dossiers réservés des scénarios
  de remise et de la porte de rôle sont ajoutés par #6, comme le prévoit cette
  issue. Les créer maintenant obligerait à deviner des noms de scénarios qui
  n'existent pas encore.
- **Une recherche vide affiche aussi `D-0101`**, donc exécute la charge.
  C'est conforme à « un formulaire vide renvoie tous les dossiers ». La
  relecture l'a signalé, et l'humain a accepté ce comportement en gardant la
  mention dans `TRAPS.md`.
- **La recherche passe en `GET`, sur deux actions.** `/recherche.do` affiche
  le formulaire sans résultats, et `/rechercher.do` cherche. On distingue ainsi
  l'ouverture de l'écran d'une recherche vide. Le `GET` donne aussi une URL
  pour la recherche dédiée (`?number=D-0101`), et Tomcat 9 y décode l'UTF-8 par
  défaut. Le `POST` a été écarté, parce qu'il aurait demandé un filtre
  d'encodage pour les accents.
- **`SearchResultRow` entre le modèle et la JSP.** Le format `jj/mm/aaaa` est
  un choix d'affichage, alors le modèle garde une `LocalDate`. La relecture a
  noté que trois de ses getters ne font que relayer `Dossier`. On l'a gardé
  quand même : il formate la date et le libellé du statut.
- **Une date mal formée ou un statut inconnu sont ignorés** par
  `SearchAction`. La validation de l'écran (`validation.xml`) appartient au
  ticket #4, et elle refusera ces saisies avant l'action. D'ici là, une date
  mal formée élargit les résultats au lieu d'être refusée. La relecture l'a
  noté.
- **`jackson-databind` 2.12.7.1.** La spec impose Jackson. Cette version
  tourne sous Java 8 et corrige CVE-2022-42003 et CVE-2022-42004. Une version
  plus récente aurait éloigné le legacy de son époque, et une plus ancienne
  aurait apporté des failles connues.
  > À vérifier : la liste des CVE corrigées vient de la mémoire de l'agent, pas d'une source consultée pendant la session.
- **Les dates de dépôt supposent une horloge figée vers le 15/11/2025.**
  L'horloge est choisie par #6. Une valeur proche garde environ 18 mois de
  dépôts derrière elle.
- **Corrections après relecture** (commit `61f3cac`) :
  - les numéros sont comparés comme des nombres, et non plus comme des
    chaînes ;
  - le test « commence à `D-0101` » vérifie chaque dossier réservé, au lieu de
    se fier à l'ordre du fichier ;
  - l'assertion « un seul propriétaire » est écrite directement ;
  - un commentaire explique pourquoi le chargeur déclare `reservations` :
    sans ce champ, Jackson refuserait la clé ;
  - un `synchronized` inutile est retiré de la recherche, qui ne fait que
    lire.

## Difficultés rencontrées

- **Un test du seam B jamais passé par le rouge.**
  - Symptôme : le test « les dossiers partagés couvrent les trois statuts »
    est passé dès son premier lancement.
  - Cause : les 30 dossiers partagés avaient été écrits à la tranche
    précédente, pour faire passer le test du format des numéros.
  - Résolution : aucune dans la session. Le test « un seul propriétaire par
    dossier réservé » a, lui, reçu un contrôle négatif : on a déclaré `D-0101`
    sous deux noms, ce qui a donné `Tests  1 failed | 3 passed (4)`. Le
    fichier a ensuite été restauré. État de la mesure : session, avant le
    commit `196c5b1`, avec quatre tests du seam B écrits.
- **Vérifications par `curl` cassées dans zsh.**
  - Symptôme : `curl: option -s -u agent:agent-mb: is unknown`. Un second
    essai a échoué avec `defining function based on alias 'g'`.
  - Cause : zsh ne découpe pas une variable non citée en plusieurs mots,
    contrairement à bash, et `g` était déjà un alias du shell.
  - Résolution : écrire les vérifications dans un script lancé avec `bash`.
- **Le premier `gh issue view 3` n'a rien affiché.**
  - Symptôme : la commande n'a rien affiché, mais le `git log` qui la suivait
    a bien répondu.
  - Résolution : relancée avec `--repo karAmmi12/migrabench --json …`, elle a
    rendu l'issue.
  > À vérifier : la cause de la sortie vide n'a pas été établie.
- **Le lien vers la fiche répond 500, pas 404.**
  - Symptôme : `/fiche.do?number=D-0001` répond `500`.
  - Cause : le journal montre
    `InvalidPathException: No action config found for the specified url`. En
    Struts 1.3, un chemin `.do` sans action déclarée lève une exception au
    lieu de répondre 404.
  - Résolution : aucune dans ce ticket. Le lien fonctionnera quand #5 déclarera
    l'action `/fiche`.

## Vérifier soi-même

Prérequis : `docker compose up -d --build --wait`. Mesures faites sur le
commit `61f3cac`.

```sh
npx vitest run tests/seam-b
```
Résultat observé : `Tests  5 passed (5)`.

```sh
npm test
```
Résultat observé : `Tests  10 passed (10)` (seam A, seam B et
`tests/users.test.ts`).

```sh
curl -s -u agent:agent-mb "http://localhost:8080/rechercher.do?number=D-0101" | grep onerror
```
Résultat observé : la charge sort sans échappement :
`<td><img src=x onerror="window.__mbXss=1"></td>`.

```sh
curl -s -u agent:agent-mb "http://localhost:8080/rechercher.do?filedFrom=14%2F02%2F2025&filedTo=14%2F02%2F2025" | grep -o 'number=D-[0-9]*'
```
Résultat observé : `number=D-0012` puis `number=D-0019`. Les bornes sont
incluses, et les deux dossiers ont été déposés le même jour.

```sh
curl -s -u agent:agent-mb "http://localhost:8080/rechercher.do?applicant=elodie" | grep -o 'number=D-[0-9]*'
```
Résultat observé : `number=D-0004` (Elodie Fontaine) seulement. Avec
`applicant=%C3%89LODIE` (« ÉLODIE »), on obtient `D-0001` (Élodie Marchand) :
la recherche ignore la casse mais pas les accents.

```sh
curl -s -u agent:agent-mb "http://localhost:8080/rechercher.do?number=D-9999" | grep -E 'Aucun|<th>'
```
Résultat observé : seulement la ligne
`<p>Aucun dossier ne correspond à vos critères.</p>`, sans `<th>`.

Dans un navigateur, connecté en agent, ouvrir
`http://localhost:8080/rechercher.do?number=D-0101`, puis taper
`window.__mbXss` dans la console.
Résultat observé par l'humain, sur la pile construite depuis `61f3cac` : `1`.
La charge s'exécute, et le legacy échoue bien à la porte XSS.

## Pour aller plus loin

- Le ticket #4 ajoute la validation de l'écran dans `validation.xml`,
  `<html:errors/>` et le focus sur « Numéro ».
- Le ticket #5 déclare l'action `/fiche`, et le lien des numéros cessera de
  répondre 500.
- Le ticket #6 fixe l'horloge et ajoute ses dossiers réservés. Les tests du
  seam B doivent rester verts.
- Limite observée : sans cookie, comme avec `curl`, Tomcat ajoute
  `;jsessionid=…` aux liens (`/fiche.do;jsessionid=…?number=D-0101`). Il faut
  s'en souvenir avant de comparer des URL dans l'oracle (étape 2).
