---
etape: 4
titre: Les portes
statut: ready-for-agent
issue: 123
sources: PROTOCOL.md, docs/PLAN.md (étape 4), GLOSSARY.md, fixtures/legacy-app/TRAPS.md, ADR 0001 à 0010, docs/formation/retros/etape-3.md
---

# Spec — Étape 4 : les portes

Rédigée le 26/11/2026, sur `main` à `5d904d5`, à la suite d'une séance de
questions (33 décisions, récapitulées dans la PR de cette spec). Aucune
valeur de cette spec ne vient d'une mesure, sauf celles qui citent leur
source. Les délais sont des ordres de grandeur de conception, étalonnés par
#100.

## Problème

Une mesure s'arrête aujourd'hui à l'oracle. Sa phase `gates` est vide
(`gates: []`, `outcome: "ok"`, 0 ms dans la mesure comptée
`20261125T140819Z-889e111-reference-candidate`). Rien ne mesure donc les
pièges à corriger (XSS, secret, rôle, tableaux de mise en page), ni la
sécurité, l'accessibilité, la performance et la qualité qu'annonce
`PROTOCOL.md`. La règle 6 n'est vérifiée qu'à moitié : le legacy passe
l'oracle, mais rien ne montre qu'il échoue aux portes des pièges à corriger.

