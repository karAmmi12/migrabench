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
  « Remettre ».
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
  `<th>`, placé à l'intérieur de la mise en page.
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

## Extensions possibles, hors périmètre

- XSS injecté par l'écran 2 (modification du demandeur) plutôt que par le jeu
  de données.
- JSP en ISO-8859-1 qui abîment les caractères accentués. Pour l'instant, le
  legacy est en UTF-8 et correct.
