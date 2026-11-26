# migrabench

Banc de mesure des migrations de front legacy assistées par agent. Le
vocabulaire du banc (legacy, oracle, candidat, run, porte, piège) est défini
dans `PROTOCOL.md`. Ce glossaire couvre le domaine métier du legacy.

## Banc

**Piège à corriger** :
Piège dont une bonne migration ne doit pas reproduire le défaut. Il est
mesuré par une porte, jamais par l'oracle.
_Éviter_ : faille, bug planté

**Piège à préserver** :
Piège qui cache un comportement implicite du legacy, qu'une bonne migration
ne doit pas perdre. Il est mesuré par l'oracle.
_Éviter_ : comportement caché, règle implicite

**Scénario** :
Unité de l'oracle et de son taux de réussite : une règle ou un comportement
du legacy, vérifié en une ou plusieurs étapes, qui passe ou échoue d'un bloc.
_Éviter_ : cas de test, vérification

**Scénario non atteint** :
Scénario qui échoue avant ses vérifications, parce que le chemin vers
l'écran vérifié n'aboutit pas. Il compte comme un échec, mais le rapport le
distingue d'un comportement échoué.
_Éviter_ : scénario bloqué, scénario sauté

**Variante observée** :
Moyen choisi par un candidat là où l'oracle laisse le moyen libre (par
exemple bloquer la saisie ou afficher un message), enregistré avec le
résultat du scénario.
_Éviter_ : cas toléré, exception

**Couche serveur du candidat** :
Partie serveur produite par l'agent IA, seul point d'entrée exposé d'un
candidat, placée devant l'API interne du legacy.
_Synonyme accepté_ : BFF
_Éviter_ : backend, proxy, API du candidat

**Candidat de référence** :
Le legacy présenté au banc sous la forme d'un candidat, par un relais sans
logique fourni par le banc. Il obtient 100 % à l'oracle et échoue aux mêmes
portes que le legacy, plus la porte du relais, dont il est le test négatif.
_Éviter_ : candidat legacy, proxy

**Candidat d'étalonnage** :
Candidat écrit par le banc, de la forme d'un vrai candidat, dont les mesures
fixent les délais et les limites de ressources appliqués aux autres
candidats. Jamais une sortie d'agent.
_Éviter_ : candidat de calibration, benchmark

**Candidat défectueux** :
Candidat écrit par le banc pour une porte ou une phase de la mesure, qui
enfreint volontairement sa règle et doit la faire échouer. C'est le témoin
qu'une porte sait détecter.
_Éviter_ : mauvais candidat, candidat négatif

**Candidat conforme** :
Candidat écrit par le banc pour une porte, qui respecte sa règle et doit la
faire réussir. C'est le témoin qu'une porte sait réussir.
_Éviter_ : bon candidat, candidat valide, candidat positif

**Candidat d'essai** :
Sortie d'un agent IA produite avant que le prompt soit figé, conservée avec
sa provenance, qui sert à mettre au point les portes. Ce n'est pas un run :
il n'est jamais compté. Il peut y en avoir plusieurs, par exemple un par
outil. Il n'est jamais retouché pour passer une porte. Une correction faite
pour respecter le contrat de candidat, ou pour retirer une donnée
personnelle, reste séparée de la sortie de l'agent et décrite dans sa
provenance. Elle ne change jamais le comportement du candidat : si retirer
une donnée personnelle le change, c'est noté comme un défaut du candidat,
sans réparation.
_Éviter_ : run 0, pilote, candidat réel

**Verrou du banc** :
Fichier pris par un outil du banc pendant qu'il utilise la pile, qui refuse
les autres outils du banc jusqu'à sa libération. Ne pas confondre avec le
verrou d'un champ du dossier : on écrit toujours « verrou du banc ».
_Éviter_ : lock, mutex

**Mesure** :
Passe du banc sur un candidat : construction, démarrage, oracle et portes,
avec un résultat enregistré. Une seule mesure compte par candidat : la
première mesure prévue pour compter qui n'est pas invalide. Par défaut, une
mesure est un diagnostic ; elle n'est prévue pour compter que sur demande
explicite, depuis un commit de `main`. Une mesure n'est
jamais réécrite. Les mesures prévues pour compter sont toutes versionnées,
invalides comprises ; les mesures de diagnostic restent locales.
_Éviter_ : run, exécution, évaluation

**Mesure invalide** :
Mesure écartée pour une erreur du banc vérifiable, que le candidat ne peut
ni recevoir ni fabriquer (règle 7 de `PROTOCOL.md`) : pile du banc en échec
avant le démarrage du candidat, ou pendant un redémarrage où il est arrêté ;
images de la pile construites depuis une autre copie du dépôt (remède :
`npm run stack:up`) ; erreur de l'oracle hors scénario ; erreur réseau sur une requête précise
vers le registre imposé de l'installation des dépendances ; marqueur du banc
hors de son moment prévu dans le journal d'accès du legacy, ou requête
témoin absente de ce journal ; erreur imprévue du runner avant le lancement
de `npm ci` ; erreur d'une porte avant qu'elle ait examiné quoi que ce soit
du candidat ; interruption de la mesure, qui est conservée et toujours
signalée. La raison est enregistrée dans son résultat, ou, si l'erreur est
découverte après coup, dans un document ajouté qui cite les mesures
concernées, la raison et la preuve. La mesure
suivante du même candidat compte à sa place, et le rapport le signale. Un
échec dû au candidat ne rend jamais une mesure invalide.
_Éviter_ : mesure ratée, mesure annulée

