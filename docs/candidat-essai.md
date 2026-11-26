# Procédure : produire un candidat d'essai

Source : ADR 0010 et spec de l'étape 4 (« Candidat d'essai »). Un candidat
d'essai n'est pas un run : le prompt n'est pas figé, et le candidat n'est
jamais compté. L'agent ne doit rien savoir du banc. Toute fuite constatée à
une étape arrête la procédure.

Ce que reçoit l'agent :

- la copie expurgée du legacy, produite par `scripts/legacy-copy.ts` ;
- `fixtures/trial-kit/brief.md`, copié dans son répertoire de travail ;
- `fixtures/trial-kit/prompt.md`, passé en ligne de commande.

Ces trois éléments passent le test témoin
`tests/legacy-copy/legacy-copy-real.test.ts`.

L'agent tourne dans un conteneur Docker (`fixtures/trial-agent/Dockerfile`,
lancé par `npm run trial:agent`) :

- seul son répertoire de travail est monté, sous `/work` ; le reste du disque
  de l'hôte n'y est pas ;
- la configuration de Claude Code y est vierge (`CLAUDE_CONFIG_DIR` dans
  l'image, rien de monté), et chaque lancement part d'un conteneur neuf ;
- Claude Code y tourne en mode `bypassPermissions`, sans aucune question
  d'autorisation, sous l'utilisateur `node` : Claude Code refuse ce mode
  sous root ;
- le conteneur a accès à Internet (API, registre npm). Il joint aussi les
  ports publiés sur l'hôte : la pile du banc doit être arrêtée.

## 1. Le jeton d'abonnement

Sur l'hôte, une fois (le jeton vaut un an) :

```sh
claude setup-token
```

La commande ouvre le navigateur, comme `/login`, puis affiche le jeton sans
l'enregistrer nulle part (documentation de Claude Code, page
`authentication`, « Generate a long-lived token »). Il faut un abonnement
Pro, Max, Ultra, Team ou Enterprise ; aucune clé d'API n'est utilisée.

Le jeton ne s'écrit jamais dans un fichier du dépôt ni dans un journal
versionné. Il vit dans le shell qui lance l'agent :

```sh
read -rs CLAUDE_CODE_OAUTH_TOKEN && export CLAUDE_CODE_OAUTH_TOKEN
```

`trial:agent` le passe au conteneur par son seul nom (`docker run -e
CLAUDE_CODE_OAUTH_TOKEN`) : sa valeur n'apparaît dans aucune ligne de
commande. L'agent peut le lire dans son environnement ; l'étape 5 vérifie
qu'il n'est ni dans le journal ni dans le répertoire de travail.

## 2. Le répertoire de travail et l'image

Le répertoire est hors du dépôt et hors de `$HOME`.

```sh
WORK=/tmp/trial-claude-$(date +%Y%m%d)
npm run trial:copy -- "$WORK"
npm run trial:agent -- build
```

`trial:copy` refuse un répertoire dans le dépôt ou sous `$HOME`, un
répertoire non vide, et un arbre de travail modifié sur ce qui fait la copie
(legacy, kit, scripts). Il écrit `legacy-app/` et `brief.md`, puis affiche
`benchCommit`, `files` et `copyDigest` : les garder pour la provenance.

`build` construit l'image `migrabench-trial-agent` : Node 22 et Claude Code
à une version fixe, sans mise à jour automatique.

## 3. La sonde d'isolement

Arrêter d'abord la pile du banc, dans le dépôt :

```sh
docker compose stop
```

`trial:agent` refuse de lancer le conteneur tant qu'un conteneur dont le nom
commence par `migrabench` tourne.

### 3a. Le disque et le réseau, vus du conteneur

```sh
npm run trial:agent -- isolation "$WORK"
```

Depuis le conteneur, le script vérifie, et sort en erreur à la première
ligne `LEAK` :

- que le chemin du dépôt et le `$HOME` de l'hôte n'existent pas ;
- que les seuls points de montage sont `/`, `/work` et les trois fichiers que
  Docker gère (`/etc/hosts`, `/etc/hostname`, `/etc/resolv.conf`) ;
- que `/work` ne contient que `brief.md` et `legacy-app/` ;
- que les ports 8080 et 8090 de l'hôte ne répondent pas ;
- qu'aucun fichier lisible du conteneur ne contient `migrabench` ni le nom
  d'utilisateur de l'hôte.

### 3b. La session de Claude Code

```sh
npm run trial:agent -- probe "$WORK" /tmp/probe.jsonl
```

La consigne est triviale et en anglais. Le script contrôle l'événement
`system/init` du journal et sort en erreur sur un écart :

- `cwd` vaut `/work` ;
- `mcp_servers` est vide, et tous les `plugins` sont intégrés (`"path":
  "builtin"`) ;
- `permissionMode` vaut `bypassPermissions`.

On vérifie à la main :

1. **la langue** : la réponse (événement `result`) est en anglais ;
2. **`skills`, `agents` et `slash_commands`** : rien qui vienne de Karim
   (aucun skill de `mattpocock-skills`, `fiche-ticket`) ;
3. **la connexion** : la réponse n'est pas « Not logged in ». Relevé le
   26/11 dans le conteneur sans jeton : Claude Code 2.1.332 ne pose aucune
   question de première installation en `-p`, il répond « Not logged in ·
   Please run /login ». Le comportement avec le jeton se note dans la
   provenance à la première sonde.

Une fuite arrête la procédure : on la note, on corrige la copie ou
l'environnement, et on reprend à l'étape 2.

## 4. Le lancement, par Karim

Dans le même shell (même jeton, même `$WORK`, pile arrêtée) :

```sh
npm run trial:agent -- run "$WORK" /tmp/trial-claude.jsonl
```

Le script affiche la version de Claude Code, l'image et l'heure de début,
lance `claude -p "<prompt.md>" --permission-mode bypassPermissions
--output-format stream-json --verbose` dans le conteneur, puis l'heure de
fin, le code de sortie et le contrôle de `system/init`. Ces valeurs, avec le
modèle (champ `model` de `system/init`), vont dans la provenance.

## 5. L'expurgation des journaux

Le journal brut peut contenir le jeton, le répertoire personnel, le nom
d'utilisateur, le nom de la machine et les identifiants de session.

```sh
npm run trial:redact -- /tmp/trial-claude.jsonl <provenance>/session.jsonl "$WORK"
```

Le script lit le jeton dans `CLAUDE_CODE_OAUTH_TOKEN` et refuse sans lui :
la vérification ne serait pas faite. Il refuse aussi un répertoire de
travail dont un fichier contient le jeton, puisque ce répertoire sera
versionné. Puis il remplace les valeurs par `<OAUTH_TOKEN>`, `<HOME>`,
`<USER>`, `<HOST>`, `<WORKDIR>` et `<SESSION_ID>`, et écrit à côté
`session.jsonl.redaction.json` : le sha256 du journal original et le nombre
de remplacements par étiquette, jamais les valeurs.

Le remplacement se fait en sous-chaîne : un nom d'utilisateur ou de machine
court peut aussi toucher du contenu légitime. On relit donc la copie, pour
ces remplacements de trop comme pour une donnée personnelle restante
(`/Users/`, `/home/`, adresse électronique). Le journal original reste hors
du dépôt. La pile se relance ensuite avec `npm run stack:up`.

## 6. La suite (ticket 1b)

Le candidat est versionné sous
`fixtures/trial-candidates/<outil>-<date>/{candidate,provenance}` (spec de
l'étape 4) : sortie brute dans le premier commit, `node_modules/` seul
retiré, chaque correction dans son propre commit.
