# migrabench

Banc de mesure pour comparer des migrations de front legacy (Struts 1 / JSP vers
React + TypeScript) réalisées par des agents IA.

On lui donne une application legacy et une version migrée. Il rend un rapport
chiffré : fidélité aux usages, sécurité, accessibilité, performance, coût.

- Protocole expérimental : [PROTOCOL.md](PROTOCOL.md)
- Plan de construction : [docs/PLAN.md](docs/PLAN.md)
- Règles de travail avec l'agent : [CLAUDE.md](CLAUDE.md)

État : en construction (étape 1).

## Lancer le legacy

Prérequis : Docker (avec Compose v2).

```sh
docker compose up -d --build --wait
```

Le legacy (Java 8, Struts 1.3.10, Tomcat 9) répond sur
<http://localhost:8080>, derrière une authentification `BASIC` de Tomcat.
Les deux utilisateurs fixes, un agent et un instructeur, sont décrits dans
[`fixtures/users.json`](fixtures/users.json). Ce fichier génère
`tomcat-users.xml` pendant le build de l'image (ADR 0003).

L'horloge du legacy est figée par la variable `FROZEN_DATE` (aaaa-mm-jj),
fixée dans `docker-compose.yml` : toute date de remise en provient. Sans
elle, le legacy ne démarre pas. Le jeu de données est rechargé à chaque
démarrage : `docker compose restart legacy` annule les remises et les
modifications.

**Toute modification de `fixtures/users.json` demande
`docker compose up --build`** : sans `--build`, le legacy garde les anciens
utilisateurs alors que les tests lisent le nouveau fichier.

## Tests du banc

Prérequis : Node 22 (voir `.nvmrc`), puis `npm install`.

```sh
npm test            # Vitest ; les tests du seam A exigent la pile Docker lancée
npm run typecheck   # tsc --noEmit
```

Les tests du seam A appellent le legacy par HTTP sur `LEGACY_URL`
(par défaut `http://localhost:8080`).