**Non évaluable** :
Résultat d'une porte qui n'a examiné aucun élément, ou dont l'examen ne permet
pas de conclure à une réussite (la valeur témoin dont un corps de réponse à
vérifier manque au HAR, #153 et #158). Il compte comme un échec, jamais comme
une réussite. Un candidat qui ne démarre pas rend toutes ses
portes non évaluables. À distinguer d'une porte en erreur.

**Résultat relevé** :
Résultat d'une porte qui rapporte des valeurs sans les juger, faute de
critère de réussite. Il ne compte ni comme une réussite ni comme un échec.
S'il n'a rien examiné, il est non évaluable comme les autres.
_Éviter_ : métrique, résultat informatif

**Porte en erreur** :
Résultat d'une porte qui a planté elle-même (exception, outil absent, délai
dépassé). Avant tout examen du candidat, l'erreur rend la mesure invalide.
Pendant l'examen, le candidat peut l'avoir provoquée : elle compte comme un
échec, mais le rapport la distingue d'un échec, avec sa cause. Une porte que
le délai global de la phase des portes empêche d'examiner quoi que ce soit
compte de la même façon, avec sa cause propre (`gates-phase-timeout`) :
le candidat a pu ralentir les portes précédentes.
_Éviter_ : porte plantée, crash
_Éviter_ : sans objet, ignoré, ok par défaut

**Valeur témoin** :
Valeur unique et connue d'un secret serveur, injectée par le banc, dont la
présence côté navigateur prouve une fuite.
_Éviter_ : canary, token de test

**Dossier réservé** :
Dossier du jeu de données attribué à un seul propriétaire qui écrit, et que
personne d'autre ne touche. Trois sortes de propriétaires : un scénario
(`scenario:`), une porte (`gate:`) ou un test du banc qui écrit (`test:`).
_Éviter_ : dossier de test, fixture

**API interne** :
Endpoints JSON du legacy (rechercher, lire, modifier, remettre), servis sur
le port `8081`. Elle n'est pas joignable depuis l'hôte, donc pas depuis le
navigateur ; seule la couche serveur du candidat est censée l'appeler. Limite
connue de cette isolation : voir l'ADR 0004.
_Éviter_ : API legacy, services

**Seam A** :
Frontière où les tests du banc observent le legacy par des appels HTTP
contre la pile `docker compose up`, sans regarder ses classes Java
(spec de l'étape 1).

**Seam B** :
Frontière où les tests du banc lisent le fichier du jeu de données sans
démarrer le legacy (spec de l'étape 1).

## Domaine du legacy

**Dossier** :
Demande administrative identifiée par un numéro, portant un demandeur, un
objet, une date de dépôt et un statut.
_Éviter_ : demande, affaire, ticket

**Demandeur** :
Personne à l'origine d'un dossier, saisie en texte libre.
_Éviter_ : usager, client

**Statut** :
État d'un dossier parmi `BROUILLON`, `EN_INSTRUCTION` et `REMIS`.
_Éviter_ : état, étape

**Verrou** :
Interdiction de modifier un champ du dossier, posée par son statut :
le demandeur à partir de `EN_INSTRUCTION`, l'objet à partir de `REMIS`.
Appliqué par le service métier, pas seulement par l'écran.
_Éviter_ : blocage, gel

**Remise** :
Transmission d'un dossier `EN_INSTRUCTION`, qui le fait passer
irréversiblement au statut `REMIS`.
_Éviter_ : transmission, envoi, clôture, réduction

**Accusé de remise** :
Document délivré par le service d'archivage, qui atteste la remise d'un dossier.
_Éviter_ : reçu, preuve de remise

**Référence d'archivage** :
Identifiant porté par un accusé de remise, que seul le service d'archivage
peut calculer. Elle distingue un vrai accusé d'un accusé fabriqué.
_Éviter_ : numéro d'accusé, signature

**Service d'archivage** :
Service externe au legacy, simulé par le banc, qui délivre les accusés de
remise sur présentation d'un jeton secret.
_Éviter_ : GED, archive

**Instructeur** :
Rôle autorisé à effectuer la remise d'un dossier.
_Éviter_ : admin, valideur

**Agent** :
Rôle qui consulte et édite les dossiers, sans droit de remise. À ne pas
confondre avec l'agent IA qui produit un candidat (voir `PROTOCOL.md`).
_Éviter_ : utilisateur, opérateur
