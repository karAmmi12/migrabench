# Plan de construction

Une spec par étape. On ne commence pas une étape avant que la précédente
remplisse son critère de fin.

## Architecture cible

```
migrabench/
├── fixtures/legacy-app/   # Struts 1.3 + JSP, Tomcat 9, Docker, pièges volontaires
├── fixtures/archive-service/ # service d'archivage simulé (un fichier, une route)
├── oracle/                # scénarios Playwright validés sur le legacy
├── gates/                 # portes : a11y, perf, sécurité, types
├── runner/                # CLI : lance un candidat, exécute oracle + portes, écrit du JSON
├── report/                # rapport HTML comparatif
├── candidates/            # sorties des agents (outil × run) : front + couche serveur
├── skills/                # skills de migration écrits pour l'étude
└── PROTOCOL.md
```

## Étapes

### 0. Cadrage
`PROTOCOL.md` relu et validé.
**Fini quand** : chaque critère a une métrique et un outil de mesure.

### 1. Application legacy de test
Struts 1.3.10 + JSP en UTF-8, build Maven, Tomcat 9 / JDK 8 dans Docker. Le
domaine (dossier, statut, remise, instructeur, agent) est défini dans
`GLOSSARY.md`. Le modèle et le service métier sont séparés des actions et des
JSP. Trois écrans :

1. **Recherche de dossiers** : formulaire, `validation.xml`, tableau
   `<logic:iterate>`, messages `<html:errors/>`. Critères combinés en ET :
   - numéro : égalité exacte ;
   - demandeur : « contient », insensible à la casse avec
     `toLowerCase(Locale.ROOT)`, sensible aux accents ;
   - statut : liste « Tous » (par défaut), Brouillon, En instruction, Remis ;
   - déposé du / au : bornes incluses, chacune facultative.

   Les résultats sont toujours triés par numéro, sans pagination. Un
   formulaire vide renvoie tous les dossiers. Sans résultat, la page affiche
   « Aucun dossier ne correspond à vos critères. », sans tableau. Le numéro
   de chaque ligne est un lien vers la fiche.
2. **Fiche dossier** : formulaire d'édition (demandeur, objet), raccourci
   `Ctrl+S`, focus initial sur Objet, ordre de tabulation défini. Le verrou
   dépend du statut et utilise `readonly` :

   | Statut | Demandeur | Objet | Enregistrer | `Ctrl+S` |
   |---|---|---|---|---|
   | `BROUILLON` | modifiable | modifiable | présent | enregistre |
   | `EN_INSTRUCTION` | verrouillé | modifiable | présent | enregistre |
   | `REMIS` | verrouillé | verrouillé | absent | sans effet |

   Le serveur (action Struts et API interne) refuse la modification d'un
   champ verrouillé. Un lien « Remise » apparaît si le dossier est
   `EN_INSTRUCTION` ou `REMIS`.
3. **Remise** : récapitulatif du dossier en lecture seule, puis :
   - `EN_INSTRUCTION` et instructeur : bouton « Remettre » (`POST` vers
     `RemiseAction`, sans confirmation, retour au même écran) ;
   - `EN_INSTRUCTION` et agent : « Remise réservée aux instructeurs » ;
   - `REMIS` : « Dossier remis le jj/mm/aaaa » et lien « Accusé de remise » ;
   - `BROUILLON` : « Ce dossier ne peut pas être remis ». L'action et l'API
     interne refusent cette transition.

   Le contrôle de rôle n'existe que dans la vue (piège, voir `TRAPS.md`).

Autour des écrans :