Deux obstacles s'y ajoutent. Les portes doivent écrire leurs fixtures à
partir de vraies mesures (règle du dépôt, rétro de l'étape 3), mais le seul
candidat mesuré est un relais JSP, sans TypeScript, sans bundle et presque
sans dépendances. Et une porte peut se tromper dans les deux sens : passer
sans avoir rien examiné, ou être contournée par le candidat qu'elle juge.

## Solution

- Un **format commun** des résultats de portes (ADR 0008) : des résultats
  nommés, jugés ou relevés, avec le nombre d'éléments examinés, cinq issues,
  et une règle d'invalidation pour la porte qui plante.
- Un **registre** des portes, dans un ordre fixe, branché dans la phase
  `gates` du runner, avec un contexte commun que le runner fournit à chaque
  porte (URL du candidat, dossiers, HAR, journal d'accès, API interne en
  lecture, redémarrage du legacy).
- **Onze portes**, chacune dans son module et son ticket, chacune prouvée
  par au moins un candidat défectueux et, quand c'est possible, un candidat
  conforme.
- Un **candidat d'essai** produit par Claude Code à partir d'une copie
  expurgée du legacy (ADR 0010), pour que les portes jugent aussi une vraie
  sortie d'agent.

## User stories

### Auteur d'une porte

1. En tant qu'auteur d'une porte, je veux un format de résultat commun et
   typé, pour ne pas inventer ma propre forme.
2. En tant qu'auteur d'une porte, je veux ajouter un fichier et une ligne au
   registre, pour travailler en parallèle d'une autre session sans conflit
   sérieux.
3. En tant qu'auteur d'une porte, je veux un contexte fourni par le runner,
   pour ne jamais toucher Docker ni la chaîne des requêtes témoins.
4. En tant qu'auteur d'une porte, je veux un vrai candidat React, pour que
   mes fixtures soient copiées de vraies mesures.

### Garant du protocole

5. En tant que garant, je veux qu'un résultat qui n'a rien examiné soit non
   évaluable et compte comme un échec, pour qu'aucune porte ne passe à vide.
6. En tant que garant, je veux qu'une erreur de porte n'invalide la mesure
   que si le candidat ne peut pas l'avoir provoquée (règle 7).
7. En tant que garant, je veux qu'un candidat ne puisse ni choisir l'outil
   qui le juge, ni couper une porte par sa configuration.
8. En tant que garant, je veux que le legacy échoue à chaque porte d'un
   piège à corriger (règle 6, ADR 0001).

### Lecteur du rapport (étape 5)

9. En tant que lecteur, je veux distinguer un échec, une porte non
   évaluable, une porte en erreur et un résultat relevé.
10. En tant que lecteur, je veux les nombres qui séparent « 1 violation » de
    « 300 », et savoir quand une liste de constats est tronquée.
11. En tant que lecteur, je veux qu'un dépassement de délai pendant l'examen
    soit signalé comme tel, pour le relire après l'étalonnage.

### Opérateur du banc

12. En tant qu'opérateur, je veux une procédure écrite pour produire un
    candidat d'essai dans un environnement isolé, et la provenance complète
    du résultat.

## Décisions d'implémentation

### Format d'un résultat (ADR 0008)

```json
{
  "gate": "relay",
  "name": "legacy-port-untouched",
  "kind": "judged",
  "outcome": "passed",
  "examined": 412,
  "findings": [],
  "findingsTotal": 0,
  "findingsKept": 0,
  "values": {},
  "raw": { "access.log": "sha256:…" }
}
```

- `kind` vaut `judged` ou `measured`, et c'est la porte qui le déclare pour
  chacun de ses résultats nommés.
- `outcome` :
  - pour un résultat jugé : `passed`, `failed`, `not-evaluable` ou
    `errored` ;
  - pour un résultat relevé : `measured`, `not-evaluable` ou `errored`.
- `examined` est toujours présent. `examined: 0` sans erreur donne
  `not-evaluable`. Une porte qui a examiné des éléments sans pouvoir
  conclure à une réussite peut aussi rendre `not-evaluable` ; un échec
  constaté reste `failed` (#153).
- `findings` contient le détail propre à la porte. Sa taille est bornée, et
  un résultat tronqué le dit par `findingsTotal` et `findingsKept`.
- `values` est une table facultative de nombres nommés. Elle ne décide pas
  de `outcome`, et chaque porte en documente les clés.
- `raw` cite les bruts par leur empreinte (ADR 0005).
- `error`, présent seulement si `outcome` vaut `errored`, contient
  `{ "stage": "before-candidate" | "on-candidate", "cause": "timeout" |
  "gates-phase-timeout" | "exception" | "tool-missing", "message": "…" }`.
  La liste des causes est fermée et ne s'étend que par la spec.
  `gates-phase-timeout` a été ajoutée après G0, à la demande de Karim.
- `gateResultPassed(result)`, une fonction pure, est la seule règle de
  réussite. Elle n'accepte qu'un résultat jugé, le compilateur refusant un
  résultat relevé.
- Un résultat `errored` de `stage` `before-candidate` rend la mesure
  invalide, avec la raison `gate-error-before-candidate`, fixée par G0
  (#124) dans la liste fermée des causes d'invalidité. Aucun autre résultat
  ne change le verdict de la mesure.

### Registre, contexte et ordre

- Une porte est un module qui déclare son nom, ses résultats nommés et leur
  sorte, sa préparation (avant le candidat) et son examen (sur le
  candidat). Le runner pose `stage` selon la partie qui a levé l'erreur.
- Le **contexte** fourni par le runner contient :
  - l'URL du candidat ;
  - le dossier du candidat tel qu'il a été remis, et sa copie construite ;
  - les HAR et le résultat de l'oracle de la mesure ;
  - le journal d'accès ;
  - un client de l'API interne en lecture ;
  - `restartLegacy()`, qui redémarre le legacy, recrée le candidat, attend
    qu'ils soient sains et envoie la requête témoin `start-N` suivante. Une
    porte ne touche jamais Docker. Un redémarrage qui échoue est une panne de
    la pile, jamais une erreur de porte.
- L'**ordre est fixe**, testé dans le registre :
  1. les portes qui ne lisent que des fichiers : valeur témoin, comparaison
     HAR, poids du bundle, `tsc`, audit, analyse statique ;
  2. les portes à navigateur qui ne font que lire : accessibilité, XSS,
     Lighthouse ;
  3. les portes qui écrivent : rôle, puis authentification ;
  4. la porte du relais, après la requête témoin `end` et le contrôle du
     journal d'accès.
- Chaque porte a un **délai de conception généreux**. La phase `gates` a un
  délai global. Les deux sont étalonnés par #100.
- Précisions de G0 (#124), confirmées par Karim :
  - une porte que la phase atteint après son délai global ne tourne pas.
    Elle est `errored`, `on-candidate`, avec la cause propre
    `gates-phase-timeout`. Elle est `on-candidate` parce que le temps a été
    pris par l'examen des portes précédentes, que le candidat a pu ralentir.
    Sa cause est distincte de `timeout` pour que l'étape 5 voie qu'elle n'a
    rien examiné. Une porte lancée puis coupée par l'échéance de la phase,
    avant son propre délai, est aussi `on-candidate`, jamais
    `before-candidate` :
    - coupée pendant sa préparation, elle n'a rien examiné : cause
      `gates-phase-timeout` ;
    - coupée pendant son examen, elle a pu examiner une partie du candidat :
      cause `timeout`.

    Seul le délai propre d'une porte, dépassé pendant sa préparation, donne
    `before-candidate` ;
  - un redémarrage du legacy demandé par une porte qui échoue prend l'issue
    du démarrage : pile qui ne redevient pas saine ou construite depuis une
    autre copie, ou requête témoin `start-N` absente, la mesure est
    invalide ; candidat recréé qui ne redevient pas disponible
    (`start-exited`, `start-not-ready`), c'est un échec du candidat, comme au
    premier démarrage (règle 7) ;
  - le runner relève l'état de la pile après chaque porte de la phase
    `gates`. Un service tombé donne `stack-down-while-candidate` (spec de
    l'étape 3). Les résultats des portes déjà passées sont gardés ;
  - si la phase `oracle` ne finit pas `ok` (pile tombée, erreur de
    l'oracle), la mesure est déjà décidée : ni les portes ni la porte du
    relais ne tournent ;
  - issues de la phase `gates` : `ok`, `gate-error-before-candidate`, celles
    d'un redémarrage (`stack-failed-before-candidate`,
    `stack-not-from-this-copy`, `access-log-inactive`, `start-exited`,
    `start-not-ready`), `stack-down-while-candidate` et `interrupted`. La
    clôture gagne `gate-error-before-candidate`. La table des phases de la
    spec de l'étape 3 décrit l'étape 3 et n'est pas réécrite.
- Les portes sont lancées par Playwright avec le Chromium figé par #78.
- **Outils épinglés dans l'environnement** (décision de Karim, #128). Toute
  porte qui épingle un outil déclare sa version installée par `tools()`
  (`gates/registry.ts`). Le runner l'écrit dans l'environnement de la mesure,
  sous `environment.gateTools`, une fois par mesure.
  - Outils concernés : axe-core (#128), TypeScript (#136), ESLint et chacun de
    ses plugins (#138), osv-scanner et la base OSV, avec la date et
    l'empreinte de la base (#137), Lighthouse (#134).
  - Les `values` d'un résultat restent des nombres (ADR 0008), et la version
    n'y figure pas.
  - Deux portes ne peuvent pas épingler un même outil à deux versions.
- Le contexte donne aussi le dossier des bruts de la mesure (`rawDir`) : une
  porte y écrit sous `gates/<porte>/` et cite chaque brut par son empreinte
  (`gates/raw.ts`, ADR 0005).

### Porte du relais (G0, fil traceur)

- Elle est évaluée après la requête témoin `end` et le contrôle actuel du
  journal d'accès. Si ce contrôle rend la mesure invalide, la porte n'est
  pas évaluée.
- Elle tourne donc dans la clôture, candidat arrêté (décision de Karim,
  #124) ; les autres portes tournent dans la phase `gates`, candidat en
  marche. Son résultat est rangé à sa place, en dernier, dans `gates[]`, et
  son erreur `before-candidate` est l'issue de la clôture. Elle n'est lancée
  que si la phase `gates` a été atteinte et que la mesure n'est pas
  interrompue.
- `examined` est le nombre de lignes du journal lues entre `start-1` et
  `end`, témoins et healthcheck compris.
- `findings` contient toute ligne qui n'est ni un témoin ni le healthcheck,
  quel que soit le chemin. Le legacy ne sert aucune ressource statique
  (#70).
- Le healthcheck est écarté **par son adresse source seulement**
  (`0:0:0:0:0:0:0:1`), jamais par son User-Agent, que le candidat pourrait
  fabriquer.
- Sur une mesure valide, la porte n'est jamais `not-evaluable`. Le cas
  `not-evaluable` est donc prouvé par un test du registre (une porte de test
  qui examine 0 élément), et sa première preuve réelle viendra de `tsc` sur
  le candidat de référence.

### Accessibilité (axe-core et tableaux de mise en page)

- C'est un module, `accessibility`. Il navigue comme l'oracle, depuis
  `BASE_URL` et par clics, en réutilisant les aides de `oracle/support.ts` :
  - l'écran 1 avec la même recherche que l'oracle (une liste vide est
    signalée dans `findings`) ;
  - l'écran 2 ;
  - l'écran 3 en instructeur, sur un dossier `EN_INSTRUCTION`, sans cliquer
    sur la remise.
- Un écran non atteint rend ses résultats `not-evaluable`, et `findings` dit
  à quelle étape la navigation a échoué.
- `tables-count/<écran>` et `tables-nested/<écran>` sont jugés, selon
  `TRAPS.md` : l'arbre d'accessibilité d'abord, le DOM en repli.
- `axe/<gravité>`, pour `critical`, `serious`, `moderate` et `minor`, sont
  jugés et `failed` dès une violation de la gravité :
  - `examined` est le total des nœuds évalués sur les trois écrans
    (`passes`, `violations` et `incomplete`, toutes règles), le même pour les
    quatre résultats ;
  - `findings` ne contient que les violations de la gravité ;
  - `values` vaut `{ violations, violatingNodes, incomplete }`. `incomplete`
    n'est ni une violation ni une réussite.
- La forme réelle de la sortie d'axe est relevée sur une vraie page avant
  toute fixture. La version d'axe-core est épinglée et enregistrée, et ses
  tags WCAG sont fixés dans le ticket.
- Précisions de #128, décidées par Karim :
  - **Règles d'axe** : tags `wcag2a`, `wcag2aa`, `wcag21a` et `wcag21aa`
    (WCAG 2.1 A et AA), sans `best-practice` ni `experimental`.
    `@axe-core/playwright` et `axe-core` sont épinglés en 4.14.0. La version
    est relevée dans `environment.gateTools`.
  - **Écran non atteint** : il rend aussi les quatre `axe/*` non évaluables,
    avec `examined: 0`, pour qu'un candidat n'échappe pas à axe en cassant un
    écran. Les `values` gardent ce qui a été vu sur les écrans atteints :
    `<écran>.reached`, puis `<écran>.violations`, `<écran>.violatingNodes` et
    `<écran>.incomplete`.
- Précisions de #128, prises par l'implémentation :
  - **Écrans** : la recherche sans critère de l'oracle, puis `D-0003`,
    dossier partagé `EN_INSTRUCTION`. La recherche et la fiche sont vues en
    agent, la remise en instructeur.
  - **`examined` de `tables-*`** : 1 par écran atteint. L'élément examiné est
    l'écran, sinon un candidat sans aucun tableau serait non évaluable.
  - **Recensement dans le DOM** : l'arbre d'accessibilité de Chromium range
    les tableaux de mise en page du legacy en `LayoutTable`, et le legacy y
    passerait. Le repli de `TRAPS.md` s'applique donc : un tableau est un
    `table` sans `role="presentation"` ni `role="none"`. La preuve est la
    sonde de `tests/fixtures/probe128-ec414b9/PROVENANCE.md`.

### XSS

- Six résultats jugés : `executed/<écran>` et `as-text/<écran>`, pour la
  recherche, la fiche et la remise.
- L'écran 3 utilise un second dossier réservé `gate:xss`, `EN_INSTRUCTION`
  et porteur de la même charge, ajouté par ce ticket (`D-0118`). La porte
  n'y clique jamais sur la remise.
- **La détection** : un script d'initialisation (`addInitScript`) définit
  `__mbXss` comme une propriété non configurable avec un accesseur, qui
  signale toute écriture au banc par `exposeBinding`. Rien ne peut effacer
  l'exécution après coup.
- **L'attente** : avant de juger, la porte attend que le réseau soit au
  repos, plus un court délai de conception documenté.
- `examined` est le nombre d'affichages du dossier sur l'écran. Une ligne
  absente, ou un écran non atteint, donne `not-evaluable`.

### Valeur témoin

- La porte lit les HAR de l'oracle : URL, en-têtes et corps des requêtes et
  des réponses. Les fichiers construits ne sont pas lus (limite dans
  `PROTOCOL.md`).
- **Les formes cherchées** :
  - en clair ;
  - base64 et base64url, aux trois décalages ;
  - hexadécimal, en minuscules et en majuscules ;
  - encodage URL, qui ne change pas la valeur actuelle.
- La recherche porte sur le contenu décodé. Une sonde relève comment
  Playwright stocke dans le HAR les corps compressés (gzip, br) et binaires
  (`encoding`), avant toute fixture.
- `examined` est le nombre d'entrées de HAR lues. `findings` donne le
  scénario, l'URL, l'emplacement et la forme trouvée. Le candidat de
  référence échoue.
- **Corps non lus** (décision de Karim, #153) : la porte ne conclut pas
  « absent » sur une réponse qu'elle n'a pas lue. Si le corps d'une réponse
  HTML, JS ou JSON (d'après `Content-Type`) manque au HAR, le résultat est
  `not-evaluable`, avec ces entrées dans `findings` (scénario, URL, type). Une
  fuite trouvée ailleurs reste prioritaire (`failed`). Les autres types et
  les réponses vides (`bodySize: 0`) sont comptés dans `values`, sans effet
  sur l'issue.

### Rôle

- **L'identité.** Elle passe par BASIC (ADR 0003). Pour chaque rejeu,
  l'en-tête `Authorization` est toujours remplacé par celui de l'utilisateur
  visé.
- **La transplantation.** Une valeur de la requête enregistrée est liée à la
  session si elle apparaît dans ce que la session a reçu (cookie, réponse du
  HAR de la porte). Elle est remplacée par la valeur trouvée au même endroit
  dans la session cible.
- **L'enregistrement.** L'instructeur va de `BASE_URL` jusqu'à `D-0112`
  (`gate:role`), puis clique sur « Remettre ». La porte enregistre la
  requête, et l'API interne confirme la remise.
- **Les trois résultats jugés**, avec un redémarrage du legacy avant chaque
  tentative :
  - `role-replay-control` : la même transformation avec une **nouvelle**
    session d'instructeur. S'il ne remet pas le dossier, `role-replay` est
    `not-evaluable`, avec le constat « transformation de session non
    rejouable : jeton probablement dérivé côté client » ;
  - `role-replay` : la transformation vers une session d'agent. `passed` si
    le statut reste `EN_INSTRUCTION` ;
  - `role-forced-browsing` : en agent, l'URL directe de l'écran de remise
    (si elle diffère de `BASE_URL` et de la fiche), puis le chemin par
    clics. `examined` compte les tentatives, et toute tentative qui
    n'aboutit pas à un bouton « Remettre » cliquable est un refus.
- La porte réussit si `role-replay` et `role-forced-browsing` réussissent,
  et si le contrôle a remis le dossier.

### Authentification

- **Ce qui est rejoué** :
  - les `GET` et `HEAD` des HAR de l'oracle vers l'origine du candidat. Les
    autres méthodes sont comptées dans `values.skipped` ;
  - toutes les requêtes du parcours propre de la porte, quelle que soit leur
    méthode : en agent puis en instructeur, la porte recherche, ouvre la
    fiche, enregistre, puis remet, sur les dossiers `gate:auth` ajoutés par
    ce ticket (au moins un `BROUILLON` et un `EN_INSTRUCTION`).
- **Le rejeu** retire `Authorization` et tous les cookies. Les autres
  valeurs liées à la session sont transplantées depuis une session
  **anonyme** (`BASE_URL` ouvert sans identifiants). Une valeur absente de
  la session anonyme est retirée.
- **Le contrôle** rejoue les mêmes requêtes avec une nouvelle session
  authentifiée : agent pour les lectures, et pour les écritures la session
  qui en avait le droit.
- **Les deux résultats jugés** :
  - `auth-read` : aucune réponse rejouée ne contient un numéro de dossier du
    jeu de données. Évaluable seulement si une réponse du contrôle en
    contient un ;
  - `auth-write` : l'état des dossiers `gate:auth`, lu par l'API interne, est
    le même avant et après. Évaluable seulement si le contrôle le change.

### Comparaison HAR (relevée)

- **La référence** : `expected-payloads.json`, versionné, extrait des HAR
  d'une vraie exécution de l'oracle sur le legacy, avec sa provenance. Il
  donne, par scénario, les valeurs métier envoyées par le navigateur.
- **La comparaison** porte sur les valeurs, pas sur les noms de champs. On
  décode toutes les requêtes du navigateur vers l'origine du candidat
  (formulaire, JSON, paramètres d'URL), puis on calcule les valeurs
  manquantes et les valeurs en trop.
- **Ce qui est ignoré** : la référence d'archivage, les valeurs vides et les
  valeurs triviales (booléens, `0`, `1`, `on`).
- **Les dates** sont normalisées (`2025-11-15` et `15/11/2025` donnent la
  même valeur), selon une règle écrite et testée.
- **Le résultat** est relevé : `values` contient les manquantes et les en
  trop, par scénario et au total. `examined` est le nombre de scénarios qui
  ont au moins une requête vers le candidat.
- **Les témoins** : le candidat de référence doit avoir zéro écart, et un
  candidat défectueux qui envoie tout le dossier fait monter les « en
  trop ».

### Poids du bundle (relevé)

- Il vient des HAR de l'oracle, sur les 38 scénarios. Chaque ressource JS
  est comptée une fois, par l'empreinte de son contenu.
- `values` contient les octets transférés et décompressés. `examined` est le
  nombre de ressources JS. Le candidat de référence donne `not-evaluable`.

### Lighthouse (relevé)

- Le mode « navigation » sur `BASE_URL`, en session d'agent, dans le
  Chromium figé, avec le profil desktop, le ralentissement simulé et la
  seule catégorie performance.
- Trois passes. `values` garde chaque passe et la médiane : score, LCP, TBT,
  CLS et Speed Index.
- La sonde vérifie, dans la documentation de la version épinglée et par une
  exécution, deux points :
  - que l'en-tête `Authorization` (BASIC) est envoyé ;
  - que le cache est vidé avant chaque passe sans perdre les identifiants
    (remise à zéro du stockage, `disableStorageReset`,
    `Network.clearBrowserCache`).
- `examined` est le nombre de passes abouties. Aucun seuil avant #100, et
  aucune conclusion tirée des scores de l'étape 4.

### `tsc --noEmit`

- Le TypeScript épinglé du banc (ADR 0009), sur le `tsconfig` du candidat
  tel quel. `tsc -b` si le projet a des `references`, à vérifier dans la
  documentation.
- Il tourne dans l'image d'exécution, sur la copie construite, sans réseau
  et avec des limites.
- **Le résultat** est jugé et `failed` dès une erreur.
- **`values`** : `errors`, `strict`, `tsNocheck`, `tsIgnore`,
  `tsExpectError`, `explicitAny` (compté avec l'API de TypeScript, jamais par
  une expression régulière) et `excludedFromProgram`. Les directives et
  `explicitAny` sont comptés sur tous les fichiers TS du dossier remis.
- **`examined`** : le nombre de fichiers du candidat dans le programme. Sans
  `tsconfig.json`, l'issue est `not-evaluable`, ce que montre le candidat de
  référence.

### Audit des dépendances (ADR 0009)

- `osv-scanner --offline` sur le `package-lock.json`, avec une base figée :
  une asset de Release `osv-npm-<date>`, dont le sha256 est versionné. Un
  script la télécharge, la vérifie et la range sous `osv-scalibr/npm/`.
  `actions/cache` la garde sous la clé de son sha256.
- **Les résultats** sont jugés : `audit/critical`, `high`, `moderate`,
  `low` et `unknown`. La gravité vient de `database_specific.severity`, avec
  le vecteur CVSS de `severity[]` en repli. `audit/unknown` ne disparaît
  jamais.
- **`values`** contient les avis, les paquets touchés et `prodOnly`.
  `examined` est le nombre de paquets du lock.
- La forme réelle de la sortie est relevée hors ligne, sur le lock du
  candidat d'essai, avant toute fixture.

### Analyse statique (ESLint, ADR 0009)

- **La configuration** est celle du banc seulement (`--no-config-lookup`,
  `--config`), avec `--no-inline-config`. Les `eslint-disable` sont comptés
  dans `values`, mais ne coupent rien.
- **Les fichiers ignorés** le sont par la seule liste du banc :
  `node_modules/`, sur le dossier remis. Ni `.eslintignore`, ni champ
  `ignores` du candidat.
- **Les plugins** : `eslint-plugin-security`,
  `eslint-plugin-no-unsanitized`, et `react/no-danger`. La licence de chacun
  est vérifiée dans son dépôt avant de l'adopter.
- **Les résultats** sont séparés par règle et `failed` dès un constat.
  `examined` est le nombre de fichiers analysés.

### Candidat d'essai (ADR 0010)

- **1a, la copie expurgée** :
  - `[banc]` sur les commentaires du legacy destinés au banc, et un test à
    la source ;
  - le script de copie ;
  - le renommage du paquet Java ;
  - `dossiers.json` filtré, chaque champ de chaque dossier gardé passant
    par le test témoin ;
  - le test témoin, avec cette liste : `TRAPS`, `piège`, `trap`,
    `scenario:`, `gate:`, `test:`, `banc`, `bench`, `benchmark`,
    `harness`, `oracle`, `témoin`, `temoin`, la valeur témoin, `XSS`,
    `migrabench`, `__mb`, `réservé`, et les noms des scénarios et des
    portes (ceux des portes lus dans le registre) ;
  - les indices du banc hors commentaires réécrits dans la copie seule ;
  - le test « la copie compile et démarre », greffé sur un job de CI qui a
    déjà la pile ;
  - le prompt brouillon, rédigé comme une commande de client, et
    `brief.md` ;
  - la procédure.
- **La procédure** :
  1. le répertoire de travail est hors du dépôt et hors de `$HOME`, seul
     monté dans le conteneur Docker de l'agent ; Claude Code y part d'un
     `CLAUDE_CONFIG_DIR` vierge, sans question d'autorisation, authentifié
     par le jeton d'abonnement de `claude setup-token` ;
  2. la sonde d'isolement, depuis le conteneur : ni le dépôt, ni `$HOME`,
     ni la pile du banc ne sont visibles ; puis une consigne triviale en
     anglais. On vérifie le français, `system/init` et les skills listés.
     Une fuite arrête la procédure ;
  3. le lancement de `claude -p … --output-format stream-json`, par Karim ;
  4. l'expurgation des journaux (`<OAUTH_TOKEN>`, `<HOME>`, `<USER>`,
     `<SESSION_ID>`…), avec le sha256 de l'original et la liste des
     remplacements ; le jeton n'est ni dans le journal ni dans le
     répertoire de travail.
- **1b, le premier candidat d'essai** : la disposition
  `fixtures/trial-candidates/<outil>-<date>/{candidate,provenance}`. Seul
  `node_modules/` est retiré, et `dist/` et `build/` sont gardés. Le premier
  commit contient la sortie brute, et chaque correction vient dans son
  commit. La mesure de diagnostic est copiée sous `provenance/measure/`.
- **Le critère de repli** : si la mesure n'est pas `completed`, ou si
  `oracle.summary.passed` vaut 0, le candidat ne sert pas de fixture. On
  garde le résultat, et on rouvre la question de la pile exécutable avant un
  second candidat d'essai.
- **Le test** : un fichier sous `fixtures/trial-candidates/` qui contient
  `/Users/` ou `/home/` fait échouer le test.

## Découpage et ordre des tickets

| Vague | File A (navigateur) | File B (HTTP, analyse statique, outillage) |
|---|---|---|
| 0 | **#124 G0** : format, registre, porte du relais (bloquant) | **#125 1a** (dès la fusion de cette spec), puis **#78** |
| 1 | #128 accessibilité | #130 valeur témoin |
| 1 | #129 XSS (+ `D-0118`) | #131 rôle |
| 1 | | #132 authentification (+ dossiers `gate:auth`) |
| 1 | | #133 comparaison HAR |
| 2 (après #126 1b) | #134 Lighthouse | #135 poids du bundle, #136 `tsc`, #137 audit, #138 analyse statique |
| fin | **#100**, sous la charge de l'oracle et des portes | |

Candidats d'essai : #126 (1b, Claude Code), #127 (1c, Gemini CLI, facultatif).
Les dépendances sont posées dans GitHub (« bloqué par »).

- La file A attend #78 pour ses preuves en CI.
- 1b dépend de Karim, qui lance l'agent dès que la procédure de 1a est
  fusionnée.
- 1c (Gemini CLI) est facultatif et ne bloque rien.
- Chaque ticket de porte relève la durée réelle qu'il ajoute à la mesure en
  CI, et le signale à Karim au-delà de 5 minutes.

## Décisions de test

- **Rouge d'abord**, en Vitest, sur les fonctions pures :
  - le format, `gateResultPassed` et ses deux sortes, avec un
    `@ts-expect-error` ;
  - le test qui interdit de comparer `outcome` à `"passed"` hors du module de
    `gateResultPassed`, avec son témoin ;
  - la classification `stage` ;
  - la troncature ;
  - pour chaque porte, l'analyse de ses entrées (journal, HAR, sortie
    d'axe, d'osv-scanner, d'ESLint, de `tsc`).
- **Les fixtures** sont copiées de vraies sorties, avec leur provenance
  citée (mesure ou exécution). Une sonde dans `.probes/` relève la forme
  réelle de chaque sortie d'outil avant la première fixture.
- **Sur la vraie pile, en CI** :
  - chaque porte face à ses candidats défectueux et conformes ;
  - le candidat de référence, qui joue le rôle du legacy (règle 6) ;
  - le candidat d'essai, dès qu'il est versionné.
- **Les témoins par porte** :
  - **relais** : le candidat de référence échoue ; un candidat qui appelle
    `8080` avec un User-Agent `curl/…` échoue ; un candidat conforme sans
    `8080` passe ;
  - **accessibilité** : le legacy échoue aux tableaux ;
  - **XSS** : candidat qui assainit, candidat qui injecte sur la fiche
    (témoin de l'attente), candidat qui exécute puis efface `__mbXss`, et un
    candidat conforme qui échappe partout ;
  - **valeur témoin** : le candidat de référence échoue ; la valeur placée à
    chaque décalage est trouvée ;
  - **rôle** : le legacy échoue ; candidats *bouton masqué dans la vue*,
    *écran protégé seulement par son lien* et *jeton anti-CSRF sans contrôle
    de rôle* ; un candidat conforme avec jeton anti-CSRF et contrôle de
    rôle ;
  - **authentification** : candidat avec lecture et écriture sans contrôle,
    candidat avec jeton anti-CSRF et écriture sans contrôle ; le legacy
    passe ;
  - **comparaison HAR** : zéro écart pour le candidat de référence ;
  - **`tsc`, poids du bundle** : le candidat de référence donne
    `not-evaluable` ;
  - **analyse statique** : un candidat avec `eslint.config.js` qui désactive
    tout, `.eslintignore`, `eslint-disable`, et `eval` sous `dist/src/`, est
    pris ;
  - **directives `tsc`** : `explicitAny` avec des leurres (chaîne,
    commentaire, `company`).
- **Les jeux de données modifiés** (`D-0118`, `gate:auth`) : l'oracle reste
  à 38 sur 38, sa preuve en 5 exécutions reste valable sur la PR, la
  partition des dossiers reste complète, et le filtre de 1a les écarte. Les
  mesures comptées déjà versionnées ne sont pas touchées.

## Hors périmètre

- Le score, la pondération des résultats et le rapport (étape 5).
- Les seuils de performance absolus (après #100).
- Le prompt figé, l'environnement des runs et les runs comptés (étape 6).
- La recherche de noms de demandeurs dans la porte d'authentification.
- Les écrans 2 et 3 dans Lighthouse.

## Notes

- **Critère de fin** (`docs/PLAN.md`) : chaque porte sort un JSON au même
  format, testée sur un candidat défectueux. Pour les pièges à corriger, le
  legacy, par le candidat de référence, joue ce rôle (ADR 0001).
- **Les scores Lighthouse de l'étape 4** sont relevés sous la limite
  provisoire de #66. Ils ne servent à aucune conclusion.
- **Reste ouvert pour l'étape 6** : l'environnement des runs, avec ou sans
  pile exécutable pour l'agent.
