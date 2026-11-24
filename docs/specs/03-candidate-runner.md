---
etape: 3
titre: Contrat de candidat et runner
statut: ready-for-agent
issue: 60
sources: PROTOCOL.md, docs/PLAN.md (étape 3), GLOSSARY.md, ADR 0003, 0004, 0005, 0006, 0007
---

# Spec — Étape 3 : contrat de candidat et runner

Rédigée le 23/11/2026, sur `main` à `62a49c4`, qui contient l'ADR 0007 et les
décisions de l'étape 3 (#59). Aucune valeur de cette spec ne vient d'une
mesure : les délais et les limites de ressources sortiront de l'étalonnage,
et ne sont donc pas chiffrés ici.

## Problème

L'oracle existe (étape 2) et passe à 100 % contre le legacy, mais il ne sait
que viser une `BASE_URL` déjà servie. Rien ne dit encore comment un agent IA
livre un candidat, comment le banc le construit et le démarre, ni ce qu'est
le résultat d'une mesure. Sans contrat, un échec peut venir du candidat, de
l'agent qui l'a mal déclaré ou du banc lui-même, et personne ne peut les
distinguer. Sans règles d'invalidation strictes, un candidat défectueux peut
transformer son échec en mesure invalide et échapper à la mesure (règle 7).
Et la règle 6 (le banc validé sur lui-même) n'est pas encore vérifiable : le
legacy n'a jamais été mesuré comme un candidat.

## Solution

Un contrat écrit par l'agent IA, `candidate.json`, validé par un schéma JSON
publié : version du contrat, commande de construction facultative, commande
de démarrage obligatoire. Pas d'URL : le banc impose le port.

Une commande, `migrabench measure --candidate <dossier>`, qui fait une
mesure : elle valide le contrat, construit le candidat puis le démarre dans
l'image d'exécution du banc (ADR 0007), rejoue l'oracle avec le module de
l'étape 2, conserve le journal d'accès du port `8080` du legacy, et écrit un
dossier de résultat, `measure.json` et `oracle.json`. Chaque phase rend une
issue nommée. Le résultat range la mesure dans une catégorie : complète,
échec au contrat, échec du candidat, panne de la pile pendant que le
candidat tourne, ou invalide, et seulement sur une preuve que le candidat ne
peut ni recevoir ni fabriquer. La commande rend un code de sortie parmi
trois : mesure valide, mesure invalide, aucune mesure écrite ; le code `1`
reste réservé au plantage.

Un verrou du banc empêche deux outils du banc de partager la pile. Par
défaut, une mesure est un diagnostic ; `--counted` la prévoit pour compter,
depuis un commit de `main`.

Le banc fournit trois sortes de candidats dans `fixtures/` : le candidat de
référence (le legacy derrière un relais sans logique), le candidat
d'étalonnage (dont les mesures fixent délais et limites) et huit candidats
défectueux, un par issue à prouver. L'étape est finie quand le
candidat de référence obtient 100 % dans une mesure comptée.

## User stories

### Agent IA qui produit un candidat

1. En tant qu'agent IA, je veux un schéma JSON publié de `candidate.json`, pour vérifier mon contrat avant de le livrer.
2. En tant qu'agent IA, je veux déclarer une commande de construction facultative et une commande de démarrage obligatoire, chacune lancée par `sh -c`, pour choisir mes outils de construction sans que le banc les impose.
3. En tant qu'agent IA, je veux que le banc lance `npm ci` avant ma commande de construction, pour n'avoir à fournir que mon `package-lock.json`.
4. En tant qu'agent IA, je veux recevoir le port imposé dans `PORT`, pour écouter là où le banc m'attend sans le deviner.
5. En tant qu'agent IA, je veux recevoir `LEGACY_API_URL`, `ARCHIVE_URL`, `ARCHIVE_TOKEN` et `USERS_FILE` au démarrage seulement, pour que ma couche serveur joigne l'API interne et le service d'archivage (ADR 0004).
6. En tant qu'agent IA, je veux un dossier temporaire en écriture au démarrage, pour écrire des fichiers de travail alors que mon code est monté en lecture seule.
7. En tant qu'agent IA, je veux que le message d'un échec au contrat nomme le champ ou la source fautive, pour comprendre ce que j'ai mal déclaré.

### Opérateur du banc

8. En tant qu'opérateur, je veux lancer une mesure avec `migrabench measure --candidate <dossier>`, pour obtenir un résultat sans étape manuelle.
9. En tant qu'opérateur, je veux qu'une mesure soit un diagnostic par défaut, pour mettre au point le banc sans produire de mesure qui compte.
10. En tant qu'opérateur, je veux prévoir une mesure pour compter avec `--counted`, pour que ce choix soit explicite et visible dans le résultat.
11. En tant qu'opérateur, je veux que `--counted` soit refusé avant toute action si l'arbre de travail est modifié, si le sel ou le plafond des délais est imposé ou si `HEAD` n'est pas atteignable depuis `origin/main`, pour qu'aucune mesure qui compte ne parte d'un état non publié.
12. En tant qu'opérateur, je veux que le refus de `--counted` nomme toutes les conditions manquantes d'un coup, pour tout corriger en une fois.
13. En tant qu'opérateur, je veux que le runner fasse lui-même le `git fetch` avant de vérifier `origin/main`, pour ne pas dépendre d'une copie locale périmée.
14. En tant qu'opérateur, je veux imposer le sel en diagnostic seulement, pour rejouer une exécution passée sans jamais affaiblir une mesure qui compte.
15. En tant qu'opérateur, je veux trois codes de sortie distincts (mesure valide, mesure invalide, aucune mesure écrite), tous différents du code d'un plantage, pour qu'un script ou un job de CI réagisse sans lire le résultat et ne confonde jamais un plantage avec une mesure invalide.
16. En tant qu'opérateur, je veux que le score du candidat n'influe pas sur le code de sortie, pour qu'un candidat qui échoue à l'oracle ne passe pas pour une panne du banc.
17. En tant qu'opérateur, je veux un verrou du banc qui refuse une mesure, une exécution complète de l'oracle, `npm test` ou `npm run stack:up` pendant qu'un autre outil du banc tient la pile, pour que deux outils ne redémarrent pas le legacy l'un sous l'autre.
18. En tant qu'opérateur, je veux que le refus dû au verrou du banc nomme l'outil qui le tient, son processus et l'heure de prise, pour savoir quoi attendre ou arrêter.
19. En tant qu'opérateur, je veux qu'un verrou du banc laissé par un processus mort soit repris, et que la reprise soit enregistrée, pour qu'un plantage ne bloque pas le banc.
20. En tant qu'opérateur, je veux que la construction se fasse dans une copie du candidat, jamais dans le dossier versionné, pour que mesurer ne modifie pas `candidates/` (règle 5).
21. En tant qu'opérateur, je veux que le résultat d'une mesure soit un dossier propre à la mesure, jamais réécrit, pour qu'une mesure reste la preuve de son état.
22. En tant qu'opérateur, je veux que les mesures de diagnostic restent dans un dossier ignoré par Git (`results/diagnostic/`), pour ne pas les versionner par erreur.
23. En tant qu'opérateur, je veux que les mesures prévues pour compter soient toutes versionnées dans `results/counted/`, invalides comprises, pour qu'aucune mesure gênante ne disparaisse.

### Mainteneur du banc