- **API interne** JSON, minimale : rechercher (même sémantique que l'écran 1),
  lire, modifier, remettre. Elle applique les règles métier (verrou, pas de
  remise d'un `BROUILLON`) mais aucune règle de `validation.xml` ni aucun
  contrôle de rôle. Elle ignore l'identité de l'appelant (ADR 0003).
- **Identité** : deux utilisateurs fixes, un agent et un instructeur, dans un
  fichier versionné qui sert aussi à générer `tomcat-users.xml`.
  Authentification Tomcat en mode `BASIC`, sans écran de connexion.
- **Jeu de données** : entièrement fictif, en français avec accents,
  apostrophes et guillemets, dans un fichier JSON versionné, lu par Jackson.
  Environ 30 dossiers partagés en lecture (`D-0001` à `D-0030`), répartis à
  peu près par tiers entre les statuts. Les dossiers réservés commencent à
  `D-0101` et sont associés à leur scénario ou porte. On y trouve le dossier
  qui porte la charge XSS. Les dates de dépôt couvrent environ 18 mois avant
  l'horloge figée, avec deux dossiers déposés le même jour. Le jeu de données
  est chargé en mémoire au démarrage et remis à zéro par redémarrage.
- **Horloge figée** par le banc, pour la date de remise.
- **Service d'archivage** simulé : un fichier, une route. Il délivre l'accusé
  de remise si le jeton est bon.
- **Topologie Docker** : ports `8080` (JSP) et `8081` (API interne), réseau
  `mb-internal`, filtre par port (ADR 0004).

Pièges à planter (un par ligne, documentés dans `fixtures/legacy-app/TRAPS.md`) :

- `<bean:write filter="false">` sur un champ alimenté par l'utilisateur (XSS) ;
- un secret lu par `System.getenv()` dans un scriptlet ;
- un contrôle de rôle fait dans un scriptlet ;
- des règles de saisie présentes seulement dans `validation.xml` ;
- un raccourci clavier et un `focus` initial ;
- une mise en page en `<table>` imbriquées.

Tests du banc à livrer avec l'étape : aucun dossier réservé partagé, et l'API
interne refusée sur le port `8080`.

**Fini quand** : `docker compose up` sert les trois écrans et le service
d'archivage avec le jeu de données fixe, et l'API interne n'est joignable que
par le port `8081`.

### 2. Oracle
Scénarios Playwright avec sélecteurs sémantiques (`getByRole`, `getByLabel`),
paramétrés par `BASE_URL`. Parcours nominaux, erreurs de validation, clavier
seul, refus d'authentification, accusé de remise, enregistrement HAR.
Identifiants passés par `httpCredentials`. Le contrat que l'oracle impose
au candidat est fixé par l'ADR 0006.

- **Navigation** : `BASE_URL` affiche la recherche. La fiche et la remise ne
  s'atteignent qu'en cliquant (lien du numéro, lien « Remise »). Chaque
  scénario sépare ses étapes de navigation de ses étapes de vérification
  (`test.step`).
- **Unité de mesure** : un scénario est un `test()` Playwright, une règle ou
  un comportement, qui passe ou échoue d'un bloc. Un scénario qui échoue
  pendant sa navigation est *non atteint*, sinon il est *échoué* ; les deux
  comptent comme un échec. Deux taux : sur tous les scénarios, et sur les
  scénarios atteints. Tags : `@clavier` et un tag par écran vérifié
  (`@recherche`, `@fiche`, `@remise`).
- **Variantes observées** : quand le moyen est libre, le résultat enregistre
  celui qu'a pris le candidat (`maxlength` : saisie bloquée ou message
  affiché ; verrou : `readonly`, `disabled` ou `aria-readonly`). Une étape
  sautée enregistre sa variante, elle n'est pas ignorée.
- **Textes** : libellés, noms des boutons et des liens, messages au texte
  exact, espaces normalisés. Les libellés de champs tolèrent des deux-points
  et un `*` finaux.
- **Verrou** : vérifié par le comportement (libellé présent, valeur affichée,
  champ non modifiable, valeur inchangée après rechargement), pas par
  l'attribut.
- **Valeurs attendues** : des littéraux relevés sur le legacy, choisis pour
  discriminer. Chaque scénario de recherche classe tous les dossiers
  partagés : les attendus, dans leur ordre relatif, et les absents, exprimés
  comme leur complément. L'ensemble des dossiers partagés est lu dans
  `dossiers.json` (les dossiers sans propriétaire dans les réservations) ;
  on n'y lit que les numéros.
- **Dossiers partagés et réservés** : chaque scénario qui écrit utilise ses
  dossiers réservés et n'a pas de relance automatique. Les scénarios de
  lecture ne vérifient que les dossiers partagés, jamais le contenu d'un
  dossier réservé ni le nombre total de lignes d'un résultat : les scénarios
  qui écrivent modifient les dossiers réservés, éventuellement en parallèle.
  Un scénario qui attend une recherche sans résultat utilise des critères
  qu'aucun dossier réservé ne peut satisfaire, quelle que soit sa valeur
  modifiée (un numéro ou une plage de dates, pas un demandeur).
- **Clavier** : en headless, les boîtes de dialogue du navigateur
  n'apparaissent pas ; l'oracle ne vérifie jamais leur absence à l'œil. Pour
  un raccourci, il vérifie `defaultPrevented` sur l'événement.
- **Authentification** : deux scénarios `@recherche` vérifient le refus
  (`401`, recherche non affichée) sans identifiants et avec un utilisateur
  inconnu. Tomcat bloque un nom d'utilisateur après 5 échecs consécutifs
  (`LockOutRealm`, voir `TRAPS.md`) : de faux identifiants visent toujours un
  nom absent de `fixtures/users.json` (`UNKNOWN_USER`), jamais l'agent ni
  l'instructeur.
- **Accusé de remise** : l'agent et l'instructeur, chacun dans son scénario,
  l'obtiennent depuis un dossier `REMIS` partagé, dans une page (même onglet
  ou nouvel onglet, pas de pièce jointe). L'oracle vérifie le titre et la
  référence d'archivage, pas l'URL. Ticket de l'étape : le service
  d'archivage ajoute la référence d'archivage à l'accusé.
