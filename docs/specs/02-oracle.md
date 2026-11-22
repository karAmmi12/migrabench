---
etape: 2
titre: Oracle
statut: ready-for-agent
issue: 30
sources: PROTOCOL.md, docs/PLAN.md (étape 2), GLOSSARY.md, fixtures/legacy-app/TRAPS.md, ADR 0003, 0005, 0006
---

# Spec — Étape 2 : oracle

Valeurs attendues relevées sur le legacy le 21/11/2026, sur `main` à
`52aa92b`, pile `docker compose up` en marche (agent, `curl` sur
`/rechercher.do`, `/fiche.do`, `/remise.do`).

## Problème

Le legacy existe (étape 1), mais rien ne dit encore ce qu'est une migration fidèle. Sans oracle, le banc ne peut ni mesurer la fidélité aux usages d'un candidat, ni se valider sur lui-même (règle 6 de `PROTOCOL.md` : le legacy doit obtenir 100 % à l'oracle). Les pièges à préserver (règles de `validation.xml`, `Ctrl+S`, focus initial, ordre de tabulation) ne sont mesurés nulle part. Les portes de l'étape 4 (valeur témoin, authentification par rejeu, comparaison HAR) n'ont pas d'entrée : elles attendent des HAR enregistrés par l'oracle. Et le runner de l'étape 3 n'a pas de module à réutiliser pour lancer une exécution complète.

## Solution

Un oracle Playwright (Chromium seul) qui tourne tel quel contre le legacy et contre tout candidat, paramétré par la seule `BASE_URL` (ADR 0006). Il compte 38 scénarios, un par règle ou comportement. Chaque scénario navigue depuis `BASE_URL` en cliquant, puis vérifie des textes exacts et des comportements, jamais des moyens. Il enregistre un HAR par scénario et les variantes observées. `npm run oracle` lance une exécution complète : il tire un sel, redémarre le legacy et le service d'archivage, lance Playwright et écrit un résultat JSON versionné qui enregistre son environnement et cite traces et HAR par empreinte (ADR 0005). Le service d'archivage ajoute à l'accusé de remise une référence d'archivage calculée avec ce sel, que seul l'oracle peut vérifier.

## User stories

### Mainteneur du banc

1. En tant que mainteneur du banc, je veux lancer une exécution complète de l'oracle avec `npm run oracle`, pour obtenir un résultat sans étape manuelle.
2. En tant que mainteneur du banc, je veux que `npm run oracle` redémarre le legacy et le service d'archivage avant de lancer Playwright, pour que chaque exécution parte du jeu de données initial.
3. En tant que mainteneur du banc, je veux qu'un nouveau sel soit tiré à chaque exécution complète, pour qu'un accusé de remise fabriqué ne puisse pas porter la bonne référence d'archivage.
4. En tant que mainteneur du banc, je veux que le sel ne soit transmis qu'au service d'archivage et à l'oracle, pour que ni le legacy ni la couche serveur du candidat ne puissent calculer la référence.
5. En tant que mainteneur du banc, je veux que le résultat JSON enregistre le commit du banc et l'état de l'arbre de travail (propre ou modifié), pour que chaque preuve cite l'état exact où elle a été obtenue.
6. En tant que mainteneur du banc, je veux que le résultat enregistre la version de Node, celles de Chromium et de `@playwright/test`, l'empreinte des images Docker et l'horloge figée, pour pouvoir rejouer une exécution dans le même environnement.
7. En tant que mainteneur du banc, je veux que le sel soit enregistré dans le résultat à la fin de l'exécution seulement, pour pouvoir rejouer une exécution en diagnostic sans exposer le sel pendant la mesure.
8. En tant que mainteneur du banc, je veux que seuls les JSON de résultat soient versionnés, et que traces et HAR soient cités par leur SHA-256, pour que le dépôt ne grossisse pas sans limite (ADR 0005).
9. En tant que mainteneur du banc, je veux que l'oracle tourne en CI avec ses traces, HAR et JSON gardés 7 jours en artefacts, pour relire un échec sans le reproduire.
10. En tant que mainteneur du banc, je veux que les scénarios s'exécutent en parallèle, pour garder une exécution complète courte.
11. En tant que mainteneur du banc, je veux qu'aucun scénario n'ait de relance automatique, pour qu'un scénario qui écrit ne retrouve pas son dossier réservé déjà modifié, et pour qu'une instabilité se voie.
12. En tant que mainteneur du banc, je veux un test qui prouve que le service d'archivage ne renvoie jamais le sel, ni dans ses réponses ni dans ses erreurs, pour que le sel reste inaccessible au candidat.
13. En tant que mainteneur du banc, je veux un test qui prouve que la référence d'archivage dépend du numéro et du sel, pour qu'elle distingue un vrai accusé d'un faux.
14. En tant que mainteneur du banc, je veux que les faux identifiants visent toujours un nom absent de `fixtures/users.json`, pour que le `LockOutRealm` de Tomcat ne bloque jamais l'agent ou l'instructeur.
15. En tant que mainteneur du banc, je veux un dossier réservé `REMIS` de plus pour le scénario « `Ctrl+S` sans effet », pour qu'un candidat défectueux qui enregistre quand même n'écrive pas sur un dossier partagé.

### Rédacteur de l'oracle

16. En tant que rédacteur de l'oracle, je veux des sélecteurs sémantiques (rôle, libellé), pour que l'oracle s'applique à un candidat qui n'a ni les id ni les classes du legacy.
17. En tant que rédacteur de l'oracle, je veux comparer libellés, noms de boutons et de liens et messages au texte exact, espaces normalisés, en tolérant seulement deux-points et `*` finaux sur les libellés de champs, pour appliquer le contrat de l'ADR 0006.
18. En tant que rédacteur de l'oracle, je veux séparer dans chaque scénario les étapes de navigation des étapes de vérification (`test.step`), pour distinguer un scénario non atteint d'un scénario échoué.
19. En tant que rédacteur de l'oracle, je veux lire l'ensemble des dossiers partagés dans `dossiers.json` (les dossiers sans propriétaire dans les réservations), en n'y lisant que les numéros, pour que les scénarios de recherche classent tous les dossiers partagés sans recopier le jeu de données.
20. En tant que rédacteur de l'oracle, je veux des valeurs attendues littérales, relevées sur le legacy et choisies pour discriminer, pour qu'un candidat approximatif échoue.
21. En tant que rédacteur de l'oracle, je veux que les scénarios de lecture n'observent que les dossiers partagés, jamais le contenu d'un dossier réservé ni le nombre total de lignes, pour qu'ils restent justes pendant que d'autres scénarios écrivent en parallèle.
22. En tant que rédacteur de l'oracle, je veux qu'une recherche sans résultat utilise un numéro ou une plage de dates, pour qu'aucun dossier réservé modifié ne puisse la satisfaire.
23. En tant que rédacteur de l'oracle, je veux vérifier un raccourci par `defaultPrevented`, lu une fois la propagation terminée, pour ne jamais juger à l'œil une boîte de dialogue qu'un navigateur headless n'affiche pas.
24. En tant que rédacteur de l'oracle, je veux vérifier le verrou par le comportement (libellé présent, valeur affichée, champ non modifiable, valeur inchangée à la relecture), pour accepter `readonly` et `disabled`, les seuls verrous valides d'un champ de formulaire natif.
25. En tant que rédacteur de l'oracle, je veux enregistrer la variante observée quand le moyen est libre (verrou, `maxlength`, onglet de l'accusé), pour que le rapport montre le moyen choisi par chaque candidat.
26. En tant que rédacteur de l'oracle, je veux qu'une étape sautée à cause d'une variante soit enregistrée comme telle, pour qu'elle ne passe pas pour une étape ignorée.
27. En tant que rédacteur de l'oracle, je veux passer les identifiants par `httpCredentials`, depuis `fixtures/users.json`, pour authentifier le legacy et le candidat de la même façon.
28. En tant que rédacteur de l'oracle, je veux un HAR par scénario, corps des requêtes et des réponses inclus, toutes origines, pour alimenter les portes de l'étape 4.

