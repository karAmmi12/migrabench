# #4 · Étape 1 · 3. Validation et focus de la recherche

## Objectif

L'écran 1 (recherche de dossiers) acceptait n'importe quelle saisie. Ce ticket
ajoute ses règles de saisie et son focus initial. Ce sont deux pièges **à
préserver** (`fixtures/legacy-app/TRAPS.md`) : à l'étape 2, l'oracle
vérifiera ces comportements, et le legacy doit y passer. La particularité du
piège est que les règles vivent seulement dans `validation.xml` : ni
l'`ActionForm`, ni la JSP, ni du JavaScript côté client ne les montrent.

## Notions à connaître

- **Struts Validator** : un plug-in de Struts 1 (`ValidatorPlugIn`) qui lit
  des règles déclarées en XML. Les validateurs standard (`mask`, `date`,
  `required`…) viennent de `validator-rules.xml`, fourni dans le jar
  `struts-core`. Les règles propres à l'application sont dans
  `validation.xml`. Un formulaire qui hérite de `ValidatorForm` est validé
  par ces règles sans écrire de `validate()`. —
  [Struts 1 : Validator FAQ](https://weblegacy.github.io/struts1/faqs/validator.html),
  et [Apache Commons Validator](https://commons.apache.org/proper/commons-validator/)
  pour la bibliothèque sous-jacente.
  - Nature de la source : la FAQ est une republication communautaire
    (Web-Legacy), qui documente la version 1.5.0-RC2 (en-tête de la page,
    consulté le 18/11/2026). Le legacy est en 1.3.10.
- **`validwhen`** : un validateur qui évalue une expression sur les champs du
  formulaire. La FAQ en donne les deux limites qui ont compté ici : « Only two
  items may be joined with and or or » (un seul `and` ou `or` par paire de
  parenthèses), et « If both items to be compared are convertable to ints, a
  numeric comparison is done, otherwise a string comparison is done ». —
  [Struts 1 : Validator FAQ](https://weblegacy.github.io/struts1/faqs/validator.html)
- **`<html:errors/>` et les fichiers de messages** : les erreurs de
  validation portent une clé. `<html:errors/>` affiche le texte de cette clé,
  lu dans le fichier déclaré par `<message-resources>` de
  `struts-config.xml`. Les clés `errors.header`, `errors.footer`,
  `errors.prefix` et `errors.suffix` entourent la liste. —
  [Struts 1 : guide utilisateur, chapitre 3](https://weblegacy.github.io/struts1/userGuide/building_view.html)
  (même republication, version 1.5.0-RC2).
- **Encodage des `.properties` en Java 8** : `Properties.load(InputStream)`
  lit le fichier en ISO-8859-1. Un caractère hors de cette table s'écrit en
  `\uXXXX`. —
  [Java 8 : Properties](https://docs.oracle.com/javase/8/docs/api/java/util/Properties.html)
- **Attribut `focus` de `<html:form>`** : Struts génère, après le formulaire,
  un petit script qui place le curseur sur le champ nommé.
  > À vérifier : aucune page de référence de la balise `<html:form>` n'a été trouvée sur la republication Web-Legacy (deux adresses essayées, 404). Le comportement a été observé dans le HTML servi (voir « Vérifier soi-même »).

## Ce qui a été construit

- `fixtures/legacy-app/src/main/webapp/WEB-INF/validation.xml` : les règles
  de l'écran 1, pour le formulaire `searchForm`.
  - `number` : `mask` `^D-[0-9]{4}$`.
  - `filedFrom` : `date` avec `datePatternStrict` `dd/MM/yyyy`.
  - `filedTo` : `date`, puis `validwhen`
    `((filedFromKey == null) or ((filedToKey == null) or (filedToKey >= filedFromKey)))`.
  - Chaque règle a sa propre clé de message (`<msg>`).
- `fixtures/legacy-app/src/main/resources/fr/migrabench/legacy/ApplicationResources.properties` :
  les quatre messages de l'écran 1 et la présentation en liste
  (`<ul>`/`<li>`). Les valeurs sont en `\uXXXX`, avec le texte lisible en
  commentaire au-dessus de chacune.
- `struts-config.xml` : déclare `<message-resources>` et le
  `ValidatorPlugIn`. L'action `/rechercher` passe à `validate="true"`, avec
  `input="/WEB-INF/jsp/recherche.jsp"` : une saisie refusée revient sur la
  JSP sans passer par l'action.
- `SearchForm.java` : hérite de `ValidatorForm` au lieu d'`ActionForm`, sans
  `validate()` propre. Ajoute deux propriétés en lecture seule,
  `filedFromKey` et `filedToKey` (date en `aaaammjj`, `null` si vide ou mal
  formée), lues par `validwhen`.
- `ScreenDate.java` : `parseOrNull`, la lecture de date partagée par
  `SearchForm` et `SearchAction`.
- `recherche.jsp` : `<html:errors/>` au-dessus du formulaire, et
  `focus="number"` sur `<html:form>`.
- `TRAPS.md` : trois précisions dans le piège des règles de saisie
  (emplacement et encodage des messages, propriétés dérivées de `validwhen`,
  espaces dans « Numéro »).

## Les choix faits et pourquoi

- **Propriétés dérivées pour `validwhen`, retenues ; comparer directement
  `filedTo >= filedFrom`, écarté.** `jj/mm/aaaa` n'est pas un entier :
  `validwhen` comparerait des chaînes, et `02/03/2025` serait jugé avant
  `15/01/2025`. Les clés `aaaammjj` sont des entiers, comparés
  numériquement. La relecture de la spec a relevé que cela place une partie
  du sens de la règle dans le Java. L'humain a validé ce choix sans ADR :
  c'est la forme du piège. Le sens de la règle est réparti entre
  `validation.xml` et `SearchForm`, comme souvent dans les vrais legacy
  Struts, et un candidat doit lire les deux pour la retrouver. `TRAPS.md` le
  dit.
- **Pas de test Vitest, vérification par HTTP.** La spec de l'étape 1
  (« Décisions de test ») dit que les comportements fins des écrans et des
  pièges ne sont pas testés à cette étape : c'est l'oracle de l'étape 2 qui
  les mesure. Les comportements ont donc été vérifiés par `curl` contre
  `docker compose up`, puis dans le navigateur par l'humain.
- **Une clé de message par règle, retenue ; messages génériques de
  `validator-rules.xml` (`errors.invalid`, `errors.date`), écartés.** Chaque
  message nomme son champ et son format, et l'oracle vérifiera le texte
  exact.
- **Espaces simples dans les messages, retenues ; espaces insécables autour
  de « », écartées.** Le texte lisible en commentaire est exactement celui du
  message, ce que l'auteur de l'oracle doit pouvoir recopier.
- **Numéro entouré d'espaces refusé, gardé tel quel.** La relecture de la
  spec a signalé que `D-0001 ` (avec une espace) est refusé, alors que le
  champ est facultatif. C'est le comportement de `mask`, qui ne retire pas
  les espaces. Le legacy fait référence pour l'oracle : le cas est documenté
  dans `TRAPS.md`, pas corrigé.
- **Lecture de date partagée dans `ScreenDate.parseOrNull`.** La relecture
  des normes a relevé la même logique dans `SearchForm` et `SearchAction`
  (commit `dff31c9`).

## Difficultés rencontrées

- **« SYSTEM ERROR: Check logs for details. » sur toutes les recherches.**
  - Symptôme : le message s'affichait même sur un formulaire vide.
  - Cause : dans les logs Tomcat, `ValidWhen Error for field ' filedTo' - line 1:49: expecting RPAREN, found 'or'`.
    La première expression joignait trois termes par deux `or` dans la même
    paire de parenthèses, et la grammaire de `validwhen` n'en accepte que
    deux.
  - Résolution : imbriquer les parenthèses, un seul `or` par paire.
- **Accents abîmés dans les messages.**
  - Symptôme : « numÃ©ro » au lieu de « numéro ». Dans les octets de la
    réponse, `é` valait `c3 83 c2 a9` : de l'UTF-8 encodé deux fois.
  - Cause : le fichier `.properties` contenait de l'UTF-8 brut à la place des
    séquences `\u00e9` prévues, et Java 8 le lit en ISO-8859-1.
  - Résolution : réécrire les lignes de messages en `\uXXXX` par un petit
    script Node (l'équivalent de `native2ascii`), en laissant les
    commentaires lisibles.
- **Espaces insécables restées dans les messages.** Une première
  substitution cherchait le texte `\u00a0` alors que le fichier contenait
  encore le caractère lui-même. Elle n'a rien remplacé. Elle a été relancée
  après la conversion en `\uXXXX`.

## Vérifier soi-même

État : branche `feat/3-search-validation`. Les vérifications ci-dessous ont
été faites sur la pile reconstruite au commit `dff31c9`. Le commit suivant,
`17d3ce1`, ne modifie que `TRAPS.md`.

```sh
docker compose up -d --build --wait
docker compose logs legacy | grep validation
```

Attendu : le plug-in charge les deux fichiers de règles.

```
... ValidatorPlugIn.initResources Loading validation rules file from '/org/apache/struts/validator/validator-rules.xml'
... ValidatorPlugIn.initResources Loading validation rules file from '/WEB-INF/validation.xml'
```

Avec `AUTH=<utilisateur>:<mot de passe>` de l'agent (`fixtures/users.json`) :

```sh
curl -s -u "$AUTH" "http://localhost:8080/rechercher.do?number=D-12" | grep -oE '<li>[^<]*</li>|name="number" size="10" value="[^"]*"'
```

Attendu : le message du format, et la valeur saisie gardée.

```
<li>Le numéro doit être au format D- suivi de 4 chiffres, par exemple D-0001.</li>
name="number" size="10" value="D-12"
```

```sh
curl -s -u "$AUTH" "http://localhost:8080/rechercher.do?filedFrom=15/01/2025&filedTo=02/01/2025" | grep -oE '<li>[^<]*</li>'
```

Attendu :

```
<li>La date « Déposé au » doit être postérieure ou égale à la date « Déposé du ».</li>
```

```sh
curl -s -u "$AUTH" "http://localhost:8080/rechercher.do?filedFrom=15/01/2025&filedTo=02/03/2025" | grep -c 'fiche.do'
```

Attendu : `4` (aucune erreur). Une comparaison de chaînes aurait refusé cette
saisie.

```sh
curl -s -u "$AUTH" "http://localhost:8080/recherche.do" | grep 'focusControl ='
```

Attendu : le script généré par l'attribut `focus`.

```
  var focusControl = document.forms["searchForm"].elements["number"];
```

```sh
grep -rnE 'validate\(|html:javascript' fixtures/legacy-app/src/main
```

Attendu : une seule ligne, le commentaire Javadoc de `SearchForm.java`.

Résultats observés sur `dff31c9` pour les autres saisies :

| Saisie | Résultat |
|---|---|
| Numéro `d-0001` | refusé, message du format |
| Numéro `D-0001` | accepté, 1 ligne |
| Déposé du `31/02/2025` | refusé, message « Déposé du » |
| Déposé au `1/3/2025` | refusé, message « Déposé au » |
| du = au = `15/01/2025` | accepté, « Aucun dossier ne correspond à vos critères. » |
| Formulaire vide | accepté, 31 lignes |

`npm test` : 3 fichiers, 10 tests, tous verts.

Dans le navigateur, sur la même pile, l'humain a vérifié : le focus est sur
« Numéro » au chargement, les accents des messages s'affichent
correctement, et la saisie est conservée après un refus.

## Pour aller plus loin

- Ticket suivant de l'étape 1 : #5, la fiche dossier (écran 2), avec ses
  règles `required` et `maxlength` dans `validation.xml`, `Ctrl+S`, le
  `focus` sur « Objet » et l'ordre de tabulation par `tabindex`
  (`TRAPS.md`).
- Question reportée de `TRAPS.md` : faut-il garder le texte exact des
  messages d'erreur en stratégie Design System ?
- ADR 0001 (`docs/adr/0001-pieges-a-corriger-et-a-preserver.md`) : pourquoi
  ce piège est à préserver et non à corriger.
- Limite connue : `validation.xml` lit les dates avec `SimpleDateFormat`
  (`dd/MM/yyyy`), et les clés dérivées avec `DateTimeFormatter`
  (`dd/MM/uuuu`, `STRICT`). La relecture de la spec a noté qu'ils
  pourraient diverger sur des années atypiques. Aucun cas essayé ne les a
  fait diverger.
