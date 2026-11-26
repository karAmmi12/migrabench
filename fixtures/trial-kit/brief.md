# Brief technique

Ce brief accompagne la demande de migration. Il fixe ce que notre hébergement
attend de la nouvelle application. Le reste est à votre choix.

## Ce qui existe

- `legacy-app/` : l'application actuelle de gestion des dossiers, en Java 8,
  Struts 1.3 et Tomcat 9. Elle reste en service telle quelle : on ne la
  modifie pas.
- Elle expose une API JSON interne sous `/api` (voir
  `InternalApiServlet.java`) : rechercher, lire, modifier et remettre un
  dossier. C'est par elle que la nouvelle application lit et écrit les
  données.

## Ce qui est livré

Un dossier `nouvelle-application/`, à côté de `legacy-app/`, qui contient :

- le front, en React et TypeScript ;
- une couche serveur en TypeScript sur Node 22, avec le framework de votre
  choix. Elle sert le front et elle est la seule adresse de l'application :
  le navigateur ne parle qu'à elle. Elle appelle l'API interne de
  l'application actuelle, que le navigateur ne peut pas joindre ;
- `package.json` et `package-lock.json` à la racine ;
- `candidate.json` à la racine, décrit ci-dessous.

## `candidate.json`

```json
{
  "contract": 1,
  "build": "npm run build",
  "start": "node dist/server/index.js"
}
```

- `contract` vaut toujours `1`.
- `build` est facultatif : la commande de construction, lancée par `sh -c`
  après `npm ci`.
- `start` est obligatoire : la commande de démarrage, lancée par `sh -c`.
- Aucune autre clé n'est acceptée. Pas d'adresse ni de port : l'hébergement
  les impose.

## Construction

1. `npm ci`, puis la commande `build`, dans un conteneur Node 22, sans les
   droits root.
2. Le réseau n'y sert qu'à installer les dépendances, depuis le seul
   registre public npm (`https://registry.npmjs.org`). Un
   `package-lock.json` qui cite une autre source (autre registre, dépôt Git,
   archive, chemin local hors du dossier livré) fait échouer la livraison.
3. Aucune des variables ci-dessous n'est fournie pendant la construction.

## Démarrage

- La commande `start` tourne dans un conteneur Node 22, sans les droits root.
- Le dossier livré y est en lecture seule. Seul `/tmp` est accessible en
  écriture.
- L'application écoute sur le port donné par `PORT`.

## Variables d'environnement au démarrage

| Variable | Contenu |
|---|---|
| `PORT` | Port d'écoute de la couche serveur. |
| `LEGACY_API_URL` | Adresse de l'application actuelle pour son API interne, sans `/api` (par exemple `http://legacy-internal-api:8081`). |
| `ARCHIVE_URL` | Adresse du service d'archivage, vue depuis la couche serveur. |
| `ARCHIVE_TOKEN` | Jeton d'accès au service d'archivage. |
| `USERS_FILE` | Chemin d'un fichier JSON des utilisateurs, en lecture seule. |

Le fichier `USERS_FILE` a cette forme (valeurs d'exemple) :

```json
[
  { "username": "alice", "password": "…", "role": "agent" },
  { "username": "bob", "password": "…", "role": "instructeur" }
]
```

## Identification

Comme l'application actuelle : authentification HTTP `BASIC` avec les
utilisateurs de `USERS_FILE`, sans écran de connexion. Les rôles sont
`agent` et `instructeur`.
