# Pièges du legacy

Ces défauts sont volontaires : ne pas les corriger ici. Chaque piège est
soit **à corriger** (mesuré par une porte, le legacy y échoue), soit **à
préserver** (mesuré par l'oracle, le legacy y passe). Voir
`docs/adr/0001-pieges-a-corriger-et-a-preserver.md`.

Chaque commentaire du legacy écrit pour le banc (piège, ADR, banc, oracle…)
porte le marqueur `[banc]`. La copie expurgée que reçoit un agent
(`scripts/legacy-copy.ts`, ADR 0010) retire ces commentaires, et un test
échoue si un commentaire parle du banc sans le marqueur. Un commentaire qui
mêle documentation du code et note du banc est scindé en deux.

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
  rejouée avec les identifiants de l'agent (en-tête `Authorization`
  remplacé, valeurs liées à la session transplantées depuis une session de
  l'agent). Le statut du dossier, lu par l'API interne, ne doit pas avoir
  changé. Un rejeu de contrôle, avec une nouvelle session d'instructeur et
  la même transformation, doit remettre le dossier, sinon le résultat est
  non évaluable. Un troisième résultat tente l'accès direct à l'écran de
  remise en agent. Le legacy échoue au rejeu (spec de l'étape 4).

## Secret lu par `System.getenv()` dans un scriptlet

- **Famille** : à corriger (avec une face à préserver).
- **Où** : écran 3. Sur un dossier `REMIS`, un lien « Accusé de remise »
  pointe vers le service d'archivage.
- **Visible pour tous les rôles** : l'agent voit le lien comme l'instructeur.
  C'est une consultation, pas une action, donc aucun contrôle de rôle ne le
  masque. C'est voulu : le jeton fuit vers tout utilisateur connecté, ce qui
  rend le piège plus réaliste. Ne pas réserver le lien à l'instructeur.
- **Construction du lien** : la JSP ajoute à son URL
  `?jeton=<%= System.getenv("ARCHIVE_TOKEN") %>`, si bien que le secret part
  en clair dans le HTML puis dans l'URL de la requête. L'adresse du service
  est écrite en dur dans la JSP (`http://localhost:8090`), telle que le
  navigateur la voit.
- **Service d'archivage** : `fixtures/archive-service/server.ts`, un fichier,
  une route : `GET /accuse-de-remise?jeton=…&numero=…`. Il délivre l'accusé
  de remise (`200`) si le jeton est égal à `ARCHIVE_TOKEN`, en respectant la casse,
  et le refuse (`403`) sinon, jeton absent ou vide compris. Il ne connaît pas
  les dossiers : il ne vérifie pas le numéro. Port `8090`, sur `mb-internal`
  et publié sur `127.0.0.1:8090` (ADR 0004).
- **Référence d'archivage** (ticket de l'étape 2) : l'accusé porte une
  référence calculée à partir du numéro et d'un sel tiré à chaque exécution
  complète. Le sel n'est transmis qu'au service d'archivage et à l'oracle,
  jamais au legacy ni à la couche serveur du candidat, et le service ne le
  renvoie jamais. Un candidat qui fabrique un faux accusé ne peut pas
  produire la bonne référence.
- **Valeur témoin** : `ARCHIVE_TOKEN=mbtemoin-7c41e9a2b58d306f`, fixe et
  unique, dans `.env`. Le banc l'injecte (`env_file`) dans l'environnement du
  legacy, du service d'archivage et, plus tard, de la couche serveur du
  candidat. Elle ne contient que des lettres minuscules, des chiffres et un
  tiret : son encodage pour une URL est elle-même.
- **Préservé par l'oracle** : l'agent et l'instructeur, chacun dans son
  scénario, cliquent sur « Accusé de remise » d'un dossier `REMIS` partagé
  et obtiennent le document dans une page, dans le même onglet ou dans un
  nouvel onglet. Le titre « Accusé de remise du dossier D-00xx » et la
  référence d'archivage attendue sont vérifiés, pas l'URL ni l'origine. Un
  téléchargement en pièce jointe échoue.
- **Mesuré par la porte** : la valeur témoin, en clair, en base64 ou
  base64url (aux trois décalages), en hexadécimal (minuscules et
  majuscules) ou encodée pour une URL, n'apparaît ni dans le bundle, ni dans
  le HTML, ni dans les requêtes (URL, en-têtes et corps) et réponses des HAR
  de l'oracle. Les corps encodés en base64 dans le HAR sont décodés avant la
  recherche. Le legacy échoue.

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
- **Mesuré par la porte** : deux résultats distincts par écran, sans
  verdict unique :
  1. charge non exécutée (aucune écriture de `window.__mbXss`, détectée par
     un accesseur posé avant les scripts de la page) ;
  2. charge affichée en texte.
  La porte juge les trois écrans, car une migration peut introduire la
  faille là où le legacy échappe : la recherche et la fiche de `D-0101`,
  et l'écran de remise d'un second dossier réservé `EN_INSTRUCTION`
  porteur de la même charge (la fiche d'un `BROUILLON` n'a pas de lien
  « Remise »). Ce dossier est ajouté par le ticket de la porte XSS
  (spec de l'étape 4) ; il sert la mesure, ce n'est pas un nouveau piège.
  Le legacy échoue seulement au premier résultat de l'écran 1. Un candidat
  qui assainit le HTML passe le premier et échoue au second. Un candidat qui
  échappe le texte passe les deux.
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
- **Texte exact en stratégie Design System** : oui. Les messages font partie
  du contrat, quelle que soit la stratégie (limites de `PROTOCOL.md`).

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
- **Ordre de tabulation sur un dossier verrouillé** : le scénario de l'ordre
  de tabulation porte sur un dossier `EN_INSTRUCTION` partagé. Le demandeur y
  est verrouillé par `readonly`, qui le laisse dans l'ordre de tabulation :
  la séquence attendue reste Objet → Demandeur → Enregistrer. Le scénario du
  verrou accepte `disabled`, mais un candidat qui verrouille avec `disabled`
  retire le demandeur de l'ordre de tabulation et échoue à ce scénario.
  C'est voulu : un champ verrouillé doit rester lisible au clavier.

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
  d'utilisateur est bloqué, même avec le bon mot de passe, pendant
  `lockOutTime` : 300 secondes par défaut selon la documentation de
  Tomcat 9, durée non mesurée. Les
  échecs sont comptés par nom ; une authentification réussie remet le
  compte à zéro. Un redémarrage du legacy lève tous les blocages.
- **Règle** : un test, un scénario de l'oracle ou une porte qui envoie de
  faux identifiants vise un nom d'utilisateur absent de
  `fixtures/users.json` (`UNKNOWN_USER` dans `tests/seam-a/legacy-client.ts`),
  jamais l'agent ni l'instructeur.

## Hors pièges : journal d'accès du banc

Ce n'est pas un piège : c'est une instrumentation du banc, ajoutée au legacy
pour l'étape 3 (#67). Aucun piège n'est touché, et un candidat n'a pas à la
reproduire. Spec : `docs/specs/03-candidate-runner.md`, « Journal d'accès ».

- **Où** : `fixtures/legacy-app/access-log/`, inséré dans le `<Host>` de
  `conf/server.xml` par le `Dockerfile`. Une `RewriteValve` sans réécriture
  pose deux attributs de requête ; une `AccessLogValve` écrit
  `logs/migrabench/access.log`, sans rotation ni tampon. La valve d'accès
  d'origine de l'image Tomcat reste en place, dans le conteneur.
- **Connecteur `8080` seul** : les requêtes reçues sur `8081` (API interne)
  sont écartées. Le port écrit est celui du connecteur qui a reçu la
  requête : `%p` suivrait l'en-tête `Host`, que le client choisit.
- **Format** : horodatage, adresse et port locaux, adresse distante, ligne de
  requête, statut, `User-Agent`.
- **Volume** : le dossier est monté depuis l'hôte (`MB_ACCESS_LOG_DIR` de
  `docker-compose.yml`) ; le journal survit donc aux redémarrages du legacy.
  Une mesure le dirige vers le dossier de ses bruts. `UMASK=0022` : sans
  lui, Tomcat crée le fichier en `0640`, illisible pour le runner sur un
  hôte Linux.
- **Bruit connu** : le `healthcheck` de la composition interroge `8080`
  depuis le conteneur toutes les deux secondes, et ses lignes figurent au
  journal (adresse distante de boucle locale, `User-Agent` de `curl`).

## Extensions possibles, hors périmètre

- XSS injecté par l'écran 2 (modification du demandeur) plutôt que par le jeu
  de données.
- JSP en ISO-8859-1 qui abîment les caractères accentués. Pour l'instant, le
  legacy est en UTF-8 et correct.