### Agent (rôle métier), tel que l'oracle le vérifie

29. En tant qu'agent, je veux que le focus soit sur « Numéro » à l'ouverture de la recherche, pour taper tout de suite.
30. En tant qu'agent, je veux qu'un formulaire vide renvoie tous les dossiers, triés par numéro, pour parcourir le portefeuille.
31. En tant qu'agent, je veux retrouver un dossier par numéro exact.
32. En tant qu'agent, je veux rechercher un demandeur avec « contient », sans tenir compte de la casse, mais en tenant compte des accents.
33. En tant qu'agent, je veux filtrer par statut, et par dates de dépôt « du » et « au », bornes incluses et chacune facultative.
34. En tant qu'agent, je veux que les critères se combinent en ET.
35. En tant qu'agent, je veux voir « Aucun dossier ne correspond à vos critères. » quand rien ne correspond.
36. En tant qu'agent, je veux qu'un numéro ou une date mal formés, ou une date « au » antérieure à « du », soient refusés avec le message exact du legacy, en gardant ma saisie.
37. En tant qu'agent, je veux ouvrir la fiche d'un dossier en cliquant sur son numéro, et y voir son numéro, son statut, sa date de dépôt, son demandeur et son objet, accents et guillemets compris.
38. En tant qu'agent, je veux que le focus soit sur « Objet » à l'ouverture de la fiche, et que la tabulation suive Objet → Demandeur → Enregistrer, même quand Demandeur est verrouillé.
39. En tant qu'agent, je veux enregistrer avec le bouton « Enregistrer » ou avec `Ctrl+S`, et retrouver mes valeurs à la relecture.
40. En tant qu'agent, je veux qu'un demandeur ou un objet vide (ou fait d'espaces), ou trop long, ne soit jamais enregistré.
41. En tant qu'agent, je veux que le demandeur soit verrouillé sur un dossier `EN_INSTRUCTION`, et que tout soit verrouillé, sans « Enregistrer », sur un dossier `REMIS`.
42. En tant qu'agent, je veux que `Ctrl+S` n'ait aucun effet sur un dossier `REMIS`, sans ouvrir la boîte d'enregistrement du navigateur.
43. En tant qu'agent, je veux un lien « Remise » sur la fiche d'un dossier `EN_INSTRUCTION` ou `REMIS`, et aucun sur un `BROUILLON`.
44. En tant qu'agent, je veux voir sur l'écran de remise un récapitulatif en lecture seule du dossier.
45. En tant qu'agent, je veux voir « Remise réservée aux instructeurs », sans bouton « Remettre », sur un dossier `EN_INSTRUCTION`.
46. En tant qu'agent, je veux obtenir l'accusé de remise d'un dossier `REMIS` dans une page, pour prouver la remise.

### Instructeur, tel que l'oracle le vérifie

47. En tant qu'instructeur, je veux remettre un dossier `EN_INSTRUCTION` d'un clic sur « Remettre », sans confirmation, et voir « Dossier remis le » suivi de la date de l'horloge figée.
48. En tant qu'instructeur, je veux obtenir l'accusé de remise d'un dossier `REMIS`, avec son titre et sa référence d'archivage.

### Utilisateur non authentifié

49. En tant que visiteur sans identifiants, je dois être refusé (`401`) sans voir la recherche.
50. En tant que visiteur avec un nom d'utilisateur inconnu, je dois être refusé de la même façon.

### Auteur du runner (étape 3)

51. En tant qu'auteur du runner, je veux un module TypeScript en trois temps (préparer, lancer, collecter), dont `npm run oracle` n'est qu'une commande mince, pour le réutiliser sans le dupliquer.
52. En tant qu'auteur du runner, je veux que le module prenne `BASE_URL` en paramètre, pour lancer l'oracle contre l'URL d'un candidat.
53. En tant qu'auteur du runner, je veux que le module accepte un sel imposé, pour rejouer une exécution en diagnostic, et qu'il en tire un nouveau par défaut.

### Auteur des portes (étape 4)

54. En tant qu'auteur des portes, je veux un HAR par scénario, cité par empreinte dans le résultat, pour y chercher la valeur témoin et y prendre les requêtes à rejouer sans identifiants.
55. En tant qu'auteur des portes, je veux que le HAR d'un scénario contienne aussi les requêtes vers le service d'archivage, pour que la porte de la valeur témoin voie le jeton du lien « Accusé de remise ».

### Lecteur du rapport (étape 5)

56. En tant que lecteur du rapport, je veux pour chaque scénario son statut (réussi, échoué, non atteint), ses tags et ses variantes observées, pour comprendre où un candidat décroche.
57. En tant que lecteur du rapport, je veux deux taux, sur tous les scénarios et sur les scénarios atteints, pour séparer « l'écran n'est pas joignable » de « l'écran se comporte mal ».
58. En tant que lecteur du rapport, je veux le nombre de scénarios `@clavier` réussis, pour la métrique « clavier seul » de `PROTOCOL.md`.

## Décisions d'implémentation

### Modules

- **Scénarios de l'oracle** (Playwright, TypeScript) : 38 scénarios répartis par écran, en lecture seule pour l'agent IA qui produit un candidat (règle 3).
- **Outils partagés des scénarios** : une fixture par rôle (`agent`, `instructeur`, sans identifiants, utilisateur inconnu) qui crée un contexte avec `httpCredentials` et un HAR dédié au scénario ; les trois chemins de navigation (vers la recherche, la fiche, la remise) ; la lecture des numéros affichés ; l'ensemble des dossiers partagés ; l'enregistrement du statut atteint et des variantes ; la mesure de `defaultPrevented` ; le calcul de la référence d'archivage attendue.
- **Module d'exécution complète** : interface profonde, un seul point d'entrée, réutilisé par l'étape 3.

  ```ts
  // Forme de l'interface, pas une implémentation.
  executeOracle(options: {
    baseUrl: string;        // défaut : http://localhost:8080 (le legacy)
    salt?: string;          // imposé : diagnostic seulement, jamais pour une mesure
  }): Promise<{ resultFile: string; summary: OracleSummary }>;
  ```

  En interne, trois temps :
  1. **préparer** : tirer le sel (32 octets aléatoires, en hexadécimal) sauf s'il est imposé ; recréer les conteneurs `legacy` et `archive` (ce qui remet le jeu de données à zéro) à partir des images existantes, sans les reconstruire, avec le sel passé au seul service d'archivage, et attendre qu'ils soient sains ; relever l'environnement.
  2. **lancer** : Playwright avec `BASE_URL`, le sel dans l'environnement du seul processus Playwright, le reporter JSON, les traces et HAR écrits dans `.oracle-artifacts/<identifiant de l'exécution>/`, dossier du projet ignoré par Git, que le job de CI téléverse.
  3. **collecter** : calculer le SHA-256 de chaque HAR et de chaque trace, les ajouter au résultat comme annotations du scénario, classer chaque scénario, calculer les taux, ajouter le sel, écrire le résultat JSON versionné.
- **`npm run oracle`** : commande mince sur `executeOracle`. Elle rend un code de sortie non nul si un scénario n'a pas réussi.
- **Collecte (fonction pure)** : prend le JSON de Playwright et les empreintes, rend le résultat enrichi. C'est elle que testent les tests Vitest.
- **Service d'archivage** (ticket de l'étape, prévu par `TRAPS.md`) : ajoute la référence d'archivage à l'accusé.
- **Jeu de données** : ajout du dossier réservé `D-0116`, `REMIS` avec une date de remise, propriétaire `scenario:sheet-ctrl-s-remis`. Les dossiers partagés restent `D-0001` à `D-0030`. Aucun piège n'est touché.
- **CI** : un workflow qui lance `npm run oracle` sur la pile Docker, Chromium seul, et garde traces, HAR et JSON 7 jours en artefacts. Actions épinglées par SHA. La construction des images est une étape distincte de l'exécution complète. Un job de preuve, pour le critère de fin, construit les images une seule fois puis lance l'oracle 5 fois sur ces mêmes images ; entre deux exécutions, la pile est redémarrée et un nouveau sel est tiré (voir « Notes »).
- **Dépendance ajoutée** : `@playwright/test`, à justifier dans la PR (l'oracle est défini comme des scénarios Playwright par `PROTOCOL.md`).

### Référence d'archivage et sel

- **Calcul** : `HMAC-SHA256(clé = sel, message = numéro du dossier)`, les 12 premiers caractères hexadécimaux en majuscules. La clé est le sel pris comme texte (les octets UTF-8 de sa forme hexadécimale), comme `openssl dgst -sha256 -hmac <sel>`, pas ses octets décodés. L'accusé l'affiche dans une ligne « Référence d'archivage : `<référence>` », sous le titre existant.
- **Transmission du sel** : variable `ARCHIVE_SALT`, passée par la composition Docker au seul service `archive`, depuis l'environnement du shell, jamais depuis `.env` (que lit aussi le legacy). Elle ne fait pas partie des variables transmises à la couche serveur du candidat (ADR 0004).
- **Sans `ARCHIVE_SALT`** : le service d'archivage tire son propre sel au démarrage et ne le révèle pas. La pile reste utilisable par `docker compose up` et par `npm test` ; seuls les scénarios de l'accusé échouent hors de `npm run oracle`, ce qui est voulu.
- **Sel de développement** : `npm run stack:up` tire un sel, démarre la pile avec et l'écrit dans `.dev-archive-salt`, ignoré par Git, que relit `npm test` quand le shell n'a pas d'`ARCHIVE_SALT`. Ce sel est sur le disque en clair : il ne sert jamais à une exécution mesurée, qui tire toujours le sien. Le passer à `ORACLE_SALT` se voit dans le résultat (`saltImposed: true`).
- **Le service ne renvoie jamais le sel** : ni dans l'accusé, ni dans un refus (`403`), ni dans un `404`, ni dans un en-tête.
- **L'oracle vérifie la référence, pas l'URL** : le candidat doit passer par sa couche serveur pour garder le jeton, il peut donc relayer ou réafficher l'accusé, mais il ne peut pas calculer la référence.

### Contrat de navigation (ADR 0006)

- **Vers la recherche** : ouvrir `BASE_URL`. Atteint quand le champ de libellé « Numéro » est visible.
- **Vers la fiche de `D-xxxx`** : recherche, saisir `D-xxxx` dans « Numéro », cliquer « Rechercher », cliquer le lien de nom `D-xxxx`. Atteint quand le champ « Objet » est visible.
- **Chargement sans identifiants valides** (R17, R18) : ouvrir `BASE_URL`. Atteint dès qu'une réponse HTTP arrive, quel que soit son statut. Une erreur de connexion rend le scénario non atteint : elle ne doit pas se confondre avec un front qui accepte l'accès sans identifiants.
- **Vers la remise de `D-xxxx`** : fiche, cliquer le lien « Remise ». Atteint quand l'objet du dossier est affiché en texte (récapitulatif), au sens de la règle de présence ci-dessous.
- **Relecture** : nouvelle navigation vers la fiche dans une nouvelle page du même contexte, avec une assertion réessayée un nombre fixe de fois (une seule constante, avec son intervalle). La constante `REREAD` vaut 5 essais de 500 ms : l'intervalle borne l'attente de l'assertion à chaque essai, il n'est pas une pause entre deux essais. L'attente des assertions vaut donc 5 × 500 ms au plus, en plus des navigations. Le scénario enregistre combien d'essais ont été nécessaires (annotation `mb:reread-attempts`). Ce réessai n'est jamais une relance du scénario. Pas de `page.reload()` : l'ADR 0006 n'impose aucune route rechargeable.
- **Numéros affichés** : la suite des liens dont le nom est exactement un numéro (`D-` suivi de 4 chiffres), dans l'ordre du document. Un scénario de recherche filtre cette suite sur les dossiers partagés et la compare à la liste attendue : égalité exacte, donc ordre relatif et absence du complément vérifiés d'un coup. **Stabilité** : une fois la liste attendue relevée, l'oracle attend l'intervalle de `REREAD` (500 ms) sans rien faire, puis relit la liste ; elle ne doit pas avoir changé. Un candidat qui affiche la bonne liste puis la remplace échoue (constaté sur un candidat factice, #34). S'applique à R2 à R16, y compris à l'absence de numéros de R11 à R16.
- **Refus d'une saisie de recherche** : le message est affiché, puis aucun numéro de dossier partagé n'est affiché, ni à ce relevé ni après l'intervalle de stabilité.
- **Présence et absence d'un texte** (règle de toute la spec) : une vérification de présence accepte au moins une occurrence exacte affichée du texte (ou du nom accessible, pour un lien) ; un candidat qui répète un texte, par exemple un numéro dans un fil d'Ariane, n'est pas jugé infidèle pour autant. Une vérification d'absence n'en accepte aucune. Appliquée à F3 et à M1 à M4.

### Scénarios

Identifiant en anglais (titre du `test()` et nom du propriétaire `scenario:` pour les dossiers réservés). Rôle : agent sauf mention. « Partagé » : dossier en lecture seule pour tous.

#### Recherche — `@recherche` (18 scénarios)

| # | Identifiant | Tags | Dossier | Navigation | Vérifications |
|---|---|---|---|---|---|
| R1 | `search-initial-focus` | `@recherche @clavier` | — | recherche | le focus est sur le champ « Numéro » |
| R2 | `search-empty-form` | `@recherche` | partagés | recherche | « Rechercher » sans critère → `D-0001` à `D-0030`, dans l'ordre |
| R3 | `search-number-exact` | `@recherche` | partagés | recherche | Numéro `D-0007` → `D-0007` seul |
| R4 | `search-applicant-contains-case` | `@recherche` | partagés | recherche | Demandeur `pERRIN` → `D-0016` seul (« Jérôme Perrin-Lagarde » : milieu du nom, autre casse) |
| R5 | `search-applicant-accents` | `@recherche` | partagés | recherche | Demandeur `Elodie` → `D-0004` seul ; `D-0001` (« Élodie Marchand ») absent |
| R6 | `search-status` | `@recherche` | partagés | recherche | Statut « Remis » → `D-0001`, `D-0004`, `D-0007`, `D-0010`, `D-0013`, `D-0016`, `D-0019`, `D-0022`, `D-0025`, `D-0028` |
| R7 | `search-filed-same-day` | `@recherche` | partagés | recherche | Déposé du `14/02/2025` au `14/02/2025` → `D-0012`, `D-0019` (bornes incluses, même jour) |
| R8 | `search-filed-from-only` | `@recherche` | partagés | recherche | Déposé du `27/10/2025` seul → `D-0030` seul |
| R9 | `search-filed-to-only` | `@recherche` | partagés | recherche | Déposé au `06/05/2024` seul → `D-0001` seul |
| R10 | `search-criteria-and` | `@recherche` | partagés | recherche | Demandeur `d'` et Statut « Remis » → `D-0007`, `D-0019` ; `D-0026` (« d' », Brouillon) absent |
| R11 | `search-no-result` | `@recherche` | — | recherche | Numéro `D-0999` → « Aucun dossier ne correspond à vos critères. », aucun numéro affiché |
| R12 | `search-number-mask` | `@recherche` | — | recherche | Numéro `D-1` → refusé ; « Le numéro doit être au format D- suivi de 4 chiffres, par exemple D-0001. » ; « Numéro » garde `D-1` |
| R13 | `search-number-spaces` | `@recherche` | — | recherche | Numéro `D-0001 ` (espace final) → refusé avec le même message ; la valeur saisie est gardée |
| R14 | `search-filed-from-format` | `@recherche` | — | recherche | Déposé du `2025-01-01` → refusé ; « La date « Déposé du » doit être au format jj/mm/aaaa. » ; valeur gardée |
| R15 | `search-filed-to-format` | `@recherche` | — | recherche | Déposé au `31/02/2025` (date impossible) → refusé ; « La date « Déposé au » doit être au format jj/mm/aaaa. » ; valeur gardée |
| R16 | `search-filed-range-order` | `@recherche` | — | recherche | Déposé du `02/01/2025` au `01/01/2025` → refusé ; « La date « Déposé au » doit être postérieure ou égale à la date « Déposé du ». » ; les deux valeurs gardées |
| R17 | `auth-no-credentials` | `@recherche` | — | chargement de `BASE_URL`, atteint dès qu'une réponse HTTP arrive ; une erreur de connexion rend le scénario non atteint | sans identifiants : au moins une réponse `401` de l'origine de `BASE_URL`, et le champ « Numéro » n'est pas affiché |
| R18 | `auth-unknown-user` | `@recherche` | — | comme R17 | utilisateur inconnu (absent de `fixtures/users.json`) : mêmes vérifications que R17 |