24. En tant que mainteneur du banc, je veux que le runner reprenne le module d'exécution complète de l'oracle (étape 2), pour qu'une mesure et `npm run oracle` jugent un candidat de la même façon.
25. En tant que mainteneur du banc, je veux que le conteneur du candidat soit recréé après le legacy et le service d'archivage, une fois sains, et à chaque redémarrage du legacy, pour que le candidat parte toujours d'une pile neuve (ADR 0007).
26. En tant que mainteneur du banc, je veux que les deux phases du candidat tournent sans root, sans socket Docker, avec le seul dossier du candidat monté et des limites de mémoire et de CPU, parce que son code n'est pas fiable.
27. En tant que mainteneur du banc, je veux que la construction n'ait accès qu'au registre public npm imposé, sans `mb-internal` ni variable du banc, pour qu'elle ne voie ni l'API interne ni la valeur témoin.
28. En tant que mainteneur du banc, je veux qu'un `package-lock.json` qui cite une autre source que ce registre soit un échec au contrat, pour que deux mesures installent les mêmes dépendances.
29. En tant que mainteneur du banc, je veux que seule une erreur réseau sur une requête précise vers le registre, prouvée par le journal de npm, rende la mesure invalide, pour qu'un candidat ne puisse pas faire passer une construction lente pour une panne du registre.
30. En tant que mainteneur du banc, je veux que la composition complémentaire du service `candidate` soit générée pour chaque mesure et citée par empreinte, pour savoir exactement comment le candidat a tourné.
31. En tant que mainteneur du banc, je veux que l'empreinte de l'image d'exécution rejoigne celles des images Docker relevées, pour rejouer une mesure dans le même environnement.
32. En tant que mainteneur du banc, je veux un journal d'accès de Tomcat sur le port `8080`, qui survit aux redémarrages du legacy, conservé comme brut de chaque mesure et cité par empreinte, pour que la porte du relais (étape 4) ait son entrée.
33. En tant que mainteneur du banc, je veux une requête témoin marquée au début et à la fin de la période où le candidat tourne, pour prouver que le journal d'accès était actif pendant toute cette période.
34. En tant que mainteneur du banc, je veux que le marqueur soit tiré à chaque mesure et jamais transmis au candidat, pour qu'un candidat ne puisse pas fabriquer un marqueur hors de son moment et rendre sa mesure invalide.
35. En tant que mainteneur du banc, je veux que les délais de construction et de disponibilité et les limites de mémoire et de CPU valent un multiple déclaré des valeurs mesurées sur le candidat d'étalonnage, pour que ces seuils sortent d'une mesure et pas d'un choix à l'œil.
36. En tant que mainteneur du banc, je veux que l'étalonnage tourne en CI et enregistre son environnement, pour qu'il corresponde à l'environnement des mesures comptées.
37. En tant que mainteneur du banc, je veux que le contrôle des résultats versionnés (#53) s'étende à `measure.json`, pour refuser une mesure versionnée écrite à la main, sous un mauvais Node ou depuis un arbre modifié.
38. En tant que mainteneur du banc, je veux un candidat défectueux par issue à prouver, mesure invalide comprise, pour voir chaque issue se produire au moins une fois sur une vraie pile.
39. En tant que mainteneur du banc, je veux qu'une panne de la pile pendant que le candidat tourne soit comptée contre lui, rangée dans sa propre catégorie avec le service tombé et ses sorties, parce qu'il aurait pu la provoquer (règle 7).

### Garant du protocole

40. En tant que garant du protocole, je veux qu'une mesure ne soit invalide que pour une cause de la liste fermée du glossaire, chacune avec sa preuve, pour qu'aucun candidat ne puisse échapper à la mesure (règle 7).
41. En tant que garant du protocole, je veux que le dépassement d'un délai ou d'une limite soit un échec du candidat, jamais une invalidité, pour la même raison.
42. En tant que garant du protocole, je veux qu'une mesure interrompue soit conservée, invalide pour la cause « interruption », et toujours signalée, pour qu'interrompre une mesure qui tourne mal ne la fasse pas disparaître.
43. En tant que garant du protocole, je veux que le candidat de référence, qui présente le legacy comme un candidat, obtienne 100 % à l'oracle, pour valider le banc sur lui-même (règle 6).
44. En tant que garant du protocole, je veux un test qui prouve que le relais du candidat de référence ne modifie ni les en-têtes ni les corps des réponses du legacy, pour que son 100 % soit celui du legacy.
45. En tant que garant du protocole, je veux que le résultat enregistre une empreinte du contenu du candidat mesuré, pour qu'une correction humaine dans `candidates/` se voie d'une mesure à l'autre (règle 5).
46. En tant que garant du protocole, je veux que le résultat d'une mesure comptée enregistre le commit de `origin/main` utilisé pour la vérification, pour que la preuve cite l'état exact où elle a été obtenue.

### Lecteur du rapport (étape 5)

47. En tant que lecteur du rapport, je veux que les échecs au contrat soient rangés à part des échecs de migration, pour ne pas confondre un agent qui déclare mal et un agent qui migre mal.
48. En tant que lecteur du rapport, je veux que les pannes de la pile pendant que le candidat tourne soient rangées à part, avec leur fréquence, pour juger si le banc est fiable.
49. En tant que lecteur du rapport, je veux que la mesure invalide garde sa raison et sa preuve, et que la mesure qui la remplace le dise, pour comprendre pourquoi une mesure ne compte pas.
50. En tant que lecteur du rapport, je veux qu'un candidat qui ne démarre pas ait un résultat explicite « oracle non lancé », jamais un résultat vide, pour qu'il ne passe pas pour un candidat non mesuré.

### Auteur des portes (étape 4)

51. En tant qu'auteur des portes, je veux un emplacement réservé aux portes dans `measure.json` et une phase des portes dans la mesure, pour brancher les portes sans changer le format.
52. En tant qu'auteur des portes, je veux que le runner recrée le candidat à chaque redémarrage du legacy, pour qu'une porte qui redémarre le legacy s'exécute seule, après l'oracle, avec un candidat neuf.
53. En tant qu'auteur des portes, je veux le journal d'accès de chaque mesure et ses deux marqueurs, pour écrire la porte du relais, dont le candidat de référence est le test négatif.

## Décisions d'implémentation

### Modules

- **Contrat de candidat** (module profond, fonction pure) : prend le contenu
  du dossier du candidat (`candidate.json`, `package.json`,
  `package-lock.json`), rend le contrat validé ou la liste des manquements.
  Il porte la validation par le schéma publié et le contrôle des sources du
  `package-lock.json`.
- **Schéma publié de `candidate.json`** : un fichier JSON Schema versionné
  dans le dépôt, que l'étape 6 donne à l'agent IA dans le prompt. La
  validation lit ce même fichier : une seule définition du contrat.
- **Runner de mesure** (module profond, un point d'entrée) : enchaîne les
  phases, écrit le dossier de la mesure, rend le code de sortie.

  ```ts
  // Forme de l'interface, pas une implémentation.
  measureCandidate(options: {
    candidate: string;   // dossier du candidat, relatif à la racine du dépôt
    counted?: boolean;   // défaut : false (diagnostic)
    salt?: string;       // imposé : diagnostic seulement, refusé avec counted
  }): Promise<{ measureDir: string; outcome: MeasureOutcome; exitCode: 0 | 3 | 4 }>;
  ```

- **`migrabench measure`** : commande mince sur `measureCandidate`. Elle lit
  les options, imprime le chemin du dossier de la mesure et l'issue, et rend
  le code de sortie.
- **Verdict** (fonction pure) : prend les enregistrements des phases, rend
  la catégorie de la mesure, sa raison, sa preuve et le code de sortie.
  C'est la seule définition de « invalide ».
- **Préconditions de `--counted`** (fonction pure) : prend les faits Git
  (arbre propre, `HEAD`, `origin/main` après `fetch`, atteignabilité) et la
  présence d'un sel imposé, rend toutes les conditions manquantes. Si le
  `fetch` échoue, l'atteignabilité de `HEAD` ne se vérifie pas : seul le
  `fetch` manqué est nommé (#73).
- **Verrou du banc** : prise, refus, reprise d'un verrou orphelin, libération.
  Partagé par `migrabench measure`, `npm run oracle`, `npm run stack:up` et
  `npm test` (#94).
- **Journal d'accès** : lecture du journal brut d'une mesure, repérage des
  deux requêtes témoins par le marqueur, contrôle de leur moment. La porte
  du relais (étape 4) le réutilise.
- **Module d'exécution complète de l'oracle** (étape 2), modifié : il gagne
  une fonction de rappel appelée chaque fois que le legacy et le service
  d'archivage viennent d'être recréés et sont sains. Le runner s'en sert
  pour envoyer la requête témoin de début, puis recréer le service
  `candidate` et attendre sa disponibilité. Sans rappel, `npm run oracle`
  garde son comportement actuel.
- **Image d'exécution du banc** : Node 22, image de base épinglée par
  empreinte, utilisateur non-root. Construite par le banc, la même pour tous
  les candidats (ADR 0007).
- **Legacy** : ajout d'un journal d'accès de Tomcat sur le port `8080` seul,
  écrit sur un volume qui survit aux redémarrages. C'est une instrumentation
  du banc, pas un piège : elle est documentée dans `TRAPS.md` comme telle,
  et aucun piège n'est touché.
- **Contrôle des résultats versionnés** (#53), étendu à `measure.json`.
- **Fixtures** : candidat de référence, candidat d'étalonnage, huit
  candidats défectueux (voir ces sections).
- **Dépendance ajoutée** : un validateur JSON Schema (Ajv), à justifier dans
  la PR : le schéma est le contrat publié, et le valider avec lui-même
  évite d'en maintenir une seconde définition dans le code.

### `candidate.json` et son schéma

Écrit par l'agent IA à la racine du dossier du candidat.

```json
{
  "$schema": "<URL du schéma publié>",
  "contract": 1,
  "build": "npm run build",
  "start": "node server/index.js"
}
```

| Champ | Type | Obligatoire | Sens |
|---|---|---|---|
| `$schema` | chaîne | non | adresse du schéma, pour l'éditeur ; ignorée par le banc |
| `contract` | entier, `const` 1 | oui | version du contrat |
| `build` | chaîne non vide | non | commande lancée par `sh -c` après `npm ci`, dans la phase de construction |
| `start` | chaîne non vide | oui | commande lancée par `sh -c` dans la phase de démarrage ; doit écouter sur `PORT` |

- JSON Schema 2020-12, `additionalProperties: false` : un champ inconnu est
  un échec au contrat, pas un champ ignoré. Une URL déclarée (`url`, `port`)
  est donc refusée, et le message dit que le banc impose le port.
- Le dossier du candidat doit aussi contenir `package.json` et
  `package-lock.json`.
- **Sources du `package-lock.json`** : toute dépendance résolue ailleurs que
  sur le registre public npm imposé est un échec au contrat : autre hôte,
  dépôt Git, archive distante, chemin local hors du dossier du candidat. Un
  chemin local dans le dossier du candidat est accepté. Le message cite
  chaque dépendance fautive et sa source.
- Une montée de version du contrat ajoute un schéma ; le banc accepte les
  versions qu'il déclare, et la version lue est enregistrée dans le résultat.

### Phases d'une mesure et leurs issues

Une mesure enchaîne sept phases. Chaque phase s'enregistre dans
`measure.json` avec son issue, son début, sa durée et les empreintes de ses
bruts. La première issue autre que `ok` arrête la mesure, sauf mention
contraire ; les phases suivantes sont enregistrées `not-run`, sauf la
clôture, qui tourne toujours et enregistre sa propre issue (`ok` après un
échec du candidat, par exemple) : il faut toujours arrêter le candidat,
relever le journal d'accès et libérer le verrou du banc.

| # | Phase | Issues possibles | Catégorie de la mesure |
|---|---|---|---|
| 0 | **Refus préalables** : options, `--counted`, verrou du banc | `refused-usage`, `refused-counted`, `refused-lock` | aucune mesure (rien n'est écrit) |
| 1 | **Préparation** : verrou du banc pris, identifiant de la mesure, sel et marqueur tirés, environnement relevé, copie du candidat, images de la pile vérifiées | `ok`, `runner-error-before-candidate`, `stack-not-from-this-copy` | invalide |
| 2 | **Contrat** : `candidate.json`, `package.json`, sources du `package-lock.json` | `ok`, `contract-invalid`, `runner-error-before-candidate` | échec au contrat ; invalide pour la dernière |
| 3 | **Construction** : `npm ci` puis `build`, conteneur sans `mb-internal`, délai et limites | `ok`, `build-failed`, `build-timeout`, `build-resource-limit`, `registry-network-error`, `runner-error-before-candidate`, `stack-down-while-candidate` | échec du candidat ; invalide pour `registry-network-error` et `runner-error-before-candidate` ; panne de la pile pour la dernière |
| 4 | **Pile et démarrage** : legacy et service d'archivage recréés et sains, requête témoin de début, service `candidate` recréé, attente de disponibilité | `ok`, `stack-failed-before-candidate`, `stack-not-from-this-copy`, `access-log-inactive`, `start-exited`, `start-not-ready`, `stack-down-while-candidate` | invalide pour les trois premières ; panne de la pile pour la dernière ; échec du candidat pour les autres |
| 5 | **Oracle** : exécution complète de l'étape 2 sur `BASE_URL` | `ok`, `oracle-error`, `stack-down-while-candidate` | complète ; invalide pour `oracle-error` ; panne de la pile pour la dernière |
| 6 | **Portes** : vide à l'étape 3, branchées à l'étape 4 | `ok`, `not-run` | — |
| 7 | **Clôture** : arrêt du candidat, requête témoin de fin, journal d'accès relevé et contrôlé, `measure.json` écrit, verrou du banc libéré | `ok`, `marker-out-of-place`, `access-log-inactive`, `runner-error-before-candidate`, `stack-down-while-candidate` | invalide ; panne de la pile pour la dernière |

Les phases 1 à 5 et 7 peuvent aussi rendre `interrupted` (invalide, voir les
règles). `stack-down-while-candidate` apparaît dans les phases 3 à 7, hors
portes, parce qu'une erreur imprévue du runner y est comptée comme une panne
pendant que le candidat tourne. Les portes n'ont que `ok` et `not-run` tant
qu'elles sont vides ; l'étape 4 leur donnera leurs issues.

Règles des issues :

- **Disponibilité** : le candidat est disponible dès qu'une réponse HTTP
  arrive sur `BASE_URL`, quel que soit son statut (un `401` est légitime).
  `start-exited` : le processus s'est arrêté avant ; `start-not-ready` : le
  délai de disponibilité est écoulé.
- **Délais et limites** : un délai dépassé ou une limite de mémoire atteinte
  est toujours un échec du candidat (règle 7), en construction comme au
  démarrage.
- **`registry-network-error`** : seulement si le journal de npm montre une
  erreur réseau sur une requête précise vers le registre imposé (connexion
  refusée ou coupée, DNS, `5xx` du registre). La ligne du journal est la
  preuve, citée dans le résultat. Toute autre erreur de `npm ci` est
  `build-failed`.
- **Scripts d'installation** : `npm ci` les exécute ; ils restent actifs.
  Ce sont du code choisi par le candidat : une erreur réseau qu'ils
  provoquent hors du registre imposé est `build-failed`, un échec du
  candidat.
- **`runner-error-before-candidate`** : erreur imprévue du runner pendant la
  préparation ou le contrat, avant le lancement de `npm ci`. Aucun code du
  candidat n'a encore tourné : il ne peut ni la recevoir ni la fabriquer.
  Dès le lancement de `npm ci`, scripts d'installation compris, une erreur
  imprévue du runner est comptée comme une panne pendant que le candidat
  tourne (`stack-down-while-candidate`, avec l'erreur en détail).
  Précisions de #68 :
  - l'erreur est rangée dans la phase en cours ; `npm ci` compte comme
    lancé dès que le runner lance le conteneur de `fetch` ;
  - l'état du conteneur de chaque étape de la construction est relevé par
    `docker inspect` avant sa suppression. Un conteneur créé mais jamais
    démarré (`State.StartedAt` à zéro) est une erreur du banc. Un
    `docker inspect` en échec (conteneur absent, par exemple après un code
    `125` : image absente, démon injoignable) en est une aussi, et la preuve
    dit « état du conteneur inconnu : `docker inspect` a échoué », avec sa
    sortie, sans le confondre avec un conteneur jamais démarré. Pour `fetch`,
    c'est le runner qui échoue avant `npm ci` :
    `runner-error-before-candidate`. Pour `install` et `build`, panne
    pendant que le candidat tourne. Le code seul ne suffit pas : la commande
    `build` du candidat peut rendre `125` dans un conteneur démarré, et
    c'est alors `build-failed` ;
  - en clôture, une erreur d'une mesure arrêtée avant la construction (la
    liste des scénarios qui échoue, par exemple) est
    `runner-error-before-candidate` ; elle ne change pas la catégorie, déjà
    décidée par la phase qui a arrêté la mesure ;
  - voir la règle des défauts des fichiers du candidat, ci-dessous : ils
    ne sont jamais une erreur du runner.
- **Défauts des fichiers du candidat** (#68) : un défaut des fichiers
  fournis par le candidat est une contract-failure ; seul ce que le
  candidat ne peut ni fournir ni fabriquer rend la mesure invalide
  (règle 7). Sont des défauts : un lien symbolique, un fichier ou un dossier
  illisible (relevés à la préparation, ni suivis ni copiés), un
  `candidate.json`, `package.json` ou `package-lock.json` illisible ou qui
  est un dossier. La phase du contrat les cite comme manquements
  (`contract-invalid`). Ni un plantage (code `1`, aucune mesure écrite :
  le candidat échapperait à la mesure), ni `runner-error-before-candidate`
  (invalide : le candidat le fabriquerait). `candidate.contentDigest` ne
  porte que les fichiers lisibles.
- **`interrupted`** : la mesure reçoit `SIGINT` ou `SIGTERM`, ou le job de CI
  est annulé, quelle que soit la phase. Le runner arrête le candidat, écrit
  `measure.json` avec les phases déjà faites, invalide pour cette cause, et
  libère le verrou du banc. Une mesure comptée interrompue est versionnée
  comme les autres, et le rapport la signale toujours. Le candidat ne peut
  pas l'envoyer : il n'a accès ni au processus du runner ni au socket
  Docker. Mise en œuvre (#71) :
  - la phase en cours est fermée `interrupted`, preuve `Interrupted by
    <signal>`. Les commandes qu'elle a lancées reçoivent le signal, et elle
    ne peut plus en lancer. Playwright, lancé par le runner, a son propre
    groupe de processus, arrêté en entier. Les phases interrompues ont
    2 secondes pour finir, puis ce qui reste est tué ;
  - le résultat de l'oracle est figé au signal : un oracle interrompu
    n'écrit ni `oracle.json` ni `oracle.executed: true`. Son résultat
    collecté, s'il y en a un, reste dans les bruts. La liste des scénarios
    de la clôture a son propre dossier, `oracle-list/` : le dossier d'un
    oracle lancé garde ses bruts partiels ;
  - la clôture supprime les conteneurs de la construction et tue le
    candidat sans attendre son délai d'arrêt. Un signal reçu entre deux
    phases ou pendant la clôture est rangé dans la clôture ;
  - **échéance** : à l'annulation d'un job, GitHub Actions envoie `SIGINT`
    au processus d'entrée de l'étape, `SIGTERM` 7 500 ms plus tard, puis tue
    l'arbre de processus 2 500 ms après (« Workflow cancellation
    reference »). `measure.json` est donc écrit au plus 5 000 ms après le
    premier signal : passé ce délai, ou au second signal (`SIGINT` ou
    `SIGTERM`), la clôture est abrégée (`closing` `interrupted`, avec la
    raison en détail), `measure.json` est écrit aussitôt, puis le candidat
    est supprimé. Le même signal reçu moins d'une seconde après le premier
    est le doublon du relais de npm sous Ctrl+C, pas un second signal ;
  - `measure.json` est écrit de façon atomique : fichier temporaire, puis
    renommage ;
  - `SIGKILL` arrête le runner sans mesure, et laisse un verrou du banc
    orphelin.

  En CI, le processus d'entrée d'une étape `run` est le shell, qui ne
  transmet pas le signal à la commande qu'il attend : une étape de mesure
  qui doit rester interruptible par l'annulation du job se lance avec
  `exec` (`exec npm run migrabench -- …`), npm relayant `SIGINT` et
  `SIGTERM` au runner (#94).
- **`stack-failed-before-candidate`** : le legacy ou le service d'archivage
  n'est pas sain avant le démarrage du candidat, ou pendant un redémarrage
  où le candidat est arrêté. Relevée quand `docker compose up --wait` échoue
  à la recréation de la pile et qu'un service n'est pas en marche et sain.
  La preuve est l'état de chaque service relevé par `docker inspect`
  (statut, code de sortie, santé, dernier healthcheck, démarrage,
  redémarrages) ; les sorties des services sont des bruts
  (`stack/<service>.log`). Sans service malade relevé, l'échec reste une
  erreur imprévue du runner (#68).
- **`stack-not-from-this-copy`** : images de la pile construites depuis une
  autre copie du dépôt ; remède : `npm run stack:up` (#102). Les images de
  la pile sont communes à toute la machine : la dernière copie du dépôt qui
  les a construites, un autre worktree par exemple, n'est pas forcément
  celle qui mesure. Une image saine mais étrangère n'est pas celle du commit
  cité : la pile ne peut pas servir. Chaque image porte le label
  `org.migrabench.context-digest`, l'empreinte de son contexte de
  construction ; la cause est relevée quand ce label diffère de l'empreinte
  calculée sur la copie qui mesure, ou manque. Le runner le vérifie deux
  fois : sur les images construites, à la préparation, avant tout code du
  candidat ; puis sur les conteneurs, à chaque recréation de la pile (phase
  4). La preuve nomme le service, l'image, le label trouvé, l'empreinte
  attendue et le remède. `npm run oracle` et `migrabench calibrate` font la
  même vérification et s'arrêtent sur le même message.
- **Empreinte du contexte de construction** : tout le contexte de
  construction du service (la racine du dépôt), moins ce que `.dockerignore`
  exclut, avec la sémantique de Docker (`@balena/dockerignore`, portage de
  son implémentation) : chaque fichier et lien symbolique, par chemin et
  empreinte de son contenu ou de sa cible. Les fichiers ne sont pas déduits
  des `COPY` des Dockerfile. Raison : un contrôle plus large qui refuse
  parfois pour rien vaut mieux qu'un contrôle qui rate un fichier sans le
  dire. Une modification d'un fichier que les images n'utilisent pas (la
  documentation, par exemple) demande donc un `npm run stack:up` avant de
  mesurer. Les sorties du banc écrites dans la copie (`results/`,
  `.oracle-artifacts/`, `.dev-archive-salt`…) sont exclues par
  `.dockerignore`, sans quoi chaque mesure changerait l'empreinte.
- **`stack-down-while-candidate`** : à la fin de l'oracle, et après chaque
  porte à l'étape 4, le runner relève l'état des conteneurs `legacy` et
  `archive` (arrêt, redémarrage, santé). Une panne survenue pendant que le
  candidat tourne est comptée contre lui, dans sa catégorie, avec le service
  tombé et ses sorties. L'oracle a quand même produit son résultat, qui est
  gardé. Le relevé de la fin est comparé à celui pris quand la pile venait
  d'être recréée et saine, candidat arrêté : un service est tombé s'il n'a
  plus de conteneur, si son conteneur a été remplacé, s'il ne tourne plus,
  s'il a redémarré (démarrage ou nombre de redémarrages changés), ou s'il
  n'est pas sain. Elle passe devant une `oracle-error` de la même
  exécution, que le candidat a pu provoquer en faisant tomber la pile (#68).
- **`oracle-error`** : erreur de Playwright hors scénario (configuration,
  chargement des fichiers). Un scénario qui échoue n'est jamais une erreur
  de l'oracle. Deux formes : des erreurs dans le rapport de Playwright, ou
  pas de rapport du tout (configuration qui ne se charge pas) ; dans ce
  second cas, la fin des sorties de Playwright est la preuve, ses sorties
  sont un brut (`oracle-playwright.log`, à côté du dossier `oracle/`, que
  Playwright vide à son démarrage), et `oracle.executed` est `false`, sans
  compte des scénarios (#68).
- **Candidat qui s'arrête pendant l'oracle** : pas d'issue propre. Les
  scénarios échouent ou ne sont pas atteints, et la mesure est complète.
- **Oracle non lancé** : si la mesure s'arrête avant la phase 5, le résultat
  le dit explicitement (`oracle.executed: false`) et compte les 38 scénarios
  comme non atteints. Les portes de l'étape 4 seront non évaluables. Si
  Playwright ne peut pas lister les scénarios, `oracle.summary` est absent,
  et l'erreur est rangée en clôture (#68).
- **Classement** : la première issue autre que `ok` décide de la catégorie ;
  seule l'interruption passe devant, invalide quelle que soit la phase. Une
  issue invalide relevée après un échec du candidat (en clôture, par exemple
  `access-log-inactive` après `start-exited`) ne change donc pas la
  catégorie. Raison : un incident du banc postérieur à l'échec du candidat ne
  peut pas en être la cause, et invalider la mesure offrirait au candidat une
  seconde chance, contraire à la règle 7.
- **Liste fermée** : les causes d'invalidité sont exactement
  `registry-network-error`, `stack-failed-before-candidate`,
  `stack-not-from-this-copy`, `access-log-inactive`, `oracle-error`, `marker-out-of-place`,
  `runner-error-before-candidate` et `interrupted`, celles du glossaire. Le
  verdict refuse toute autre cause.

### Contenu de `measure.json`

Un dossier par mesure, nommé par l'identifiant de la mesure :
`<horodatage>-<commit court>-<nom du candidat>`, le nom étant le chemin du
candidat sous `candidates/` ou `fixtures/`, barres remplacées par des tirets.
Une mesure de diagnostic l'écrit sous `results/diagnostic/`, ignoré par Git ;
une mesure prévue pour compter, sous `results/counted/`, versionné (#73).
Il contient `measure.json` et, si l'oracle a été lancé, `oracle.json` au
format de l'étape 2. Les bruts restent dans `.oracle-artifacts/<identifiant
de la mesure>/`, cités par empreinte (ADR 0005).

- **`format`** : version du format de `measure.json`.
- **`measureId`**.
- **`counted`** : `true` ou `false` ; avec `true`, **`originMain`** : commit de
  `origin/main` utilisé pour la vérification.
- **`candidate`** :
  - `path` : dossier du candidat, relatif à la racine du dépôt ;
  - `contentDigest` : empreinte SHA-256 du contenu du dossier (liste triée
    des chemins et de leurs empreintes), relevée avant la copie ;
  - `contract` : version lue dans `candidate.json`, ou absente si le contrat
    est invalide ;
  - `build` et `start` : commandes déclarées.
- **`environment`** : les métadonnées de l'étape 2 (`benchCommit`,
  `worktree`, `node`, `chromium`, `playwright`, `images`, `imageContexts`,
  `frozenDate`, `baseUrl`, `artifacts`, `ciRun`), plus :
  - `runtimeImage` : empreinte de l'image d'exécution du banc ;
  - `composeOverride` : empreinte de la composition complémentaire générée ;
  - `port` : port imposé ;
  - `limits` : délai de construction, délai de disponibilité, mémoire, CPU
    appliqués, avec le multiple déclaré et l'empreinte du résultat
    d'étalonnage dont ils sortent ; avec `--timeout-cap-ms`, le plafond imposé
    (`imposedTimeoutCapMs`) ;
  - `lock` : prise du verrou du banc, et reprise d'un verrou orphelin s'il
    y en a eu une (outil, PID, heure de démarrage et ligne de commande du
    processus repris).
- **`salt`** et **`saltImposed`**, écrits à la fin, comme dans l'étape 2.
- **`marker`** : marqueur de la mesure, écrit à la fin seulement.
- **`phases`** : une entrée par phase, dans l'ordre : `name`, `outcome`,
  `startedAt`, `durationMs`, `detail` (message, manquements du contrat,
  service tombé), `raw` (empreintes des bruts de la phase : sorties de
  `npm ci`, de `build` et de `start`, journal de npm, sorties d'un service
  tombé).
- **`oracle`** : `executed` ; si vrai, empreinte de `oracle.json` et copie de
  son `summary` ; sinon le compte des scénarios, tous non atteints, absent
  si Playwright n'a pu ni les exécuter ni les lister (#68).
- **`accessLog`** : empreinte du journal d'accès de la mesure, nombre de
  lignes, position des deux requêtes témoins.
- **`gates`** : liste vide à l'étape 3, remplie à l'étape 4.
- **`verdict`** :
  - `category` : `completed`, `contract-failure`, `candidate-failure`,
    `stack-down-while-candidate` ou `invalid` ;
  - `reason` : l'issue de la phase qui a décidé ;
  - `evidence` : pour une mesure invalide, la preuve (ligne du journal de
    npm, état du service, lignes du journal d'accès), sinon absente.

Une mesure n'est jamais réécrite. Une invalidation découverte après coup est
un document ajouté à côté, qui cite les mesures concernées, la raison et la
preuve.

### Codes de sortie

| Code | Sens | Résultat écrit |
|---|---|---|
| `0` | mesure valide : `completed`, `contract-failure`, `candidate-failure` ou `stack-down-while-candidate` | oui |
| `3` | mesure invalide, interruption comprise | oui |
| `4` | aucune mesure écrite : options invalides, dossier du candidat absent, `--counted` refusé, verrou du banc pris | non |

Le code `1` reste celui d'un plantage : une exception que le runner n'a pas
pu ranger dans une mesure, et le code par défaut de Node dans ce cas. Il ne
se confond jamais avec une mesure invalide. Le code `2` n'est pas utilisé.

Le score du candidat ne change jamais le code de sortie : un candidat à 0 %
donne `0`. Le critère de fin et les tests lisent `measure.json`, pas le code.
C'est un écart voulu avec `npm run oracle`, qui rend un code non nul dès
qu'un scénario échoue : l'oracle juge le legacy, le runner juge le banc.

Une erreur imprévue du runner est rangée dans une mesure quand c'est
possible : `runner-error-before-candidate` avant `npm ci`, panne pendant que
le candidat tourne ensuite (voir les règles des issues).

### Verrou du banc

`PROTOCOL.md` cite le verrou du banc ; cette section le décrit.

- Un fichier du dossier d'état de l'utilisateur, créé de façon exclusive :
  `$XDG_STATE_HOME/migrabench/bench-lock`, ou
  `~/.local/state/migrabench/bench-lock` quand `XDG_STATE_HOME` n'est pas un
  chemin absolu. Le dossier est créé s'il manque. Le fichier est hors du
  dépôt, car la pile (projet Compose `migrabench`, ports de l'hôte) est
  commune à toute la machine : tous les worktrees et tous les clones du dépôt
  voient le même verrou du banc (#92). Chaque refus donne son chemin. Il
  contient l'outil (`measure`, `calibrate`, `oracle`, `stack-up`, `test`), le PID du
  processus qui le tient, l'heure de démarrage de ce processus, sa ligne de
  commande, la machine, l'identifiant de la mesure s'il y en a un et l'heure
  de prise.
- **Le prennent** : `migrabench measure`, `migrabench calibrate`,
  `npm run oracle`, `npm run stack:up`, pour toute leur durée.
- **`npm test` le prend aussi** (#94), outil `test`, du lancement de Vitest
  à sa fin, y compris sur échec et sur interruption : les tests du Seam A
  écrivent sur la pile, et l'un d'eux redémarre le legacy (#67). Le script
  `scripts/test.ts` prend le verrou du banc, lance `vitest run` avec les
  arguments reçus dans son propre groupe de processus, puis libère le verrou
  du banc et rend le code de Vitest. Interruption : Vitest ne la reçoit qu'une
  fois, sinon un second `SIGINT` l'arrêterait au milieu de son nettoyage.
  Ctrl+C n'atteint que `scripts/test.ts` (Vitest n'est pas dans le groupe de
  premier plan), que npm relaie aussi : `scripts/test.ts` relaie la première
  interruption reçue (`SIGINT`, `SIGTERM`, `SIGHUP`), une seule fois, et
  libère le verrou du banc après le nettoyage de Vitest. `npx vitest` lancé directement
  ne le prend pas. Tué par `SIGKILL`, `scripts/test.ts` ne relaie rien :
  Vitest continue seul, et le verrou du banc, orphelin, est repris par le
  prochain outil du banc. Les tests qui lancent de vrais outils du banc
  (`tests/runner/bench-lock-tools.test.ts`, `counted-measure.test.ts`) leur
  donnent un `XDG_STATE_HOME` temporaire depuis #92 : ils ne voient pas le
  verrou du banc que tient `npm test`.
- **Refus** : code `4` (`refused-lock`), pour tous les outils qui le
  prennent, avec l'outil, le processus et l'heure de prise dans le message.
  `npm test` refuse avant de lancer Vitest.
- **Verrou orphelin** : sur la même machine, le verrou est repris seulement
  si aucun processus ne porte le PID enregistré, ou si le processus qui le
  porte a une autre heure de démarrage ou une autre ligne de commande. Les
  trois sont vérifiés : un nouveau processus qui aurait reçu le même PID ne
  passe pas pour le détenteur, et un détenteur vivant n'est jamais dépossédé.
  La reprise est enregistrée dans `environment.lock` de la mesure, avec les
  trois valeurs du verrou repris. Sur une autre machine, le verrou n'est
  jamais repris.
- **Libération** : à la fin de l'outil, y compris sur erreur et sur
  interruption.
- **Limite** (`PROTOCOL.md`) : il ne couvre que les outils du banc. Une
  requête envoyée à la main au legacy pendant une mesure fait échouer la
  porte du relais au compte du candidat.
- **`npm test` et une mesure** : l'un refuse l'autre (#94). Seul un
  `npx vitest` lancé directement pendant une mesure passe le verrou du
  banc : ses requêtes du Seam A portent le marqueur du Seam A (section
  « Journal d'accès »), et la mesure est rendue invalide
  (`marker-out-of-place`) au lieu de compter contre le candidat.
- Le mot seul « verrou » désigne le verrou d'un champ du dossier
  (`GLOSSARY.md`) : on écrit toujours « verrou du banc ».

### Journal d'accès

- Valve d'accès de Tomcat sur le connecteur `8080` seul : l'API interne
  (`8081`) n'y figure pas. Format : horodatage, adresse et port locaux,
  adresse distante, ligne de requête, statut, `User-Agent`.
- Écrit en ajout sur un volume monté dans le dossier des bruts de la mesure :
  il survit aux redémarrages du legacy pendant la mesure, et chaque mesure a
  le sien.
- **Marqueur** : 32 octets aléatoires en hexadécimal, tirés à la préparation,
  jamais transmis au candidat, ni au legacy autrement que par le chemin des
  requêtes témoins (ni variable, ni fichier), écrits dans `measure.json` à
  la fin seulement.
- **Requêtes témoins** : le runner envoie depuis l'hôte une requête `GET`
  sur le port publié du legacy, dont le chemin porte le marqueur, à deux
  moments : après que la pile est saine et avant le démarrage du candidat ;
  après l'arrêt du candidat. Avec un rappel par recréation du legacy, une
  requête témoin de début est envoyée après chaque recréation.
- **Contrôle à la clôture** : chaque requête témoin attendue est présente
  (sinon `access-log-inactive`), aucune ligne portant le marqueur
  n'apparaît hors de ces moments, et aucune ligne portant un marqueur du
  Seam A n'apparaît pendant la mesure (sinon `marker-out-of-place`). Le candidat
  ne connaît pas le marqueur : il ne peut fabriquer ni l'une ni l'autre de
  ces preuves.
- **Marqueur du Seam A** (décision Q14 du cadrage) : `npm test` tire un
  marqueur à chaque exécution, inconnu du candidat, que portent les
  requêtes des tests du Seam A vers le legacy. Une ligne qui porte un
  marqueur du Seam A pendant une mesure rend la mesure invalide
  (`marker-out-of-place`, la ligne en preuve), au lieu de faire échouer la
  porte du relais au compte du candidat : des tests du Seam A lancés pendant
  une mesure sans le verrou du banc (`npx vitest` direct, #94) sont un
  incident du banc. Le moyen (#67) :
  - la configuration globale de Vitest tire le marqueur (32 octets
    aléatoires en hexadécimal) et l'enregistre comme un fichier vide, nommé
    par le marqueur, dans `seam-a-markers/` du dossier d'état du banc, à
    côté du verrou du banc : commun à toute la machine, hors du dépôt donc
    hors de la copie du candidat. Les marqueurs de plus de sept jours sont
    purgés à l'enregistrement suivant ;
  - les requêtes des tests du Seam A vers le legacy le portent dans leur
    `User-Agent` (`migrabench-seam-a/<marqueur>`) : la réponse du legacy ne
    change pas, et un relais fidèle le transmet tel quel ;
  - le runner relit ce dossier à la clôture. Le candidat ne le voit pas, et
    un marqueur qu'il inventerait n'y figure pas.
- **Requête témoin** : `GET /migrabench-witness/<marqueur>/<moment>`, où le
  moment est `start-1`, `start-2`… (une par recréation de la pile) puis
  `end`. Seul ce chemin exact, avec le marqueur de la mesure, compte comme
  requête témoin : un chemin de requête témoin au marqueur inventé ou d'une
  autre mesure est ignoré. Toute autre ligne qui porte le marqueur, où que
  ce soit (chemin, `User-Agent`), est hors de son moment.
- **`accessLog`** : empreinte du journal (`log`), nombre de lignes
  (`lines`), et numéro de ligne de chaque requête témoin (`witnesses`). Le
  journal cité est celui que la clôture a contrôlé, figé dans `access.log`
  du dossier des bruts : le legacy reste en marche après la mesure et
  continue d'écrire dans `access-log/`.
  Absent si la pile n'a jamais été recréée (mesure arrêtée avant le
  démarrage), ou si le legacy n'a jamais créé son journal : la mesure est
  alors `access-log-inactive`.
- Les autres lignes ne sont pas jugées à l'étape 3 : c'est la porte du
  relais (étape 4) qui les lit.

### Exécution du candidat (ADR 0007)

- **Copie** : le dossier du candidat est copié dans le dossier des bruts de
  la mesure, sans `node_modules` ni artefacts de construction déjà présents.
- **Construction** : conteneur tiré de l'image d'exécution, utilisateur
  non-root, copie montée en écriture, réseau avec accès au seul registre
  imposé (registre fixé par une variable d'environnement de npm, qui prime
  sur un `.npmrc` du candidat), ni `mb-internal` ni variable du banc,
  limites de mémoire et de CPU, délai global. Sorties et journal de npm
  conservés comme bruts. Précisé par #65 : trois conteneurs successifs sous
  le même délai global.
  - **téléchargement** : `npm ci --ignore-scripts` dans une copie du candidat
    sans son `.npmrc`, sur le réseau `bridge`, qui remplit un cache npm propre
    à la mesure. C'est la seule étape qui a accès au réseau, et aucun code du
    candidat n'y tourne : ni script d'installation, ni `.npmrc` (un proxy ou un
    `fetch-timeout` qu'il déclarerait pourrait sinon fabriquer une erreur du
    registre). Seul son journal de npm peut prouver `registry-network-error` ;
  - **installation** : `npm ci --offline` dans la copie du candidat, scripts
    d'installation actifs, depuis ce cache, sans réseau (`--network none`) ;
  - **`build`** : la commande déclarée, par `sh -c`, sans réseau.

  Un script d'installation ou une commande `build` qui tente une requête
  réseau échoue donc toujours : `build-failed`, échec du candidat.
- **Démarrage** : service `candidate` de la composition complémentaire,
  même image, utilisateur non-root, copie montée en lecture seule, dossier
  temporaire en écriture, `USERS_FILE` monté en lecture seule, réseaux
  `mb-internal` et `default`, port imposé publié sur `127.0.0.1`, variables
  `PORT`, `LEGACY_API_URL`, `ARCHIVE_URL`, `ARCHIVE_TOKEN`, `USERS_FILE`,
  sans socket Docker, sans privilège supplémentaire, limites de mémoire, de
  CPU et de processus. Jamais `ARCHIVE_SALT` ni le marqueur.
  Précisé par #66 :
  - **sans privilège supplémentaire** : toutes les capacités retirées
    (`cap_drop: ALL`) et `no-new-privileges` ; aucun montage hors de la
    copie et de `USERS_FILE` ;
  - **limites du démarrage** : mémoire (sans échange au-delà) et CPU
    reprennent les limites de la construction, et le nombre de processus
    vaut 256. C'est une **limite provisoire de conception, pas un relevé** :
    l'étalonnage ne relève le démarrage que jusqu'à la disponibilité, bien
    en dessous de la charge de l'oracle. L'étalonnage du démarrage sous
    cette charge est l'objet de #100. Ces limites sont enregistrées dans
    `environment.limits.start`, marquées `provisional: true` et
    `source: "build-limits"` ;
  - **constat de démarrage** : le candidat de référence et le candidat
    défectueux 5 écrivent sur leur sortie une ligne
    `migrabench start report <JSON>`, que le runner garde dans le brut
    `start.log`. `npm run start-report:check -- probe <start.log> --marker <marqueur>`
    et `npm run start-report:check -- reference <start.log>` la vérifient :
    chaque tentative de la sonde refusée, marqueur de la mesure absent de
    son environnement ; pour la référence,
    les cinq variables reçues, `ARCHIVE_SALT` absente, écriture réussie dans
    le dossier temporaire ;
  - **sonde d'isolation** (candidat défectueux 5) : elle n'est pas une copie
    du candidat de référence, faute de relais à garder ; elle sert son
    constat à toute requête. Une tentative n'y est comptée refusée que sur
    la preuve du refus : copie en lecture seule (`EROFS`, `EACCES`,
    `EPERM`), socket Docker absent (`ENOENT` ; le lire échouerait même
    monté, par `EACCES` ou `ENXIO`), appel de la construction échoué sans interface réseau hors de
    `lo`. Toute autre erreur compte comme non refusée ;
  - **marqueur dans l'environnement de la sonde** (précisé par #74) : la
    sonde ne connaît pas le marqueur. Elle écrit dans son constat toutes ses
    variables, noms et valeurs (tentative `read-measure-marker`), et le
    contrôle y cherche le marqueur lu dans `measure.json`, dans les noms
    comme dans les valeurs. La valeur d'`ARCHIVE_TOKEN` est remplacée par
    `<masked>` avant l'écriture du constat, et le contrôle refuse un constat
    où elle ne l'est pas : c'est la valeur témoin du piège n° 2, que le score
    de l'étape 5 cherchera dans les sorties du candidat ; la sonde ne doit
    pas la semer dans ses propres bruts. Le contrôle du marqueur porte sur
    toutes les autres valeurs.
- `BASE_URL` vaut `http://127.0.0.1:<PORT>`.
- **Arrêt** : à la clôture, et à chaque recréation du legacy (le candidat est
  alors recréé après lui).

### Candidat de référence

- Dans `fixtures/`, un relais sans logique de `PORT` vers `legacy:8080`,
  écrit en Node sans dépendance, avec un `candidate.json` sans `build`.
- Il conserve l'en-tête `Host` d'origine, pour que les redirections du
  legacy visent le port du candidat ; à défaut, il réécrit les `Location`.
  Testé sur une redirection réelle du legacy à travers le relais : le
  `Location`, absolu ou relatif, est résolu contre l'adresse du relais comme
  le ferait un navigateur, doit en avoir l'origine, puis est suivi à travers
  le relais (précisé par #70).
- Il ne modifie rien : un test compare, pour un ensemble de requêtes
  (pages des trois écrans, ressources, refus `401`), les en-têtes et les
  corps reçus à travers le relais et directement du legacy. Les corps sont
  comparés octet par octet. Les en-têtes sont comparés nom et valeur, sauf
  ceux de cette liste fermée :
  - **exclus de la comparaison**, parce qu'ils sont propres à une connexion
    (hop-by-hop, au sens de HTTP) : `Connection`, `Keep-Alive`,
    `Proxy-Connection`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade` ;
  - **comparés sur leur forme, pas sur leur valeur**, parce que leur valeur
    change d'une réponse à l'autre, avec ou sans relais : `Date` (présent des
    deux côtés) et `Set-Cookie` (même nom de cookie et mêmes attributs, valeur
    du cookie de session ignorée).

  Tout autre en-tête, `Content-Length` compris, doit être identique. Un
  en-tête ajouté ou retiré par le relais fait échouer le test.

  **Identifiant de session des liens** (précisé par #70) : à un client sans
  cookie de session, Tomcat réécrit les liens avec `;jsessionid=<valeur>`.
  La réponse directe et la réponse relayée ouvrent chacune leur session :
  leurs corps diffèrent donc par cette valeur, même à travers un relais
  parfait. Le test compare chaque requête deux fois :
  - **sans cookie** : seule la valeur de `;jsessionid=<valeur>`, au format
    exact produit par le legacy, est remplacée par un jeton fixe des deux
    côtés, puis les corps sont comparés octet par octet. Le nombre et la
    position des occurrences, et tout le reste du lien (hôte, chemin,
    paramètres), restent comparés. Le test exige que chaque occurrence d'une
    vraie réponse du legacy ait ce format ;
  - **dans une session ouverte** (cookie renvoyé) : plus de réécriture,
    comparaison stricte, sans masque.

  Cette exception ne vaut que pour la vérification de fidélité du relais du
  candidat de référence. Elle ne s'applique jamais à la mesure d'un candidat.

  **Ressources** (précisé par #70) : le legacy ne sert aucune ressource
  statique (ni feuille de style, ni script, ni image). La seule réponse hors
  page comparée est le `404` de Tomcat sur un chemin inconnu.
- Il obtient 100 % à l'oracle (règle 6). À l'étape 4, il échoue aux mêmes
  portes que le legacy, plus la porte du relais, dont il est le test
  négatif : son journal d'accès contient des requêtes hors marqueur.

### Candidat d'étalonnage

- Dans `fixtures/`, écrit par le banc, jamais tiré des sorties d'un agent.
  Il a la forme d'un vrai candidat (ADR 0003) : un front React + TypeScript
  construit par un outil de construction courant, et une couche serveur qui
  appelle l'API interne et sert le front. Il n'a pas à réussir l'oracle :
  il sert à mesurer le coût d'une construction et d'un démarrage réalistes.
- `migrabench calibrate` le mesure plusieurs fois, sans limite de délai
  mais avec un plafond de sécurité, et relève la durée de construction, la
  durée jusqu'à la disponibilité, le pic de mémoire et l'usage de CPU de
  chaque phase. Le résultat enregistre chaque relevé, leur maximum et son
  environnement (mêmes champs que `measure.json`, plus la machine de CI).
- Délais et limites = maximum relevé × multiple déclaré. Les multiples sont
  des paramètres du banc, déclarés et versionnés avec le résultat
  d'étalonnage, pas des mesures.
- **Limite du relevé de CPU** (précisée par #72) : l'usage de CPU relevé
  est une moyenne, le temps CPU du conteneur divisé par la durée de
  l'étape, pas un pic. La limite `--cpus` qui en sort peut donc freiner une
  construction qui demande par moments plus que sa moyenne. Ce
  ralentissement allonge la construction, sans la faire échouer : il est
  absorbé par la marge sur les délais (× 5), bien plus large que celle sur
  le CPU (× 2). Le pic de mémoire, lui, est un vrai pic (`memory.peak` du
  cgroup v2).
- L'étalonnage de l'étape se fait en CI, l'environnement des mesures
  comptées. Son résultat est versionné ; `--counted` est refusé tant qu'il
  n'en existe aucun. En diagnostic sans étalonnage, le runner applique le
  plafond de sécurité et l'écrit dans `environment.limits` comme provisoire.
- L'étape 6 réétalonne avant la première mesure comptée de sa campagne.
- **Plafond des délais imposé** (précisé par #65) : `--timeout-cap-ms <ms>`
  abaisse les délais de construction et de disponibilité, jamais les limites
  de mémoire et de CPU, et ne peut pas les relever. Diagnostic seulement :
  `--counted` le refuse (`refused-counted`, code `4`). La valeur est
  enregistrée dans `environment.limits.imposedTimeoutCapMs`. Le candidat
  défectueux 3 est mesuré avec ce plafond en CI, pour ne pas attendre tout le
  délai de construction ; un délai dépassé reste un échec du candidat.

### Candidats défectueux

Huit candidats défectueux, un par issue qu'une mesure doit savoir produire
(le huitième ajouté par #102, compté dans le critère de fin par #74). Les six
premiers sont dans `fixtures/defective-candidates/`, chacun une copie
minimale du candidat de référence avec un seul défaut. Les deux derniers ne
sont pas défectueux en eux-mêmes : c'est le candidat de référence, mesuré
sur une pile que le test casse volontairement, pour prouver le chemin d'une
mesure invalide.

| # | Candidat | Défaut | Issue attendue | Catégorie | Code |
|---|---|---|---|---|---|
| 1 | contrat invalide | `candidate.json` qui déclare une `url` et une dépendance résolue sur un autre hôte | `contract-invalid`, les deux manquements cités | échec au contrat | `0` |
| 2 | construction en échec | `build` qui sort avec un code non nul | `build-failed` | échec du candidat | `0` |
| 3 | construction trop longue | `build` qui ne termine jamais | `build-timeout` | échec du candidat, jamais invalide | `0` |
| 4 | jamais disponible | `start` qui tourne sans écouter sur `PORT` | `start-not-ready`, oracle non lancé | échec du candidat | `0` |
| 5 | sonde d'isolation | `start` qui écoute sur `PORT` et sert le constat de ses tentatives : écrire dans son code, lire le socket Docker, joindre l'hôte de l'API interne pendant la construction, lire `ARCHIVE_SALT`, tourner en root | mesure complète ; le constat, lu par le test, montre chaque tentative refusée | complète | `0` |
| 6 | relais qui altère un libellé | relais du candidat de référence qui change un libellé de champ dans les pages du legacy | mesure complète, au moins un scénario échoué | complète | `0` |
| 7 | pile volontairement cassée | candidat de référence, mesuré pendant que le test empêche le legacy de devenir sain (`tests/fixtures/broken-stack/`, ajouté par `COMPOSE_FILE`) | `stack-failed-before-candidate` | invalide | `3` |
| 8 | pile d'une autre copie | candidat de référence, mesuré sous un faux `docker` qui rend pour les images de la pile un label étranger à la copie (#102) | `stack-not-from-this-copy` en préparation, ni construction ni pile recréée | invalide | `3` |

Les variantes de contrat (`candidate.json` absent, JSON mal formé, champ
manquant, source Git, chemin hors du candidat, et depuis #68 lien
symbolique, fichier illisible, `candidate.json` qui est un dossier) sont
couvertes par les tests Vitest du contrat, pas par des candidats.

## Décisions de test

- **Ce qui fait un bon test ici** : il observe un comportement de
  l'extérieur. Les tests lisent `measure.json`, `oracle.json` et le code de
  sortie, ou le résultat d'une fonction pure ; ils ne regardent pas les
  étapes internes du runner.
- **Seam 1, le plus haut : `migrabench measure` sur la vraie pile**, en CI,
  avec les candidats de `fixtures/`. C'est le critère de fin et la preuve de
  chaque issue :
  - le candidat de référence : mesure complète, 38 scénarios réussis, 0 non
    atteint, journal d'accès avec ses deux requêtes témoins et des requêtes
    hors marqueur ;
  - les huit candidats défectueux : l'issue, la catégorie et le code du
    tableau ;
  - une mesure lancée pendant qu'une autre tient le verrou du banc : code
    `4`, aucun résultat écrit ;
  - une mesure interrompue par `SIGINT` pendant l'oracle : code `3`,
    `measure.json` écrit avec la cause `interrupted`, verrou du banc libéré.
- **Seam 2 : Vitest sur les fonctions pures**, en TDD (rouge d'abord) :
  - **contrat** : chaque champ du schéma, champ inconnu, `url` refusée avec
    son message, `package-lock.json` absent, chaque sorte de source
    refusée, chemin local dans le candidat accepté ;
  - **verdict** : chaque issue de phase vers sa catégorie et son code ;
    refus de toute cause d'invalidité hors de la liste fermée ; délai
    dépassé jamais invalide ; erreur du runner avant `npm ci` invalide,
    après `npm ci` panne pendant que le candidat tourne ; erreur réseau hors
    du registre imposé jamais invalide ; `oracle.executed: false` compte les scénarios
    comme non atteints ;
  - **préconditions de `--counted`** : chaque condition seule, puis toutes
    ensemble, nommées dans un seul message ;
  - **journal d'accès** : requêtes témoins présentes ; absente →
    `access-log-inactive` ; marqueur hors de son moment →
    `marker-out-of-place` ; marqueur d'une autre mesure ignoré ; marqueur
    du Seam A pendant la mesure → `marker-out-of-place` ;
  - **contrôle de `measure.json` versionné** : mêmes règles que #53, plus
    `counted: true`, `originMain` connu, `benchCommit` égal à `originMain`
    ou ancêtre de lui,
    empreinte de `oracle.json` conforme.
- **Seam 3 : le verrou du banc**, par des processus réels : prise, refus,
  prise par `npm test` pendant tout Vitest, refus de `npm test`, libération
  sur échec et sur interruption (Ctrl+C au terminal et sous npm, `SIGINT` et
  `SIGTERM` seuls : un seul signal reçu par Vitest, verrou du banc libéré
  après son nettoyage) (#94) ; reprise d'un verrou dont le PID n'existe plus ;
  reprise d'un verrou dont le PID est porté par un processus d'une autre
  heure de démarrage ou d'une autre ligne de commande ; refus de reprendre
  un verrou dont le détenteur vit (les trois valeurs concordent).
- **Seam A existant** : le relais du candidat de référence comparé au legacy
  (corps octet par octet, en-têtes selon la liste fermée, redirection) ; le journal d'accès survit à un
  redémarrage du legacy et ne contient pas les requêtes du port `8081`.
- **Antériorité** : tests de la collecte et du contrôle des résultats de
  l'oracle (étape 2, #53), `tests/seam-a`, contrôle de version de Node de
  `pretest`, job de preuve de l'oracle en CI.

## Hors périmètre

- Les portes (étape 4), porte du relais comprise : l'étape 3 conserve le
  journal d'accès et réserve la place des portes, elle ne juge rien.
- Le score, l'agrégation et le rapport (étape 5), dont le choix de la mesure
  qui compte parmi les mesures d'un candidat.
- Le prompt, les runs d'agents et le réétalonnage de campagne (étape 6).
- Le support de conservation des bruts des mesures comptées (étape 6).
- Fermer l'accès du candidat au port `8080` ou à Internet (ADR 0004 et
  0007 : on détecte, on ne ferme pas).
- Tout langage de couche serveur autre que Node (ADR 0003).

## Notes

- **Critère de fin** (`docs/PLAN.md`) : le candidat de référence obtient
  100 %. Preuve :
  - le résultat d'étalonnage, obtenu en CI et versionné ;
  - une mesure du candidat de référence avec `--counted`, lancée en CI depuis
    un commit de `main` : `verdict.category: completed`, 38 scénarios
    réussis, 0 non atteint, `worktree: clean`, `saltImposed: false`,
    `originMain` renseigné, journal d'accès avec ses deux requêtes témoins ;
    son dossier récupéré des artefacts et versionné, comme toute mesure
    comptée ;
  - les huit candidats défectueux avec l'issue attendue, dans le même job ;
  - les tests Vitest verts, et la PR qui cite le job par son lien.
- **Glossaire** : « verrou du banc » et « candidat d'étalonnage » ajoutés,
  et la liste des causes d'invalidité étendue à l'erreur du runner avant
  `npm ci` et à l'interruption, dans la même PR que cette spec.
- **Mesure interrompue** : la remplacer sans trace ouvrirait un moyen
  d'écarter une mesure qui tourne mal. Elle est donc conservée, invalide,
  versionnée si elle était prévue pour compter, et toujours signalée par le
  rapport.
- Suite prévue : `/to-tickets` sur cette spec. Premier ticket naturel : le
  contrat de candidat et son schéma, qui ne dépendent pas de Docker.
