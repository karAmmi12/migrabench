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

## 1. Le répertoire de travail

Il est hors du dépôt et hors de `$HOME` : Claude Code lit les `CLAUDE.md`
des répertoires parents, et le dépôt comme `$HOME` parlent du banc.

```sh
WORK=/tmp/trial-claude-$(date +%Y%m%d)
npm run trial:copy -- "$WORK"
```

Le script refuse un répertoire dans le dépôt ou sous `$HOME`, un répertoire
non vide, et un arbre de travail modifié sur ce qui fait la copie (legacy,
kit, scripts). Il écrit `legacy-app/` et `brief.md`, puis affiche
`benchCommit`, `files` et `copyDigest` : les garder pour la provenance.

## 2. La sonde d'isolement

Elle vérifie que la session de l'agent ne charge rien de la configuration
de Karim. `CLAUDE_CONFIG_DIR` déplace tout ce qui vit sous `~/.claude`
(`CLAUDE.md`, skills, plugins, réglages, sessions) et `.claude.json`
(documentation de Claude Code, pages `env-vars` et `claude-directory`).

```sh
export CLAUDE_CONFIG_DIR="$(mktemp -d /tmp/claude-config-XXXXXX)"
cd "$WORK"
claude -p "Reply with one short sentence: what is two plus two?" \
  --output-format stream-json --verbose > /tmp/probe.jsonl
```

La consigne est triviale et en anglais. On vérifie :

1. **la langue** : la réponse est en anglais. Une réponse en français
   trahit le `CLAUDE.md` global de Karim (« Réponds toujours en
   français ») ;
2. **l'événement `system/init`** (le premier de type `system`, sous-type
   `init`) :
   - `cwd` vaut `$WORK` ;
   - `skills`, `plugins`, `agents` et `mcp_servers` ne contiennent rien qui
     vienne de Karim (aucun skill de `mattpocock-skills`, `fiche-ticket`,
     aucun serveur MCP de claude.ai) ;
   - `slash_commands` ne contient que des commandes intégrées ;
3. **les fichiers** : `$WORK` ne contient que `legacy-app/` et `brief.md`.

La documentation ne dit pas ce que fait un `CLAUDE_CONFIG_DIR` vierge pour
la connexion. Si la sonde demande de se connecter, se connecter dans ce même
`CLAUDE_CONFIG_DIR` (`claude`, puis `/login`), relancer la sonde, et noter le
comportement observé dans la provenance.

Une fuite arrête la procédure : on la note, on corrige la copie ou
l'environnement, et on reprend à l'étape 1.

## 3. Le lancement, par Karim

Dans le même shell (même `CLAUDE_CONFIG_DIR`, même `$WORK`) :

```sh
claude -p "$(cat <chemin du dépôt>/fixtures/trial-kit/prompt.md)" \
  --output-format stream-json --verbose \
  > /tmp/trial-claude.jsonl
```

Karim lance la commande. Il choisit le mode d'autorisation
(`--permission-mode`), et ce choix est noté. La commande exacte, la version de Claude
Code (`claude --version`), le modèle (champ `model` de `system/init`), les
heures de début et de fin sont notés dans la provenance au moment où ils
sont relevés.

## 4. L'expurgation des journaux

Le journal brut peut contenir le répertoire personnel, le nom
d'utilisateur, le nom de la machine et les identifiants de session.

```sh
npm run trial:redact -- /tmp/trial-claude.jsonl <provenance>/session.jsonl "$WORK"
```

Le script remplace ces valeurs par `<HOME>`, `<USER>`, `<HOST>`,
`<WORKDIR>` et `<SESSION_ID>`, et écrit à côté `session.jsonl.redaction.json` :
le sha256 du journal original et le nombre de remplacements par étiquette,
jamais les valeurs. On relit ensuite la copie à la recherche d'une donnée
personnelle restante (`/Users/`, `/home/`, adresse électronique). Le journal
original reste hors du dépôt.

## 5. La suite (ticket 1b)

Le candidat est versionné sous
`fixtures/trial-candidates/<outil>-<date>/{candidate,provenance}` (spec de
l'étape 4) : sortie brute dans le premier commit, `node_modules/` seul
retiré, chaque correction dans son propre commit.