#### Fiche — `@fiche` (14 scénarios)

| # | Identifiant | Tags | Dossier | Navigation | Vérifications |
|---|---|---|---|---|---|
| F1 | `sheet-initial-focus` | `@fiche @clavier` | `D-0002` partagé, `BROUILLON` | fiche | le focus est sur le champ « Objet » |
| F2 | `sheet-tab-order` | `@fiche @clavier` | `D-0003` partagé, `EN_INSTRUCTION` (Demandeur verrouillé) | fiche | focus mis sur « Objet », puis `Tab` → « Demandeur », `Tab` → bouton « Enregistrer » |
| F3 | `sheet-content` | `@fiche` | `D-0006` partagé | fiche | textes `D-0006`, « En instruction », `22/07/2024` ; « Demandeur » vaut `Société "Bâtir Ensemble"` ; « Objet » vaut `Permis d'aménager d'un lotissement` |
| F4 | `sheet-save-brouillon` | `@fiche` | `D-0102` réservé, `BROUILLON` | fiche | nouveaux Demandeur et Objet (accentués), « Enregistrer » → relecture : les deux valeurs enregistrées |
| F5 | `sheet-save-en-instruction` | `@fiche` | `D-0103` réservé, `EN_INSTRUCTION` | fiche | nouvel Objet, « Enregistrer » → relecture : Objet enregistré, Demandeur inchangé |
| F6 | `sheet-ctrl-s` | `@fiche @clavier` | `D-0104` réservé, `BROUILLON` | fiche | nouvel Objet, `Ctrl+S` → `defaultPrevented` vrai ; relecture : Objet enregistré |
| F7 | `sheet-applicant-required` | `@fiche` | `D-0105` réservé | fiche | Demandeur fait de trois espaces et nouvel Objet, « Enregistrer » → « Le demandeur est obligatoire. » ; le formulaire garde les deux saisies ; relecture : rien n'a changé |
| F8 | `sheet-applicant-maxlength` | `@fiche` | `D-0106` réservé | fiche | 81 caractères tapés dans Demandeur. Variante `maxlength` : saisie bloquée (valeur ≤ 80) → vérifications 2 et 3 sautées et enregistrées ; sinon « Enregistrer » → « Le demandeur doit faire 80 caractères au plus. » et saisie gardée. Dans les deux cas, relecture : aucune valeur de plus de 80 caractères |
| F9 | `sheet-subject-required` | `@fiche` | `D-0107` réservé | fiche | Objet vidé, « Enregistrer » → « L'objet est obligatoire. » ; saisie gardée ; relecture : rien n'a changé |
| F10 | `sheet-subject-maxlength` | `@fiche` | `D-0108` réservé | fiche | comme F8 avec 201 caractères dans Objet et « L'objet doit faire 200 caractères au plus. » |
| F11 | `sheet-lock-en-instruction` | `@fiche` | `D-0109` réservé, `EN_INSTRUCTION` | fiche | « Demandeur » : libellé présent, valeur affichée, non modifiable ; une frappe ne le change pas ; « Objet » modifiable ; « Enregistrer » présent ; après « Enregistrer », relecture : Demandeur inchangé. Variante `lock` |
| F12 | `sheet-lock-remis` | `@fiche` | `D-0110` réservé, `REMIS` | fiche | « Demandeur » et « Objet » : libellés présents, valeurs affichées, non modifiables ; une frappe ne change aucun des deux ; aucun bouton « Enregistrer » ; relecture : valeurs inchangées. Variante `lock` |
| F13 | `sheet-ctrl-s-remis` | `@fiche @clavier` | `D-0116` réservé (nouveau), `REMIS` | fiche | `Ctrl+S` → `defaultPrevented` vrai ; relecture : valeurs inchangées. La mesure repose sur `defaultPrevented` : la relecture ne peut pas échouer, car l'API interne refuse (`409`) toute modification d'un dossier `REMIS` et la couche serveur du candidat passe par elle (ADR 0003) |
| F14 | `sheet-remise-link` | `@fiche` | `D-0002` (`BROUILLON`), `D-0003` (`EN_INSTRUCTION`), `D-0001` (`REMIS`), partagés | fiche de chacun, en alternant navigation et vérification | lien « Remise » absent sur `D-0002`, présent sur `D-0003` et `D-0001` |

