# Provenance du candidat d'essai `claude-code-20261126`

Candidat d'essai (ADR 0010), produit selon `docs/candidat-essai.md` au
commit du banc `2f457d7`. Ce n'est pas un run : le prompt n'est pas figé, et
le candidat n'est jamais compté.

## L'outil

| Élément | Valeur | Source |
|---|---|---|
| Outil | Claude Code `2.1.332` | `system/init.claude_code_version` des deux journaux ; `fixtures/trial-agent/Dockerfile` à `2f457d7` |
| Image | `migrabench-trial-agent`, construite par `npm run trial:agent -- build` à `2f457d7` | procédure |
| Modèle | `claude-sonnet-5-5` | `system/init.model` et `result.modelUsage` des deux journaux |
| Authentification | jeton d'abonnement (`claude setup-token`), aucune clé d'API | `system/init.apiKeySource` vaut `none` |
| Mode | `bypassPermissions`, `cwd` `/work` | `system/init` |

## La copie donnée à l'agent

| Élément | Valeur |
|---|---|
| `benchCommit` | `2f457d7083894fedb744a80949703e1ed7e9ad3d` |
| `files` | 30 |
| `copyDigest` | `sha256:b40449e480f3c1158f987467487dc0f3f335b32f6cba01560d0d93c32a88450a` |

Ces valeurs sont recalculées dans la session du ticket #126 (26/11) : la
sortie de `trial:copy` de Karim n'a pas été gardée. `npm run trial:copy`,
lancé à `2f457d7` (arbre propre) dans un dossier vide, a rendu les valeurs
ci-dessus. `diff -r` entre cette copie et le répertoire de travail de Karim
après le lancement (`legacy-app/` et `brief.md`) ne trouve aucune
différence : la copie est la même, et l'agent n'a pas modifié `legacy-app/`.

`prompt.md` et `brief.md` sont ceux de `fixtures/trial-kit/` à `2f457d7`.
`brief.md` est identique, octet pour octet, à celui que Karim a remis avec les
journaux. Le prompt est passé par `claude -p` : il n'apparaît pas dans le
journal en `stream-json`.

## La sonde (étape 3)

- **3a, disque et réseau** : relevé par Karim, aucune ligne `LEAK` ni
  `UNCHECKED`. La sortie n'est pas versionnée.
- **3b, session** : `probe.jsonl`.
  - `cwd` vaut `/work`, `mcp_servers` est vide, les quatre `plugins` sont
    intégrés (`"path": "builtin"`), `permissionMode` vaut
    `bypassPermissions`.
  - **Skills et agents** : les 19 `skills` et les 5 `agents` listés sont
    ceux de Claude Code. Aucun skill de `mattpocock-skills`, ni
    `fiche-ticket`.
  - **Langue** : la réponse est « Two plus two is four. », en anglais. Le
    `CLAUDE.md` personnel de Karim, qui impose le français, n'est donc pas
    chargé ; le `$HOME` de l'hôte n'est d'ailleurs pas monté.
  - **Connexion** : la réponse n'est pas « Not logged in ». Avec le jeton,
    Claude Code 2.1.332 en `-p` ne pose aucune question de première
    installation.

## Le lancement (étape 4)

| Élément | Valeur | Source |
|---|---|---|
| Date | 26/11/2026, de 15:45:45 à 15:51:18 UTC | sortie de `trial:agent run`, relevée par Karim |
| Code de sortie | 0 | idem |
| Durée | 332 462 ms (API : 312 979 ms) | `result.duration_ms`, `result.duration_api_ms` |
| Tours | 20 | `result.num_turns` |
| Coût | 0,9500074 USD, au prix public (`costBasis: list`) ; payé par l'abonnement | `result.total_cost_usd` |
| Tokens d'entrée | 38 | `result.usage.input_tokens` |
| Tokens écrits en cache | 83 220 | `result.usage.cache_creation_input_tokens` |
| Tokens lus en cache | 1 230 614 | `result.usage.cache_read_input_tokens` |
| Tokens de sortie | 49 399, dont 17 523 de réflexion | `result.usage.output_tokens`, `output_tokens_details.thinking_tokens` |
| Sous-agents | 0 | `result.subagent_stats.spawned` |

La sonde a coûté 0,0238077 USD au prix public (`probe.jsonl`).

## Les journaux

| Fichier | sha256 de l'original (hors dépôt) | sha256 de la version expurgée | Remplacements |
|---|---|---|---|
| `session.jsonl` | `d131a242ec109aa5f046f266dd144f0c0c5fb3eb8c4f398a0769ab3ed25fc7af` | `9bf3698ebf9fda9cf426f91a36c31e0d0b03dc6a35d0ce302c64ae5c1dc4e6e2` | `<SESSION_ID>` : 200, les autres : 0 |
| `probe.jsonl` | `98261aa3c6a8e7807082f320aafbc7ed5d21977518d91898114e87c0bf670213` | `eb3db18bd5b826d241b57f614ba813ae5dfe021617938f9f43eb61a34f493103` | `<SESSION_ID>` : 4, les autres : 0 |

Expurgés par Karim avec `npm run trial:redact` ; les fichiers
`.redaction.json` sont ceux que le script a écrits. Les originaux restent sur
le poste de Karim. Relecture dans la session du ticket #126 : aucun
répertoire personnel de l'hôte, aucune adresse électronique, aucun nom de
Karim. Seul reste le répertoire personnel de l'image, remplacé ensuite (voir
« Corrections »).

## Le candidat

`candidate/` est le dossier `nouvelle-application/` produit par l'agent, tel
quel. Il ne contenait ni `node_modules/` ni `dist/` : l'agent les a
supprimés lui-même, dans ses deux dernières commandes (`rm -rf dist` à la
ligne 192 de `session.jsonl`, `rm -rf node_modules` à la ligne 197). Rien
n'a donc été retiré.

Le premier commit de ce dossier contient la sortie brute. Les corrections
viennent chacune dans leur commit, décrit ci-dessous.

## Corrections

Aucune correction au contrat : la mesure de diagnostic passe la phase du
contrat sur la sortie brute.

1. **Journaux, répertoire personnel de l'image** : le `$HOME` de
   l'utilisateur `node` de l'image de l'agent est remplacé par
   `<CONTAINER_HOME>` dans les deux journaux expurgés : 5 fois dans
   `session.jsonl` (`memory_paths` de `system/init`, chemins des
   `shell-snapshots`), 1 fois dans `probe.jsonl` (`memory_paths`). Ce n'est
   pas une donnée personnelle, mais le test du dossier refuse tout chemin
   sous le répertoire des comptes, comme pour l'hôte. Aucun changement du candidat. Les `.redaction.json` restent
   ceux du script ; les sha256 des journaux versionnés deviennent :
   - `session.jsonl` : `a19dc7eb172e52fd91a9c5c5f9cb0807a2f5234d309aac8a9bd47d431c74aee3` ;
   - `probe.jsonl` : `545e8bf7d636a234fe4295edf57963d45fcba30ca3e78784b3c853edfb7591e5`.

## Mesure de diagnostic

À venir.
