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

**Couche serveur du candidat** :
Partie serveur produite par l'agent IA, seul point d'entrée exposé d'un
candidat, placée devant l'API interne du legacy.
_Synonyme accepté_ : BFF
_Éviter_ : backend, proxy, API du candidat

**Valeur témoin** :
Valeur unique et connue d'un secret serveur, injectée par le banc, dont la
présence côté navigateur prouve une fuite.
_Éviter_ : canary, token de test

**Dossier réservé** :
Dossier du jeu de données attribué à un seul scénario ou à une seule porte
qui écrit, et que personne d'autre ne touche.
_Éviter_ : dossier de test, fixture

**API interne** :
Endpoints JSON du legacy (rechercher, lire, modifier, remettre), joignables
seulement par la couche serveur du candidat.
_Éviter_ : API legacy, services

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

**Remise** :
Transmission d'un dossier `EN_INSTRUCTION`, qui le fait passer
irréversiblement au statut `REMIS`.
_Éviter_ : transmission, envoi, clôture, réduction

**Accusé de remise** :
Document délivré par le service d'archivage, qui atteste la remise d'un dossier.
_Éviter_ : reçu, preuve de remise

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
