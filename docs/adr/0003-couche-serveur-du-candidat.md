# Le candidat livre un front React et une couche serveur devant un legacy figé

Remplace l'ADR 0002. Un candidat ne modifie pas le legacy. Il livre une
application React + TypeScript et une **couche serveur du candidat** (BFF)
écrite en TypeScript sur Node 22, avec un framework libre. Cette couche sert
le bundle React et constitue la seule URL exposée du candidat. Elle appelle
l'**API interne** du legacy (rechercher, lire, modifier, remettre) par le
réseau Docker interne. L'API interne n'est pas joignable depuis l'hôte, donc
pas depuis le navigateur ; la limite de cette isolation est décrite dans
l'ADR 0004. Ainsi le legacy est identique pour
tous les candidats (règle 1 de `PROTOCOL.md`), et seule la part produite par
l'agent IA varie. L'API interne a les mêmes défauts que les JSP : elle ne
vérifie aucun rôle et ignore l'identité de l'appelant. C'est donc à la couche
serveur du candidat de remonter le contrôle de rôle et de garder le secret.

## Identité

Le banc fournit en lecture seule deux utilisateurs fixes, un agent et un
instructeur. Le legacy les authentifie en mode `BASIC`, par l'authentification
gérée par Tomcat (`tomcat-users.xml` généré depuis ce fichier). La couche
serveur du candidat les authentifie aussi en `BASIC`, à partir du même
fichier. Il n'y a pas d'écran de connexion. L'oracle et les portes passent
les identifiants par `httpCredentials`.

## Options écartées

- Laisser le candidat modifier le legacy (ADR 0002) : les candidats
  divergent sur deux couches, et l'état initial n'est plus commun.
- Faire parler la couche serveur aux actions `.do` en HTML : on mesurerait
  l'analyse de JSP, pas la migration.
- Laisser le langage de la couche serveur libre : cela ajoute de la variance
  sans lien avec le cadrage étudié.
- Servir le front et la couche serveur sur deux URL : le contrat
  `candidate.json` se complique et CORS devient une variable.

## Conséquences

- La porte de sécurité attaque l'URL du candidat, jamais le legacy.
- Piste retenue pour la porte de rôle (étape 4) : elle enregistre la requête
  émise quand l'instructeur clique sur « Remettre », la rejoue avec les
  identifiants de l'agent, puis vérifie par l'API interne que le statut du
  dossier n'a pas changé. On n'impose aucune convention de routes. Pour que
  la vérification ait un sens, il faut remettre le jeu de données dans son
  état initial entre l'enregistrement et le rejeu. Un refus pour une autre
  raison que le rôle (un jeton CSRF, par exemple) passerait la porte : c'est
  un faux positif à surveiller.
- Le jeu de données vit en mémoire dans le legacy et se charge au démarrage
  depuis un fichier versionné. On le remet à zéro en redémarrant le conteneur
  legacy, sans endpoint `reset` dans l'API interne. Chaque scénario qui
  modifie des données possède ses propres dossiers réservés.
- Les dossiers réservés sont déclarés dans le jeu de données et associés au
  nom du scénario (`scenario:`), de la porte (`gate:`) ou du test du banc
  (`test:`) qui écrit. Un test du banc qui écrit, comme ceux de l'API
  interne, remet les valeurs initiales de ses dossiers réservés pour pouvoir
  être relancé sans redémarrage. Un test du banc vérifie qu'aucun
  dossier réservé n'est partagé. Le legacy est redémarré avant chaque
  exécution complète de l'oracle. Les scénarios qui écrivent n'ont pas de
  relance automatique Playwright, car leur dossier réservé a pu être modifié
  par la première tentative.
