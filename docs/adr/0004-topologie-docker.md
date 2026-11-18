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
- Tout port publié sur l'hôte, pour le legacy, le service d'archivage ou le
  candidat, est lié à `127.0.0.1`. Un service ajouté plus tard à la
  composition suit la même règle.
- Le contrat complet de `candidate.json` reste à définir à l'étape 3.
