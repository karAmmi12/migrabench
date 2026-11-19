# #5 · Étape 1 · 4. Fiche dossier

## Objectif

L'écran 1 listait les dossiers, mais leur numéro pointait vers une fiche qui
n'existait pas. Ce ticket construit l'écran 2, la fiche dossier : on y
modifie le demandeur et l'objet, sous un **verrou** qui dépend du statut.
Ce verrou est appliqué deux fois : par la vue (`readonly`) et par le service
métier, pour qu'une requête forgée ne le contourne pas. L'écran porte aussi
quatre pièges, documentés dans `fixtures/legacy-app/TRAPS.md`. Trois sont
**à préserver** : les règles de saisie seulement dans `validation.xml`,
`Ctrl+S`, et le focus avec l'ordre de tabulation. Le quatrième, la mise en
page en `<table>` imbriquées, est **à corriger**.

## Notions à connaître

- **Validateurs `required` et `maxlength` de Struts Validator** : deux
  validateurs standard de `validator-rules.xml`, déclarés champ par champ
  dans `validation.xml`. La limite de `maxlength` est passée par une
  `<var>`. —
  [Struts 1 : Validator FAQ](https://weblegacy.github.io/struts1/faqs/validator.html)
  - Nature de la source : republication communautaire (Web-Legacy), qui
    documente la version 1.5.0-RC2. Le legacy est en 1.3.10.
- **`required` et les espaces** : observé sur le legacy, un demandeur fait
  de deux espaces est refusé avec « Le demandeur est obligatoire. »
  (« Vérifier soi-même », commande 6). Dans le `struts-core-1.3.10.jar` du
  legacy, `javap -c` montre que `FieldChecks.validateRequired` appelle
  `GenericValidator.isBlankOrNull`. La Javadoc de cette méthode dit :
  « Checks if the field isn't null and length of the field is greater than
  zero not including whitespace. » —
  [Commons Validator : GenericValidator](https://commons.apache.org/proper/commons-validator/apidocs/org/apache/commons/validator/GenericValidator.html)
  - Nature de la source : Javadoc officielle d'Apache Commons Validator,
    dans sa dernière version (publiée le 28/07/2026). Le legacy embarque
    `commons-validator-1.3.1.jar`.
- **`input` d'une action Struts vers une autre action** : quand
  `validation.xml` refuse une saisie, Struts transfère la requête au chemin
  `input` du mapping, sans appeler l'action. Par défaut
  (`inputForward=false`), le guide décrit ce chemin comme « a
  module-relative path to the resource to be used as the input form » : une
  JSP, ou une autre action. —
  [Struts 1 : guide utilisateur, configuration](https://weblegacy.github.io/struts1/userGuide/configuration.html)
  (même republication, version 1.5.0-RC2). Observé sur le legacy : avec
  `input="/ficheSaisie.do"`, une saisie refusée revient sur la fiche avec
  les messages d'erreur, et le formulaire garde la valeur saisie (deux
  espaces, commande 6).
- **Attribut `readonly`** : un champ `readonly` ne se modifie pas, mais il
  reste dans l'ordre de tabulation et sa valeur part avec le formulaire. Ce
  n'est donc qu'un verrou d'affichage : une requête écrite à la main peut
  envoyer une autre valeur. —
  [MDN : attribut readonly](https://developer.mozilla.org/fr/docs/Web/HTML/Attributes/readonly)
- **`tabindex` positif** : les éléments avec un `tabindex` positif passent
  avant les autres dans l'ordre croissant, quel que soit leur ordre dans le
  DOM. —
  [MDN : tabindex](https://developer.mozilla.org/fr/docs/Web/HTML/Global_attributes/tabindex)
- **`preventDefault`** : empêche l'action par défaut du navigateur pour un
  événement. Ici, `Ctrl+S` ne doit pas ouvrir « Enregistrer la page sous ». —
  [MDN : Event.preventDefault()](https://developer.mozilla.org/fr/docs/Web/API/Event/preventDefault)
- **Filtre d'encodage de Tomcat** : `SetCharacterEncodingFilter`, fourni
  par Tomcat, fixe l'encodage de la requête (UTF-8 ici) avant la lecture
  des paramètres. La fiche est le premier écran qui envoie sa saisie en
  `POST`. Le filtre fixe l'encodage de ce corps au lieu de le laisser au
  réglage par défaut du conteneur. —
  [Tomcat 9 : Container Provided Filters, Set Character Encoding Filter](https://tomcat.apache.org/tomcat-9.0-doc/config/filter.html)
- **Post/Redirect/Get** : après un `POST` réussi, le serveur répond par une
  redirection (`302`) vers la page à afficher. Recharger la page ne renvoie
  donc pas le formulaire. —
  [Wikipédia (en) : Post/Redirect/Get](https://en.wikipedia.org/wiki/Post/Redirect/Get)
  (source de référence, pas une norme).

## Ce qui a été construit

- **Modèle et service métier** :
  - `Status.java` porte le verrou du statut : `isApplicantLocked()`,
    `isSubjectLocked()`, `isEditable()`.
  - `DossierService` gagne `read(number)` et `update(number, applicant, subject)`.
    `update` lève `LockedFieldException` si un champ verrouillé change, et
    `UnknownDossierException` si le numéro n'existe pas. Elle ne valide pas
    les valeurs : les règles de saisie restent dans `validation.xml`.
  - `Dossier.withApplicantAndSubject` renvoie une copie modifiée, car le
    dossier est immuable.
- **Couche web** (`fr.migrabench.legacy.web`) :
  - `DossierForm` : un `ValidatorForm` sans `validate()` propre.
  - `DossierSheet` : la partie en lecture seule de la fiche et le verrou,
    prêts pour la JSP, sur le modèle de `SearchResultRow`.
  - `ShowDossierAction` sert deux mappings : `/fiche` remplit le formulaire
    avec le dossier, `/ficheSaisie` garde la saisie refusée et relit
    seulement le statut.
  - `SaveDossierAction` (`/enregistrer`) passe par le service, puis
    redirige vers la fiche. Elle répond `409` sur un champ verrouillé et
    `404` sur un numéro inconnu.
- **`WEB-INF/jsp/fiche.jsp`** : la fiche et ses pièges.
  - Deux `<html:text>`, avec `readonly` calculé par un scriptlet.
  - Le bouton « Enregistrer » rendu seulement si la fiche est modifiable.
  - Le gestionnaire `Ctrl+S` rendu sur toutes les fiches, avec
    `preventDefault`. Il n'enregistre que si la fiche est modifiable.
  - `focus="subject"` sur `<html:form>`, et les `tabindex` 1, 2, 3.
  - Trois niveaux de `<table>`.
- **Configuration** :
  - `struts-config.xml` : le formulaire `dossierForm` et trois mappings.
  - `validation.xml` : `required` et `maxlength` (80 et 200).
  - `ApplicationResources.properties` : quatre messages en `\uXXXX`.
  - `web.xml` : le filtre UTF-8.
- **Jeu de données** (`dossiers.json`) : dossiers réservés `D-0102` à
  `D-0110`, un par scénario d'oracle qui écrit sur l'écran 2 :
  - deux enregistrements (`BROUILLON`, `EN_INSTRUCTION`) ;
  - `Ctrl+S` ;
  - les quatre règles de saisie ;
  - deux scénarios de verrou (`EN_INSTRUCTION`, `REMIS`).
- **Tests du seam A** :
  - `tests/seam-a/legacy-screens.test.ts` vérifie que la fiche répond à
    l'agent et à l'instructeur, et refuse une requête sans identifiants.
  - `tests/seam-a/legacy-client.ts` regroupe l'adresse du legacy et les
    identifiants, partagés avec `legacy-basic-auth.test.ts`.
- **Documentation** : `TRAPS.md` décrit cinq comportements de référence de
  l'écran 2 :
  - les espaces avec `required` ;
  - la validation avant le verrou ;
  - le retour par `/ficheSaisie.do` ;
  - `Ctrl+Maj+S` ;
  - `Ctrl+S` sur `REMIS`.

  `GLOSSARY.md` définit **Verrou**.

## Les choix faits et pourquoi

- **Verrou dans le service métier, retenu ; verrou dans l'action seule,
  écarté.** Le ticket demande que « le service métier refuse la
  modification d'un champ verrouillé, même si la requête est forgée ».
  L'API interne (#8) passera par le même service : elle aura le même
  verrou sans le recoder.
- **Renvoyer un champ verrouillé à l'identique est accepté.** Le navigateur
  envoie aussi les champs `readonly`. Les refuser bloquerait tout
  enregistrement sur un dossier `EN_INSTRUCTION`.
- **`409` sur un champ verrouillé et `404` sur un numéro inconnu, retenus ;
  réafficher la fiche avec un message d'erreur, écarté.** Une requête
  forgée ne vient pas de l'écran, et un message aurait ajouté un texte
  absent de la spec, qu'un candidat aurait dû reproduire. L'humain a validé
  ce choix et l'a fait reporter sur l'API interne, par un commentaire sur
  l'issue #8.
- **Retour après refus par l'action `/ficheSaisie.do`, retenu ; `input`
  vers la JSP, écarté.** La JSP a besoin du statut pour poser `readonly` et
  décider du bouton. Une action qui relit le statut sans toucher à la
  saisie le lui fournit. Prendre le statut dans un champ caché aurait laissé
  le client décider du verrou affiché.
- **Sur `REMIS`, un gestionnaire `Ctrl+S` qui appelle seulement
  `preventDefault`, retenu ; pas de gestionnaire, écarté.** La spec
  (story 31) demande que `Ctrl+S` n'ait aucun effet sur un dossier `REMIS`
  « et n'ouvre pas la boîte d'enregistrement du navigateur ». La première
  version ne rendait pas le gestionnaire sur `REMIS`, ce qui laissait le
  navigateur faire son action par défaut. La relecture de la PR l'a relevé,
  et l'humain a tranché : la story 31 fait foi (voir « Difficultés
  rencontrées »).
- **Filtre UTF-8 de Tomcat, retenu.** La fiche est le premier écran qui
  envoie en `POST`. Le filtre est fourni par Tomcat : aucune dépendance
  n'est ajoutée.
- **Test du seam A limité à « l'écran répond », retenu ; tester le verrou
  par HTTP, écarté.** La spec de l'étape 1 (« Décisions de test ») réserve
  les comportements des écrans à l'oracle. Le verrou a été vérifié par
  `curl` (voir « Vérifier soi-même »).
- **Suites de la relecture en deux axes (standards et spec)** :
  - Les dossiers réservés `D-0109` et `D-0110` ont été ajoutés pour les
    scénarios de verrou. Sur le legacy, ces scénarios n'écrivent rien, mais
    un candidat défectueux modifierait le dossier.
  - `TRAPS.md` documente que `Ctrl+Maj+S` enregistre aussi, et que la
    validation passe avant le verrou.
  - L'aide HTTP du seam A est mise en commun, et `LockedFieldException`
    perd une méthode que rien n'appelait.
  - Gardé malgré la relecture : `DossierSheet` ne fait que déléguer, mais
    suit la convention de `SearchResultRow`.

## Difficultés rencontrées

- **Le mode headless masquait la boîte d'enregistrement.**
  - Symptôme : la première version ne rendait pas le gestionnaire `Ctrl+S`
    sur un dossier `REMIS`. La vérification par Playwright, en headless,
    n'a vu aucun problème : `Ctrl+S` « ne change pas de page ». La relecture
    en deux axes de la PR a ensuite relevé que la spec (story 31) interdit
    la boîte d'enregistrement du navigateur sur `REMIS`.
  - Cause : en headless, les boîtes de dialogue du navigateur n'apparaissent
    pas, et la vérification ne regardait que la page. Relancé hors headless
    sur la pile `cc3cbb7`, le même `Ctrl+S` sur `D-0001` donnait une frappe
    S avec `defaultPrevented` à `false` : rien n'empêchait l'action par
    défaut du navigateur. La boîte elle-même n'a pas pu être vue : la
    capture d'écran (`screencapture`) a échoué faute d'autorisation
    d'enregistrement de l'écran.
  - Résolution : sur `REMIS`, le gestionnaire est rendu et appelle seulement
    `preventDefault`. La vérification porte désormais sur `defaultPrevented`
    de l'événement, pas sur l'absence de boîte à l'œil.

## Vérifier soi-même

État : branche `feat/4-dossier-sheet`, pile reconstruite au commit
`cc3cbb7`. La pile a été redémarrée avant les commandes : un redémarrage
remet le jeu de données à zéro. Avec `AUTH=<utilisateur>:<mot de passe>` de
l'agent (`fixtures/users.json`) :

```sh
docker compose up -d --build --wait
curl -s -u "$AUTH" "http://localhost:8080/fiche.do?number=D-0003" | grep -oE '<input type="(text|submit)"[^>]*>'
```

1. Attendu sur un dossier `EN_INSTRUCTION` : Demandeur verrouillé, Objet
   modifiable, bouton présent, et des `tabindex` dans l'ordre inverse du DOM.

```
<input type="text" name="applicant" size="50" tabindex="2" value="Association « Les Amis du Lavoir »" readonly="readonly" id="applicant">
<input type="text" name="subject" size="80" tabindex="1" value="Demande de subvention pour la fête du quartier" id="subject">
<input type="submit" tabindex="3" value="Enregistrer">
```

```sh
curl -s -u "$AUTH" "http://localhost:8080/fiche.do?number=D-0001" | grep -E 'value="Enregistrer"|preventDefault\(\)|\.submit\(\)'
```

2. Attendu sur un dossier `REMIS` : le gestionnaire appelle
   `preventDefault`, mais pas de bouton « Enregistrer » ni d'appel à
   `submit()`. Observé sur la pile reconstruite avec le correctif
   `fix(legacy): prevent the browser save dialog on a REMIS sheet` (sur un
   dossier `BROUILLON` comme `D-0002`, la même commande montre aussi
   `submit()` et le bouton) :

```
      event.preventDefault();
```

```sh
curl -s -u "$AUTH" "http://localhost:8080/fiche.do?number=D-0002" | grep 'focusControl ='
```

3. Attendu : le script généré par l'attribut `focus`.

```
  var focusControl = document.forms["dossierForm"].elements["subject"];
```

```sh
curl -s -o /dev/null -w '%{http_code}\n' -u "$AUTH" http://localhost:8080/enregistrer.do \
  --data-urlencode number=D-0109 --data-urlencode 'applicant=Forgé' \
  --data-urlencode "subject=Permis de démolir d'un hangar agricole"
curl -s -u "$AUTH" "http://localhost:8080/fiche.do?number=D-0109" | grep -oE 'name="applicant"[^>]*value="[^"]*"'
```

4. et 5. Attendu : la requête forgée sur le demandeur verrouillé reçoit
   `409`, et le demandeur n'a pas changé.

```
409
name="applicant" size="50" tabindex="2" value="Yannick Le Gall"
```

```sh
curl -s -u "$AUTH" http://localhost:8080/enregistrer.do \
  --data-urlencode number=D-0105 --data-urlencode 'applicant=  ' --data-urlencode 'subject=' \
  | grep -oE '<li>[^<]*</li>|name="applicant"[^>]*value="[^"]*"'
```

6. Attendu : les deux messages de `ApplicationResources.properties`, et la
   saisie (deux espaces) gardée.

```
<li>Le demandeur est obligatoire.</li>
<li>L'objet est obligatoire.</li>
name="applicant" size="50" tabindex="2" value="  "
```

```sh
curl -s -o /dev/null -w '%{http_code}\n' -u "$AUTH" http://localhost:8080/enregistrer.do \
  --data-urlencode number=D-0102 --data-urlencode "applicant=Thérèse « Lagarde » d'Uzès" \
  --data-urlencode 'subject=Abri de jardin modifié'
curl -s -u "$AUTH" "http://localhost:8080/fiche.do?number=D-0102" | grep -oE 'name="applicant"[^>]*value="[^"]*"'
```

7. Attendu : redirection après enregistrement, puis la nouvelle valeur, avec
   ses accents, guillemets et apostrophe.

```
302
name="applicant" size="50" tabindex="2" value="Thérèse « Lagarde » d&#39;Uzès"
```

```sh
curl -s -u "$AUTH" "http://localhost:8080/fiche.do?number=D-0101" | grep -oE 'name="applicant"[^>]*value="[^"]*"'
```

8. Attendu : la charge XSS du dossier `D-0101` est échappée par
   `<html:text>`.

```
name="applicant" size="50" tabindex="2" value="&lt;img src=x onerror=&quot;window.__mbXss=1&quot;&gt;"
```

```sh
grep -rnE 'validate\(|html:javascript|maxlength=' fixtures/legacy-app/src/main/java fixtures/legacy-app/src/main/webapp/WEB-INF/jsp
```

9. Attendu : seulement les deux commentaires Javadoc, de `SearchForm.java`
   et de `DossierForm.java`. Aucune règle n'est reprise hors de
   `validation.xml`, et aucun `maxlength` n'est posé sur les champs.

```sh
npm test
```

10. Attendu : `Test Files  4 passed (4)`, `Tests  13 passed (13)`.

Vérifications au navigateur, par un script Playwright lancé hors du dépôt
avec le Chrome installé :

- Sur la pile `6953072` :
  - Pour `D-0102` (`BROUILLON`), `D-0003` (`EN_INSTRUCTION`) et `D-0001`
    (`REMIS`), le focus est sur Objet au chargement. Les trois premières
    tabulations donnent Objet → Demandeur → Enregistrer (`REMIS` : Objet →
    Demandeur, puis la page). Chaque page a 2 tableaux contenus dans un autre.
  - Sur `D-0104`, `Ctrl+S` enregistre l'objet saisi, et l'événement a
    `defaultPrevented` à vrai. `Cmd+S` (`Meta+s`) n'enregistre pas.
  - Sur `D-0001` (`REMIS`), `Ctrl+S` ne change pas de page. Cette
    vérification, en headless, n'a pas vu le défaut corrigé ensuite (voir
    « Difficultés rencontrées »).
- Hors headless, sur la pile reconstruite avec le correctif
  `fix(legacy): prevent the browser save dialog on a REMIS sheet` :
  - sur `D-0001` (`REMIS`), la frappe S de `Ctrl+S` a `defaultPrevented`
    à vrai, la page ne change pas, et l'objet est inchangé après
    rechargement ;
  - `Cmd+S` (`Meta+s`) reste sans gestionnaire : `defaultPrevented` à faux ;
  - sur `D-0104` (`BROUILLON`), `Ctrl+S` a `defaultPrevented` à vrai et
    enregistre l'objet saisi.
- Sur la pile `cc3cbb7` : sur la fiche de `D-0101`, `window.__mbXss` vaut
  `undefined`, la page ne contient aucune `<img>`, et le champ Demandeur
  affiche la charge en texte. Comme témoin, la recherche de `D-0101` sur
  l'écran 1 donne `window.__mbXss = 1` : le piège XSS de l'écran 1 est
  intact.

Dans le navigateur, sur la pile reconstruite après `cc3cbb7` (le code du
legacy n'a pas changé depuis), l'humain a vérifié :

- le lien du numéro mène de l'écran 1 à la fiche ;
- le demandeur de `D-0101` est échappé ;
- le focus est sur « Objet » au chargement ;
- la tabulation suit Objet → Demandeur → Enregistrer ;
- `Ctrl+S` enregistre ;
- un dossier `REMIS` est en lecture seule, sans bouton « Enregistrer ».

## Pour aller plus loin

- Ticket suivant de l'étape 1 : #6, la remise et l'horloge figée. Il
  ajoute le lien « Remise » sur la fiche des dossiers `EN_INSTRUCTION` et
  `REMIS`.
- Issue #8, l'API interne : l'endpoint « modifier » reprend le verrou du
  service, avec `409` et `404`. L'API n'applique pas `validation.xml` : une
  requête forgée qui viole aussi une règle de saisie y recevra `409`, alors
  que l'écran 2 réaffiche la fiche.
- Limite connue : la redirection qui suit un enregistrement porte
  `;jsessionid=…` dans l'URL quand le client n'a pas encore de cookie de
  session (observé avec `curl`). C'est le comportement par défaut de
  Tomcat et Struts. Un navigateur ne le voit plus après la première
  requête.
- Les noms des scénarios réservés (`scenario:sheet-…`) sont une
  proposition. L'oracle de l'étape 2 pourra les renommer, et le test du
  seam B gardera la règle « un dossier réservé, un seul propriétaire ».