#### Remise — `@remise` (6 scénarios)

| # | Identifiant | Tags | Dossier | Navigation | Vérifications |
|---|---|---|---|---|---|
| M1 | `remise-summary` | `@remise` | `D-0001` partagé, `REMIS` | remise | textes `D-0001`, « Élodie Marchand », « Permis de construire d'une véranda », « Remis », `06/05/2024` ; aucun champ modifiable |
| M2 | `remise-remis` | `@remise` | `D-0004` partagé, `REMIS` | remise | « Dossier remis le 02/08/2024 » ; lien « Accusé de remise » présent ; pas de bouton « Remettre » |
| M3 | `remise-agent-reserved` | `@remise` | `D-0003` partagé, `EN_INSTRUCTION` | remise | « Remise réservée aux instructeurs » ; pas de bouton « Remettre » |
| M4 | `remise-instructeur` | `@remise` | `D-0111` réservé, `EN_INSTRUCTION` ; instructeur | remise | bouton « Remettre » présent ; clic (toute boîte de dialogue est refusée, donc « sans confirmation » est exigé) → « Dossier remis le 15/11/2025 » (horloge figée) ; plus de bouton « Remettre » ; lien « Accusé de remise » présent |
| M5 | `receipt-agent` | `@remise` | `D-0007` partagé, `REMIS` | remise | clic « Accusé de remise » → une page (même onglet ou nouvel onglet), pas un téléchargement ; titre « Accusé de remise du dossier D-0007 » ; la référence d'archivage attendue est affichée. Variante `receipt-tab` |
| M6 | `receipt-instructeur` | `@remise` | `D-0010` partagé, `REMIS` ; instructeur | remise | comme M5 pour `D-0010` |

