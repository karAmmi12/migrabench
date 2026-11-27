# Deux ports Tomcat et deux réseaux Docker pour isoler l'API interne

Les JSP et l'API interne du legacy tournent dans le même Tomcat. Si Tomcat
n'écoutait que sur un port, publier les JSP publierait aussi l'API interne.
Le front d'un candidat pourrait alors appeler l'API interne directement et
contourner les portes de rôle et de secret. Tomcat ouvre donc deux ports :
`8080` pour les JSP et `8081` pour l'API interne. Un filtre refuse toute
requête vers l'API interne qui n'arrive pas par le port `8081`.

Il y a deux réseaux Docker. `mb-internal` relie le port `8081` du legacy, le
service d'archivage et la couche serveur du candidat. Seuls trois ports sont
publiés sur l'hôte : le `8080` du legacy, celui du service d'archivage (le
navigateur suit le lien « Accusé de remise » du legacy) et celui du candidat.
Chacun de ces ports est lié à `127.0.0.1` sur l'hôte
(`"127.0.0.1:<port>:<port>"` dans la composition Docker). Le legacy a des
failles connues qui ne sont pas des pièges mesurés (limites de
`PROTOCOL.md`), et le candidat n'est pas audité. Sans adresse, Docker publie
le port sur toutes les interfaces de l'hôte, ce qui expose la pile au
réseau local.

Le banc fixe les variables d'environnement transmises à la couche serveur du
candidat : `LEGACY_API_URL`, `ARCHIVE_URL`, `ARCHIVE_TOKEN` (la valeur témoin)
et `USERS_FILE`. Le legacy reçoit `ARCHIVE_TOKEN` et l'horloge figée.

## Conséquences

- Le filtre par port est une pièce du banc. Ce n'est **ni un piège, ni un
  comportement du legacy à migrer**. Un candidat n'a pas à le reproduire.
- Un test du banc vérifie qu'un appel à l'API interne par le port `8080` est
  refusé.
- Ce que garantit l'isolation : l'API interne n'est pas joignable depuis
  l'hôte, donc pas depuis le navigateur. Le port `8081` n'est pas publié, et
  un test du banc vérifie qu'une connexion de l'hôte à `8081` échoue. C'est la
  menace visée : le front d'un candidat qui appelle l'API interne directement.
- L'API interne n'est pas joignable non plus depuis le réseau `default`
  (#78). Le legacy est sur `default`, ce qui est nécessaire pour publier
  `8080`. Mais Tomcat n'écoute `8081` que sur son adresse dans `mb-internal`,
  et la composition la nomme par l'alias `legacy-internal-api`, propre à ce
  réseau.
  - Le connecteur `8081` reçoit `address="${mb.internalApiAddress:-0.0.0.0}"`,
    et la composition passe `-Dmb.internalApiAddress=legacy-internal-api`.
  - On ne fige ni sous-réseau ni adresse IP.
  - Les clients de l'API interne l'appellent par l'alias, `LEGACY_API_URL`
    compris : pour un conteneur branché sur les deux réseaux, le nom `legacy`
    désigne son adresse dans `default`.
  - Un test du banc vérifie qu'un conteneur du seul réseau `default` ne
    joint ni `legacy:8081` ni l'alias.
  - L'image lancée seule, hors de la composition, écoute `8081` sur toutes
    ses interfaces.

  Cette fermeture permet le navigateur de #78, service de la composition
  sur `default` seulement.
- Le navigateur du banc (#78) est le service `browser`, sur `default` seul.
  - Il joint le legacy (`8080`), le service d'archivage (`8090`) et le
    candidat (`8100`) par un relais local, qui ne relaie que ces trois
    ports, aux mêmes adresses que depuis l'hôte.
  - Il ne joint pas l'API interne.
  - Son serveur de Playwright est publié sur `127.0.0.1:8095`, comme tout
    port publié.
  - Le candidat, sur `default` lui aussi, joint ce service. Le serveur de
    Playwright (port `3000`, #160) et la passerelle CDP (port `9222`, #134)
    refusent donc toute requête qui ne porte pas le jeton de la pile,
    tiré à chaque démarrage. `run-server` n'écoute que sur la boucle locale
    du conteneur, derrière sa passerelle.
- Tout port publié sur l'hôte, pour le legacy, le service d'archivage ou le
  candidat, est lié à `127.0.0.1`. Un service ajouté plus tard à la
  composition suit la même règle.
- Le contrat complet de `candidate.json` reste à définir à l'étape 3.
