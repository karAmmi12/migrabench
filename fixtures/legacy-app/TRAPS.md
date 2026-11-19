# Pièges du legacy

Ces défauts sont volontaires : ne pas les corriger ici. Chaque piège est
soit **à corriger** (mesuré par une porte, le legacy y échoue), soit **à
préserver** (mesuré par l'oracle, le legacy y passe). Voir
`docs/adr/0001-pieges-a-corriger-et-a-preserver.md`.

## Contrôle de rôle dans la vue

- **Famille** : à corriger.
- **Où** : écran 3 (remise). `RemiseAction` et l'endpoint de remise de l'API
  interne ne vérifient aucun rôle. Seul un scriptlet
  `request.isUserInRole("instructeur")` affiche ou masque le bouton
  « Remettre ». L'agent voit à la place « Remise réservée aux
  instructeurs ».
- **Pas d'attribut `roles` sur le mapping** : `<action path="/remettre">`
  de `struts-config.xml` n'a pas d'attribut `roles`. Avec lui, Struts
  contrôlerait le rôle avant d'exécuter l'action (`AuthorizeAction` dans la
  chaîne de traitement, section 4.8 du guide utilisateur Struts 1.3) : le
  contrôle serait fait par le framework et le piège ne serait plus planté.
- **Dossier réservé** : `D-0112` (`gate:role` dans
  `src/main/resources/dossiers.json`), `EN_INSTRUCTION`. La remise réussie
  par l'instructeur dans l'oracle utilise `D-0111`
  (`scenario:remise-instructeur`).
- **Préservé par l'oracle** : l'instructeur voit le bouton et réussit la
  remise ; l'agent ne voit pas le bouton.
- **Mesuré par la porte** : la requête émise quand l'instructeur clique sur
  « Remettre » est enregistrée. Le legacy est redémarré, puis la requête est
  rejouée avec les identifiants de l'agent. Le statut du dossier, lu par
  l'API interne, ne doit pas avoir changé. Le legacy échoue.

## Secret lu par `System.getenv()` dans un scriptlet

- **Famille** : à corriger (avec une face à préserver).
- **Où** : écran 3. Après une remise, un lien « Accusé de remise » pointe vers
  le service d'archivage. La JSP y ajoute
  `?jeton=<%= System.getenv("ARCHIVE_TOKEN") %>`, si bien que le secret part
  en clair dans le HTML puis dans l'URL de la requête.
- **Service d'archivage** : un fichier, une route. Il délivre l'accusé de
  remise si le jeton est bon.
- **Valeur témoin** : fixe et unique, injectée par le banc dans
  l'environnement du legacy et dans celui de la couche serveur du candidat.
- **Préservé par l'oracle** : l'instructeur clique sur « Accusé de remise »
  et obtient le document.
- **Mesuré par la porte** : la valeur témoin, en clair, en base64 ou encodée
  pour une URL, n'apparaît ni dans le bundle, ni dans le HTML, ni dans les
  requêtes (URL et en-têtes) et réponses du HAR. Le legacy échoue.

## XSS par `<bean:write filter="false">`

- **Famille** : à corriger.
- **Où** : écran 1, colonne « Demandeur » du tableau de résultats. Sur
  l'écran 2, le champ est un `<html:text>`, qui échappe le contenu.
- **Charge** : présente dans le jeu de données, sur un dossier réservé que
  retrouve une recherche dédiée. Elle est silencieuse
  (`<img src=x onerror="window.__mbXss=1">`) pour ne pas perturber l'oracle.
  Le dossier est `D-0101`, réservé à la porte XSS (`gate:xss` dans
  `src/main/resources/dossiers.json`). La recherche dédiée est la recherche
  par numéro `D-0101`. Une recherche sans critère affiche aussi ce dossier,
  donc exécute aussi la charge.
- **Préservé par l'oracle** : rien. L'oracle ne fait aucune assertion sur le
  demandeur de ce dossier réservé.
- **Mesuré par la porte** : deux résultats distincts, sans verdict unique :
  1. charge non exécutée (`window.__mbXss` absent) ;
  2. charge affichée en texte dans la ligne du dossier.
  Le legacy échoue au premier résultat. Un candidat qui assainit le HTML
  passe le premier et échoue au second. Un candidat qui échappe le texte
  passe les deux.
- **Extension possible, hors périmètre** : injecter la charge en modifiant le
  demandeur depuis l'écran 2.

## Règles de saisie présentes seulement dans `validation.xml`

- **Famille** : à préserver.
- **Où** : écrans 1 et 2. Pas de `validate()` dans les `ActionForm`, pas de
  `<html:javascript>` dans les JSP, aucune validation dans l'API interne.
- **Règles** :

  | Écran | Champ | Règle | Validateur |
  |---|---|---|---|
  | 1 Recherche | Numéro | facultatif, format `D-` suivi de 4 chiffres | `mask` |
  | 1 Recherche | Déposé du / au | facultatifs, format `jj/mm/aaaa` strict | `date` |
  | 1 Recherche | Déposé au | postérieur ou égal à « du » | `validwhen` |
  | 2 Fiche | Demandeur | obligatoire, 80 caractères au plus | `required`, `maxlength` |
  | 2 Fiche | Objet | obligatoire, 200 caractères au plus | `required`, `maxlength` |

- **Messages** : dans `src/main/resources/fr/migrabench/legacy/ApplicationResources.properties`,
  en `\uXXXX` (fichier lu en ISO-8859-1), avec le texte lisible en
  commentaire au-dessus de chaque message.
- **`validwhen` sur l'écran 1** : `validwhen` compare deux valeurs comme des
  nombres si les deux sont des entiers, sinon comme des chaînes, dans l'ordre
  lexical. Des dates `jj/mm/aaaa` seraient donc mal comparées. La règle
  s'appuie sur deux propriétés en lecture seule de `SearchForm`,
  `filedFromKey` et `filedToKey` (date en `aaaammjj`, un entier, `null` si
  vide ou mal formée), comparées comme des nombres. Ces
  propriétés ne valident rien : la règle reste déclarée dans `validation.xml`.
  C'est voulu et cela fait partie du piège : le sens de la règle est réparti
  entre `validation.xml` et `SearchForm`, comme souvent dans les vrais legacy
  Struts. Un candidat doit lire les deux pour la retrouver.
- **Espaces dans « Numéro »** : `mask` ne retire pas les espaces. Un numéro
  fait seulement d'espaces, ou entouré d'espaces (`D-0001 `), est refusé
  avec le message du format. C'est le comportement de référence du legacy.

- **Espaces dans les champs de l'écran 2** : `required` retire les espaces
  avant de tester. Un demandeur ou un objet fait seulement d'espaces est
  refusé avec le message « obligatoire ». Une valeur acceptée est
  enregistrée telle quelle, sans retirer les espaces.
- **Validation avant verrou sur l'écran 2** : `validation.xml` passe avant
  le service métier. Une requête forgée qui change un champ verrouillé
  reçoit `409`, sauf si elle viole aussi une règle de saisie : elle reçoit
  alors la fiche avec le message d'erreur. Dans les deux cas, rien n'est
  enregistré.
- **Retour de l'écran 2 après refus** : l'`input` de `/enregistrer` est
  l'action `/ficheSaisie.do`, pas la JSP, car la fiche a besoin du statut
  pour afficher le verrou. Cette action relit le statut et garde la saisie.

- **Vérifié par l'oracle**, avec un résultat par règle :
  1. la soumission est refusée (écran 2 : après rechargement de la fiche, la
     valeur n'a pas changé) ;
  2. le message d'erreur s'affiche avec le texte exact de
     `ApplicationResources.properties`. On vérifie sa présence, pas sa
     position dans la page ;
  3. le formulaire garde les valeurs saisies.
- **Cas de `maxlength`** : un candidat qui empêche de saisir au-delà de la
  limite est accepté. Le critère est qu'aucune valeur trop longue n'est
  enregistrée. Les vérifications 2 et 3 ne s'appliquent alors pas.
- **Question reportée** : faut-il garder le texte exact du message en
  stratégie Design System ?

## Raccourci clavier, `focus` initial et ordre de tabulation

- **Famille** : à préserver.
- **Raccourci** : `Ctrl+S` sur l'écran 2 seulement, via un gestionnaire
  `onkeydown` écrit à la main dans la JSP, avec `preventDefault`. Pas de
  variante `Cmd+S`.
- **Touches qui déclenchent l'enregistrement** : le gestionnaire teste
  `ctrlKey` et le code de la touche S, sans regarder `Maj` ni `Alt`.
  `Ctrl+Maj+S`, ou `AltGr+S` sous Windows (qui positionne `ctrlKey`),
  enregistrent donc aussi. C'est le comportement de référence du legacy, mais
  l'oracle ne vérifie que `Ctrl+S`.
- **Fiche non modifiable** : sur un dossier `REMIS`, la JSP ne rend pas le
  bouton « Enregistrer ». Le gestionnaire est rendu, mais il appelle
  seulement `preventDefault`, sans enregistrer. `Ctrl+S` n'a donc aucun
  effet, et la boîte d'enregistrement du navigateur ne s'ouvre pas (spec,
  story 31).
- **Focus initial** : par l'attribut `focus` de `<html:form>`, transformé en
  JavaScript par Struts. Il se place sur « Numéro » (écran 1) et sur « Objet »
  (écran 2).
- **Ordre de tabulation** (écran 2) : Objet → Demandeur → Enregistrer, défini
  par des `tabindex` alors que Demandeur précède Objet dans le DOM. La règle
  axe-core `tabindex` se déclenche donc sur le legacy.
- **Vérifié par l'oracle**, au clavier seul, avec un résultat par
  comportement :
  1. `Ctrl+S` enregistre et l'action par défaut du navigateur est empêchée ;
  2. le focus est sur le bon champ au chargement ;
  3. la séquence de tabulation est exacte.
  L'oracle vérifie la séquence obtenue, pas le moyen employé : un candidat
  qui réordonne le DOM au lieu d'utiliser `tabindex` passe.

## Mise en page en `<table>` imbriquées

- **Famille** : à corriger.
- **Où** : les trois écrans, sur au moins deux niveaux d'imbrication. Le
  tableau de résultats de l'écran 1 est un vrai tableau de données, avec des
  `<th>`, placé à l'intérieur de la mise en page. Sur l'écran 1, deux
  niveaux de mise en page (page, puis contenu) contiennent à la fois un
  tableau de mise en page des champs du formulaire et le tableau de
  résultats.
- **Préservé par l'oracle** : rien.
- **Mesuré par la porte d'accessibilité**, par une vérification dédiée à
  côté d'axe-core (qui ne détecte pas les tableaux de mise en page), avec deux
  résultats par écran :
  1. le nombre de tableaux vaut 1 sur l'écran 1 (0 quand la recherche ne
     renvoie rien) et 0 sur les écrans 2 et 3 ;
  2. aucun tableau n'est contenu dans un autre.
  Le legacy échoue aux deux. Ajouter `role="presentation"` ou `role="none"`
  est une correction acceptée.
- **Méthode** : la vérification est écrite d'abord contre le legacy et doit y
  échouer. On lit en premier l'arbre d'accessibilité. Si les heuristiques du
  navigateur y masquent déjà les tableaux de mise en page du legacy, on
  compte à la place, dans le DOM, les éléments `table` sans
  `role="presentation"` ni `role="none"`. C'est une heuristique du banc
  (voir les limites de `PROTOCOL.md`).

## Hors pièges : blocage des comptes par Tomcat

Ce n'est pas un piège : ni porte, ni oracle ne le mesurent, et un candidat
n'a pas à le reproduire. C'est un comportement du legacy qui menace les
exécutions consécutives du banc.

- **Où** : `conf/server.xml` de l'image Tomcat 9 enveloppe le realm des
  utilisateurs dans un `LockOutRealm` (réglages par défaut). Laissé en place.
- **Comportement** : après 5 échecs d'authentification consécutifs, le nom
  d'utilisateur est bloqué 5 minutes, même avec le bon mot de passe. Les
  échecs sont comptés par nom ; une authentification réussie remet le
  compte à zéro. Un redémarrage du legacy lève tous les blocages.
- **Règle** : un test, un scénario de l'oracle ou une porte qui envoie de
  faux identifiants vise un nom d'utilisateur absent de
  `fixtures/users.json` (`UNKNOWN_USER` dans `tests/seam-a/legacy-client.ts`),
  jamais l'agent ni l'instructeur.

## Extensions possibles, hors périmètre

- XSS injecté par l'écran 2 (modification du demandeur) plutôt que par le jeu
  de données.
- JSP en ISO-8859-1 qui abîment les caractères accentués. Pour l'instant, le
  legacy est en UTF-8 et correct.
