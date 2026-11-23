# Le candidat tourne dans une image d'exécution du banc, construit puis démarré en deux phases

Complète l'ADR 0004. La couche serveur du candidat doit joindre l'API
interne, et le port `8081` n'est pas publié sur l'hôte : le candidat tourne
donc dans un conteneur branché sur `mb-internal`. Ce conteneur part d'une
**image d'exécution fournie par le banc**, Node 22, épinglée par empreinte,
la même pour tous les candidats : l'ADR 0003 fixe déjà le langage pour ne pas
ajouter de variance sans lien avec le cadrage, et la version de Node ou
l'image de base n'en sont pas plus. Le runner exécute le candidat en deux
phases, chacune dans un conteneur tiré de cette image :

- **construction** : `npm ci`, puis la commande de construction déclarée dans
  `candidate.json`. Le candidat fournit donc son `package-lock.json`. Cette
  phase a accès au réseau pour installer les dépendances, depuis le seul
  registre public npm, imposé par le banc. Un `package-lock.json` qui
  contient une autre source (autre hôte, dépôt Git, archive, chemin local
  hors du candidat) est un échec au contrat. Seule une erreur réseau sur une
  requête précise vers ce registre (connexion refusée ou coupée, DNS, `5xx`
  du registre), prouvée par le journal de npm, rend la mesure invalide ; le
  dépassement du délai global de construction est un échec du candidat
  (règle 7 de `PROTOCOL.md`). Elle n'est pas branchée sur `mb-internal` et ne
  reçoit aucune variable du banc ;
- **démarrage** : la commande de démarrage déclarée dans `candidate.json`,
  dans un conteneur relié à `mb-internal` (API interne, service d'archivage)
  et à `default` (nécessaire pour publier le port). Le banc impose le port
  (`PORT`) et le publie sur `127.0.0.1`. Il transmet les variables de
  l'ADR 0004 : `LEGACY_API_URL`, `ARCHIVE_URL`, `ARCHIVE_TOKEN` et
  `USERS_FILE`, ce dernier monté en lecture seule.

La construction se fait dans une copie du candidat, sous
`.oracle-artifacts/<identifiant de la mesure>/`, jamais dans le dossier
versionné. Au démarrage, cette copie est montée en lecture seule, avec un
dossier temporaire en écriture si besoin. Le conteneur du démarrage est un
service `candidate`, décrit dans une composition complémentaire que le
runner génère pour chaque mesure dans ce même dossier, et citée par empreinte
dans le résultat. Il est recréé après le legacy et le service d'archivage,
une fois ceux-ci sains, et à chaque redémarrage du legacy.

Le code du candidat n'est pas fiable. Dans les deux phases, le conteneur
tourne sans les droits root, sans accès au socket Docker, avec le seul dossier
du candidat monté, et avec des limites de mémoire et de CPU.

## Options écartées

- **Dockerfile fourni par le candidat** : l'image de base et la version de
  Node deviennent des variables du run, sans lien avec le cadrage étudié.
- **Candidat lancé sur l'hôte** : il ne joint l'API interne que si l'on
  publie le port `8081`, ce que l'ADR 0004 interdit.

## Conséquences

- L'empreinte de l'image d'exécution du banc rejoint les empreintes d'images
  Docker relevées dans l'environnement du résultat.
- Une dépendance absente du `package-lock.json` ne s'installe pas : la
  construction échoue, au lieu de résoudre des versions différentes d'une
  mesure à l'autre.
- Limite connue : le réseau `default` donne au candidat un accès à Internet
  pendant son exécution. Il lui donne aussi accès au legacy sur ce réseau
  (limite de l'ADR 0004).
- Le candidat joint le port `8080` du legacy, par `mb-internal` comme par
  `default`, et le navigateur le joint par le port publié. Un candidat qui
  relaie les JSP au lieu de les migrer obtiendrait 100 % à l'oracle. On ne
  ferme pas cet accès, ce qui demanderait de revoir la topologie de
  l'ADR 0004 : on le détecte. Un journal d'accès de Tomcat sur le port
  `8080`, instrumentation du banc et non piège, capte toute requête reçue
  sur ce port, qu'elle vienne de la couche serveur du candidat ou du
  navigateur. Il survit aux redémarrages du legacy. Le runner le conserve
  comme brut de chaque mesure, cité par empreinte, après une requête témoin
  marquée qui prouve qu'il est actif. La porte du relais (étape 4) le lit.