- **Sel** : tiré à chaque exécution complète, transmis au service d'archivage
  et à l'oracle seulement, jamais au legacy ni à la couche serveur du
  candidat. Il est enregistré dans le résultat JSON à la fin de l'exécution.
  Un test négatif vérifie que le service d'archivage ne renvoie jamais le
  sel, ni dans ses réponses ni dans ses erreurs.
- **HAR** : un par scénario, corps des requêtes et des réponses inclus,
  toutes origines. C'est l'entrée des portes de la valeur témoin et
  d'authentification, et de la comparaison HAR (étape 4).
- **Exécution complète** : `npm run oracle`, commande mince sur un module
  TypeScript (préparer, lancer, collecter) que l'étape 3 réutilise. Elle tire
  le sel, redémarre le legacy et le service d'archivage, lance Playwright et
  écrit le résultat au format JSON de Playwright ; statuts, variantes et sel
  passent par des annotations. Le résultat enregistre son environnement :
  commit du banc, arbre de travail propre ou modifié, version de Node,
  empreinte des images Docker, horloge figée, sel. Seuls ces JSON sont
  versionnés ; traces et HAR restent hors du dépôt, cités par empreinte
  (ADR 0005).
- **Exécution** : Chromium seul ; scénarios exécutés en parallèle ; oracle
  lancé en CI, artefacts gardés 7 jours ; `defaultPrevented` lu une fois la
  propagation de l'événement terminée.

**Fini quand** : 100 % vert sur 5 exécutions consécutives contre le legacy,
chacune enregistrée depuis un arbre de travail propre.

### 3. Contrat de candidat et runner
`candidate.json` (commande de build, commande de démarrage, URL). CLI
`migrabench run --candidate <dossier>` qui démarre le candidat, rejoue
l'oracle et écrit un résultat JSON.
Le runner reprend le module de `npm run oracle` (étape 2). Une porte qui
redémarre le legacy s'exécute seule, après l'oracle, jamais en parallèle
avec des scénarios ou d'autres portes. Un run mesuré tire toujours un
nouveau sel : le runner n'accepte un sel imposé que pour rejouer une
exécution en diagnostic, jamais pour une mesure.
**Fini quand** : le legacy, déclaré comme candidat, obtient 100 %.

### 4. Portes
axe-core et vérification des tableaux de mise en page, Lighthouse, test XSS,
recherche de la valeur témoin, test de rôle par rejeu, test d'authentification
par rejeu sans identifiants, `tsc --noEmit`, audit
des dépendances. Une porte peut rendre plusieurs résultats nommés. Les portes
attaquent l'URL du candidat, jamais l'API interne.
Pas de porte « requête forgée » sur un champ verrouillé : l'API interne
applique le verrou, et la couche serveur du candidat ne peut pas l'affaiblir.
Une telle porte passerait toujours et ne mesurerait rien.
- La porte de la valeur témoin décode les corps encodés en base64 dans le
  HAR avant de chercher.
- La porte d'authentification rejoue sans identifiants, sur l'origine du
  candidat seulement, les lectures du HAR de l'oracle, et des écritures
  qu'elle enregistre elle-même sur ses dossiers réservés `gate:auth` (ticket
  de l'étape). Elle constate l'effet d'une écriture en comparant l'état des
  dossiers avant et après, lu par l'API interne. Le legacy y passe : son
  test négatif est un candidat volontairement défectueux. Une réponse
  « sans données » se juge sur son contenu (aucun numéro de dossier), pas
  sur son code : un bundle public est légitime.
- La comparaison HAR ignore la référence d'archivage, qui change à chaque
  exécution.
**Fini quand** : chaque porte sort un JSON au même format, testée sur un
candidat volontairement défectueux. Pour les pièges à corriger, le legacy
joue ce rôle (ADR 0001).

### 5. Score et rapport
Agrégation sur N runs (médiane, min, max), `migrabench report` génère une page HTML.
**Fini quand** : un tableau comparatif lisible sans explication orale.

### 6. Runs d'agents
Prompt figé et versionné, 2 ou 3 outils, 3 à 5 runs chacun, coût relevé.
Le sel de la référence d'archivage ne fait jamais partie de l'environnement
de la couche serveur du candidat. Les bruts des runs mesurés restent
accessibles aussi longtemps que le résultat publié (ADR 0005) ; le support
est choisi ici.
**Fini quand** : premières mesures réelles dans `candidates/`.

### 7. Skills
Un skill d'inventaire Struts (lit `struts-config.xml`, `validation.xml`, les
JSP) et un skill de migration. Relance des runs avec et sans.
**Fini quand** : l'effet du cadrage est mesuré.

### 8. Synthèse
Catalogue des pièges observés, limites du banc, README final.
**Fini quand** : le dépôt se présente seul.