Totaux : 38 scénarios, dont 5 `@clavier` (R1, F1, F2, F6, F13).

Valeurs relevées sur le legacy (voir l'en-tête) : R2 à R11, les messages et valeurs gardées de R12 à R16, F3, F14, M1 à M3. Celles de F4 à F13, M4 à M6 sont à relever pendant l'écriture des scénarios concernés, et citées dans leur PR.

### Comportement du legacy non mesuré

- **« Ce dossier ne peut pas être remis »** : l'écran de remise d'un dossier `BROUILLON` affiche ce message, mais aucun scénario ne le vérifie. Raison : il est inaccessible par navigation. La fiche d'un `BROUILLON` n'a pas de lien « Remise » (vérifié par F14), et l'oracle n'atteint un écran qu'en cliquant depuis `BASE_URL` (ADR 0006).
- **Ce qui reste garanti** : la règle métier derrière le message ne dépend pas de l'écran. L'API interne refuse la remise d'un `BROUILLON` (`409`, le dossier reste `BROUILLON`), et `RemiseAction` aussi. Un test du Seam A le vérifie déjà. Comme la couche serveur du candidat passe par l'API interne (ADR 0003), elle ne peut pas affaiblir ce refus.
- Le comportement est inscrit dans les limites connues de `PROTOCOL.md`.

### Limites connues des scénarios

- **M4 ne reconnaît que les boîtes de dialogue du navigateur** (`alert`, `confirm`, `prompt`). Elles sont toutes refusées, et toute boîte refusée fait échouer M4 en la nommant (`Dialog refused: …`) : demander une confirmation, ou afficher une boîte même de simple information, est un changement d'usage. Une confirmation affichée dans la page (une fenêtre modale en HTML, un second bouton à cliquer) n'est pas reconnue comme une boîte de dialogue : M4 échoue alors aussi, puisque « Dossier remis le 15/11/2025 » n'apparaît pas, mais avec un message générique (texte attendu absent), qui ne dit pas qu'une confirmation a été demandée.
- **M5 et M6 ne guettent un téléchargement que jusqu'au chargement de l'accusé.** Un téléchargement lancé après l'événement `load` de la page (par un script, par exemple) n'est pas reconnu comme tel. Le scénario échoue quand même si l'accusé n'est pas affiché comme une page, mais avec un message générique (texte attendu absent) au lieu de `Receipt downloaded as an attachment (…)`.
- **Pièce jointe ouverte dans un nouvel onglet : le message dépend de l'ordre des événements.** Chromium ouvre l'onglet puis le ferme, et signale le téléchargement sur la page du lien. Si l'ouverture de l'onglet arrive avant le téléchargement et que l'onglet se ferme avant lui, M5 et M6 échouent sur l'onglet fermé (« Target closed ») au lieu de nommer le téléchargement. Le scénario échoue quand même, seul le message est moins précis.
- **La stabilité d'une liste n'est vérifiée que sur l'intervalle de `REREAD`.** Une liste remplacée plus de 500 ms après le relevé conforme n'est pas vue : l'oracle ne la relit qu'une fois.
- **Un composant non natif avec `aria-readonly` n'est pas pris en charge par l'oracle.** Un `role="textbox"` marqué `aria-readonly="true"` est non éditable pour Playwright, mais F11 et F12 lisent la valeur affichée par `toHaveValue`, qui exige un champ de formulaire : le scénario échoue sur cette lecture, pas sur le verrou.

### Variantes observées

| Clé | Valeurs | Scénarios |
|---|---|---|
| `lock` | `readonly`, `disabled` | F11, F12 |
| `maxlength` | `input-blocked`, `message` | F8, F10 |
| `receipt-tab` | `same-tab`, `new-tab` | M5, M6 |

La variante est lue (attribut, onglet) pour être enregistrée, jamais pour juger : le jugement reste sur le comportement. Le non-modifiable s'appuie sur l'état « éditable » de Playwright et, pour F11 et F12, sur une frappe qui ne doit pas changer la valeur affichée : un verrou qui ne tient pas au clavier échoue, quel que soit son moyen. Sur un champ de formulaire natif, seuls `readonly` et `disabled` sont des verrous valides. `aria-readonly` seul y laisse le champ modifiable : c'est un faux verrou, et l'échec de F11 et F12 est voulu (constaté sur un candidat factice, #36).

### Résultat JSON

Format du reporter JSON de Playwright, enrichi par la collecte. Un fichier par exécution complète, versionné. Contenu :

- **Métadonnées de l'exécution** (`config.metadata`) :
  - `benchCommit` : commit du banc ;
  - `worktree` : `clean` ou `dirty` ;
  - `node` : version de Node ;
  - `chromium` : version du Chromium lancé par l'oracle (sans canal, en headless), relevée par `browser.version()` ;
  - `playwright` : version de `@playwright/test` installée ;
  - `images` : empreinte des images Docker `legacy` et `archive` ;
  - `frozenDate` : horloge figée (`FROZEN_DATE`) ;
  - `baseUrl` ;
  - `artifacts` : dossier des bruts de l'exécution, `.oracle-artifacts/<identifiant de l'exécution>`, depuis la racine du dépôt. Les pièces jointes des scénarios y sont citées par des chemins relatifs à ce dossier ; tout autre chemin du résultat est relatif à la racine du dépôt ;
  - `ciRun` : identifiant de l'exécution de CI et rang de l'exécution complète dans le job (1 à 5 pour le job de preuve), présent seulement en CI. S'écrit `{"runId", "attempt", "rank"}` : `attempt` est la tentative de l'exécution de CI, car une relance garde le même identifiant. Le nom du fichier le reprend : `<horodatage>-<commit court>-ci<runId>.<attempt>-<rank>.json` ;
  - `salt` : ajouté par la collecte, une fois Playwright terminé ;
  - `saltImposed` : ajouté par la collecte avec le sel ; `true` si le sel a été imposé (`ORACLE_SALT`), donc exécution de diagnostic, `false` s'il a été tiré par l'exécution. Une mesure a toujours `saltImposed: false` ;
  - `summary` : calculé par la collecte : nombre de scénarios, réussis, échoués, non atteints ; taux sur tous les scénarios ; taux sur les scénarios atteints ; scénarios `@clavier` réussis sur leur total.
- **Par scénario** (résultat Playwright, tags compris), annotations :
  - `mb:reach` = `reached`, posée par l'oracle à la fin des étapes de navigation. Échec sans elle : non atteint ; échec avec elle : échoué. Pour un scénario en navigation alternée (F14), posée à la fin de la dernière ;
  - `mb:variant` = `<clé>=<valeur>`, une par variante observée ;
  - `mb:skipped-step` = nom de l'étape sautée et variante qui la justifie ;
  - `mb:reread-attempts` = nombre d'essais qu'a demandés la relecture, une par relecture ;
  - `mb:har` et `mb:trace` = `sha256:<hex>`, ajoutées par la collecte.

Écart signalé avec `docs/PLAN.md` : le plan fait passer le sel « par des annotations ». Une annotation est propre à un scénario, le sel est propre à l'exécution : la spec le place dans les métadonnées, écrites à la fin, ce qui respecte l'intention (sel enregistré à la fin de l'exécution).

### Exécution

- Chromium seul ; scénarios en parallèle (`fullyParallel`) ; aucune relance (`retries: 0`) ; trace et HAR pour chaque scénario.
- HAR : un contexte par scénario, `recordHar` avec les corps inclus, sans filtre d'URL (toutes origines, service d'archivage compris).
- `defaultPrevented` : écouteur `keydown` en phase de capture sur `window`, lecture différée après la fin de la propagation. Vérifié sur le legacy (#35) : la lecture survit à la soumission du formulaire que déclenche `Ctrl+S` (F6), car la page n'est quittée qu'à l'arrivée de la réponse. Si la page est quittée avant la lecture, la mesure échoue avec un message qui le dit, pas sur un délai dépassé : la navigation du cadre principal est guettée côté Node, car une page qui part ne remonte plus rien.
- Faux identifiants : le nom inconnu est une seule constante, partagée avec les tests du Seam A, et vérifiée absente de `fixtures/users.json`.

## Décisions de test

- **Ce qui fait un bon test ici** : il observe un comportement de l'extérieur. Les tests Vitest de la collecte lui donnent un JSON Playwright et des empreintes, et lisent le résultat ; ils ne regardent pas ses fonctions internes. Les tests du service d'archivage passent par HTTP.
- **Seam 1, le plus haut : `npm run oracle` contre le legacy.** C'est le critère de fin : 5 exécutions consécutives dans le job de preuve de la CI, sur les mêmes images, 38 scénarios réussis, aucun non atteint, chacune depuis un arbre de travail propre et versionnée.
- **Seam 2 : Vitest sur la collecte**, avec des JSON Playwright fabriqués, en TDD (rouge d'abord) :
  - échec sans `mb:reach` → non atteint ; échec avec → échoué ; réussi → réussi ;
  - les deux taux et le compte `@clavier` sur un jeu connu, cas zéro scénario atteint compris ;
  - empreintes ajoutées à chaque scénario ; sel ajouté aux métadonnées ;
  - un scénario sans HAR fait échouer la collecte, au lieu d'écrire un résultat incomplet.
- **Seam 3 : Seam A existant, pour le service d'archivage**, la pile démarrée avec un `ARCHIVE_SALT` connu (le workflow de CI en tire un par job) :
  - la référence de l'accusé vaut le HMAC attendu, et change avec le numéro ;
  - test négatif : le sel, en hexadécimal et en base64, n'apparaît ni dans les corps ni dans les en-têtes des réponses `200`, `403` et `404`.
- **Seam B existant** : `D-0116` est `REMIS`, réservé à `scenario:sheet-ctrl-s-remis` seul, et les dossiers partagés restent `D-0001` à `D-0030`.
- **Discrimination des scénarios** : chaque vérification est vue échouer au moins une fois pendant son écriture (attendu volontairement faux, puis corrigé). Le constat est noté dans la fiche du ticket.
- **Antériorité** : `tests/seam-a` (client HTTP du legacy, nom inconnu, identifiants par rôle), `tests/seam-b` (lecture de `dossiers.json`), workflow de CI des tests sur la pile Docker.

## Hors périmètre

- `candidate.json`, `migrabench run` et le lancement d'un candidat (étape 3). Le module d'exécution prend `BASE_URL` ; il ne démarre aucun candidat.
- Les portes (étape 4) : XSS, valeur témoin, rôle par rejeu, authentification par rejeu, tableaux de mise en page, axe-core, Lighthouse, comparaison HAR. L'oracle ne fait aucune assertion sur le demandeur de `D-0101` ni sur les tableaux.
- `Ctrl+Maj+S`, `AltGr+S`, `Cmd+S` : seul `Ctrl+S` est vérifié (`TRAPS.md`).
- Firefox et Safari.
- L'agrégation sur N runs et le rapport HTML (étape 5).
- Le support de conservation des bruts des runs mesurés (étape 6).

## Notes

- **Critère de fin** (`docs/PLAN.md`) : 100 % vert sur 5 exécutions consécutives contre le legacy, chacune enregistrée depuis un arbre de travail propre. Preuve :
  - le job de CI de l'oracle d'abord, puis le job de preuve : images construites une seule fois, puis 5 exécutions complètes consécutives sur ces mêmes images, pile redémarrée et nouveau sel tiré entre deux exécutions, sans exécution échouée entre elles ;
  - leurs 5 résultats JSON, récupérés depuis les artefacts et versionnés, chacun avec son `ciRun` (identifiant de l'exécution de CI et rang, dans la métadonnée et dans le nom du fichier), `worktree: clean`, `saltImposed: false`, 38 scénarios réussis et 0 non atteint ;
  - les 5 résultats montrent le même commit, la même version de Node, la même horloge figée et la même empreinte des images `legacy` et `archive`. L'empreinte est identique par construction ; le critère le vérifie ;
  - les 5 sels sont tous différents ;
  - les tests Vitest verts, et la PR qui cite le job de preuve par son lien.
- La règle 6 (le legacy déclaré comme candidat obtient 100 %) se vérifie à l'étape 3 ; ce critère de fin en est la condition.
- Suite prévue : `/to-tickets` sur cette spec. Premier ticket naturel : la référence d'archivage et `D-0116`, qui ne dépendent pas de Playwright.
