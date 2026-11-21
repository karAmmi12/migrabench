# #32 · Étape 2 · Fil traceur : npm run oracle de bout en bout

## Objectif

L'étape 2 doit dire ce qu'est une migration fidèle : un oracle Playwright qui
tourne tel quel contre le legacy et contre tout candidat. Avant d'écrire ses
38 scénarios, ce ticket pose le **fil traceur** : une exécution complète de
bout en bout, avec deux scénarios seulement (R2 `search-empty-form` et R17
`auth-no-credentials`). `npm run oracle` tire un sel, recrée le legacy et le
service d'archivage, lance Playwright et écrit un résultat JSON versionné. Ce
résultat enregistre son environnement et cite traces et HAR par empreinte
(ADR 0005). Les tickets de scénarios (#34 à #38) et le runner de l'étape 3
réutilisent ce socle.

## Notions à connaître

- **Fixture Playwright** : une fonction qui prépare ce dont un test a besoin,
  le lui passe par `use()`, puis nettoie après lui. Une fixture peut en
  remplacer une fournie par Playwright (ici `context`) ; une fixture
  `option: true` se règle par `test.use()` (ici `identity`). —
  [Playwright : Fixtures](https://playwright.dev/docs/test-fixtures)
- **`browser.newContext()`, `httpCredentials` et `recordHar`** : un contexte
  est un profil de navigateur isolé. `httpCredentials` répond au défi
  `BASIC` du legacy ; `recordHar` enregistre tout le trafic du contexte dans
  un fichier HAR, écrit à sa fermeture. —
  [Playwright : Browser.newContext](https://playwright.dev/docs/api/class-browser#browser-new-context)
- **HAR (HTTP Archive)** : un fichier JSON qui liste chaque requête et chaque
  réponse, corps compris avec `content: "embed"`. Les portes de l'étape 4 y
  chercheront la valeur témoin et les requêtes à rejouer. —
  [Playwright : Mock APIs, recording a HAR](https://playwright.dev/docs/mock#recording-a-har-file)
- **Trace Playwright** : une archive `trace.zip` qui rejoue un scénario pas à
  pas (actions, réseau, captures). Avec `trace: "on"`, chaque scénario en
  produit une. —
  [Playwright : Trace viewer](https://playwright.dev/docs/trace-viewer)
- **`test.step` et annotations** : `test.step` découpe un scénario en étapes
  nommées ; une annotation (`type`, `description`) se pose pendant le
  scénario par `test.info().annotations`. L'oracle pose `mb:reach` à la fin
  de la navigation : un échec sans elle rend le scénario non atteint. —
  [Playwright : Annotations](https://playwright.dev/docs/test-annotations)
- **Reporter JSON de Playwright** : il écrit le résultat d'une exécution
  dans un fichier (suites, specs, résultats, pièces jointes, métadonnées). Le
  résultat de l'oracle garde ce format et l'enrichit. Dans ce JSON, les tags
  perdent leur `@` (`"recherche"`, `"clavier"`). —
  [Playwright : Reporters, JSON reporter](https://playwright.dev/docs/test-reporters#json-reporter)
- **`git status --porcelain=v1 -z`** : la sortie de `git status` stable pour
  un programme. Chaque entrée commence par un code à deux lettres (`??` pour
  un fichier non suivi). Avec `-z`, les chemins ne sont pas cités, et le
  chemin source d'un renommage suit dans l'entrée suivante. —
  [Git : git-status, Porcelain Format Version 1](https://git-scm.com/docs/git-status#_porcelain_format_version_1)
- **`docker compose up --force-recreate --no-build --wait`** : recrée les
  conteneurs à partir des images existantes, sans les reconstruire, et
  attend que leurs healthchecks passent. Le legacy recharge son jeu de
  données au démarrage : c'est la remise à zéro. —
  [Docker : docker compose up](https://docs.docker.com/reference/cli/docker/compose/up/)

## Ce qui a été construit

- **`oracle/execute.ts`** : `executeOracle({ baseUrl, salt? })`, le module
  d'exécution complète, en trois temps.
  - Préparer : tirer un sel de 32 octets, recréer `legacy` et `archive`,
    relever l'environnement (commit, état de l'arbre, Node, images, horloge
    figée).
  - Lancer : Playwright, avec `BASE_URL` et le sel dans son seul
    environnement, traces et HAR dans `.oracle-artifacts/<identifiant de
    l'exécution>/`, dossier du projet ignoré par Git.
  - Collecter : hacher HAR et traces, appeler la collecte, écrire
    `results/oracle/<horodatage>-<commit>.json`.
- **`oracle/cli.ts`** : `npm run oracle`, commande mince sur
  `executeOracle`. Code de sortie non nul si un scénario n'a pas réussi.
  `ORACLE_SALT` impose le sel, pour le diagnostic seulement.
- **`oracle/collect.ts`** : la collecte, fonction pure. Elle classe chaque
  scénario (réussi, échoué, non atteint), calcule les deux taux et le compte
  `@clavier`, ajoute `mb:har` et `mb:trace`, puis `salt` et `summary` aux
  métadonnées. Elle rapporte tous les chemins à la racine du dépôt.
- **`oracle/worktree.ts`** : l'état de l'arbre (`clean` ou `dirty`) lu dans
  `git status`.
- **`oracle/support.ts`** : les outils partagés des scénarios. Fixture par
  identité (agent, instructeur, sans identifiants, utilisateur inconnu) avec
  un HAR par scénario, libellés exacts, navigation vers la recherche,
  numéros affichés, dossiers partagés lus dans `dossiers.json`.
- **`oracle/scenarios/search.spec.ts`** : R2 et R17.
- **`oracle/playwright.config.ts`** et **`oracle/env.ts`** : Chromium seul,
  `fullyParallel`, `retries: 0`, `trace: "on"`, reporter JSON ; noms des
  variables passées par `executeOracle` à la configuration.
- **`scripts/users.ts`** : `UNKNOWN_USER` y devient la constante commune à
  l'oracle et au Seam A, vérifiée absente de `fixtures/users.json`.
- **`tests/oracle/`** : tests Vitest de la collecte et de l'état de l'arbre.
- **`.gitignore`** : `.oracle-artifacts/`, vérifié par
  `tests/oracle/artifacts-ignored.test.ts` (`git check-ignore`).
- **`results/oracle/20261121T163457Z-886692d.json`** : le résultat
  versionné, obtenu au commit `886692d`, arbre propre.
- **`package.json`** : `@playwright/test` (1.65.1) et le script `oracle`.
- **`README.md`** et **`docs/specs/02-oracle.md`** : section « Lancer
  l'oracle » ; dans la spec, `executeOracle` et la navigation de R17 et R18.

## Les choix faits et pourquoi

- **Collecte pure, empreintes calculées à côté** : `collect` reçoit le JSON
  et les empreintes ; `executeOracle` lit et hache les fichiers. Écarté :
  une collecte qui lit le disque elle-même. Raison : la spec veut une
  fonction pure, testable sur des JSON fabriqués.
- **Fixture `context` remplacée** : un `browser.newContext()` par scénario,
  avec `httpCredentials` selon l'identité et `recordHar` sans filtre d'URL.
  La trace Playwright couvre bien ce contexte : la `trace.zip` de R2
  contenait `1-trace.trace` et `1-trace.network`.
- **HAR cité par son chemin** (`testInfo.attachments.push`), pas par
  `testInfo.attach`, qui en faisait une copie dans `attachments/`.
- **Le sel vérifié absent avant la collecte** : `executeOracle` refuse un
  rapport Playwright qui contiendrait déjà le sel. C'est le critère « sel
  absent tant que Playwright tourne », contrôlé à chaque exécution.
- **Taux en fraction de 0 à 1** ; le taux sur les scénarios atteints vaut
  `null` quand aucun n'est atteint, au lieu d'une division par zéro.
- **Code de sortie non nul aussi** quand Playwright signale une erreur hors
  scénarios ou quand aucun scénario n'a tourné.
- **R2 compare à une liste littérale** (`D-0001` à `D-0030`), pas à la liste
  lue dans `dossiers.json`. Signalé par la revue de la spec ; gardé, car la
  spec veut des valeurs attendues littérales.
- **`mb:reach` lu dans les annotations du test et du résultat** : la revue
  de la spec craignait qu'il ne figure que dans l'une des deux. Le rapport
  réel (Playwright 1.65.1) l'avait dans les deux ; la collecte lit
  désormais les deux, avec un test.
- **État de l'arbre** (demande de l'humain, après revue) : propre s'il n'y a
  aucune modification de fichier versionné et aucun fichier non suivi hors
  des nouveaux fichiers de `results/oracle/`. Écarté : exclure tout
  `results/oracle/` de `git status`, première version, qui laissait passer
  un ancien résultat modifié.
- **Chemins relatifs à la racine du dépôt** (demande de l'humain) : le
  résultat versionné contenait 8 lignes avec un chemin `/Users/…`. La collecte rapporte
  les champs de chemin à la racine, retire la racine des textes (messages,
  piles d'appels), et refuse d'écrire un résultat qui contient encore
  `/Users/` ou `/home/`.
- **Bruts dans `.oracle-artifacts/<identifiant de l'exécution>/`**
  (demande de l'humain) : traces et HAR sont écrits dans ce dossier du
  projet, ignoré par Git. Le résultat le donne dans la métadonnée
  `artifacts` et y cite chaque pièce jointe par un chemin relatif
  (`search-search-empty-form-chromium/scenario.har`). La collecte refuse une
  pièce jointe hors de ce dossier. Écarté : le dossier temporaire du
  système, dont les chemins (`../../../../../../var/folders/…`) dévoilaient
  la machine et auraient changé en CI. Le job de CI de #39 téléversera ce
  dossier.
- **`executeOracle` au lieu de `runOracle`** (demande de l'humain) :
  « run » est réservé par `PROTOCOL.md` à l'exécution complète d'un outil.
  La spec est renommée aussi.
- **R17 non atteint sur une erreur de connexion** (demande de l'humain) :
  le chargement de `BASE_URL` devient l'étape de navigation. Écarté : poser
  `mb:reach` avant le chargement, qui classait « échoué » un front
  injoignable et le confondait avec un candidat qui accepte l'accès sans
  identifiants.
- **Hors du ticket** : le passage de `ARCHIVE_SALT` au conteneur
  d'archivage (#33), le workflow de CI et `ciRun` (#39).

## Difficultés rencontrées

- **Attendus volontairement faux (critère du ticket).**
  - R2 attendait 31 dossiers : échec `toEqual`, « Expected - 1 ».
  - R17 attendait un `403` : « Expected value: 403, Received array: [401] ».
  - Les deux ont été classés « échoué » (`failed: 2`).
  - Lancé en identité agent, R17 a aussi échoué sur sa seconde
    vérification : « Expected: 0, Received: 1 » pour le champ « Numéro ».
  - Les attendus ont ensuite été rétablis.
- **Arbre « modifié » à la deuxième exécution.** Symptôme : signalé par la
  revue de la spec. Cause : chaque exécution écrit son résultat dans le
  dossier versionné `results/oracle/`. Résolution : `oracle/worktree.ts`,
  selon la règle donnée par l'humain. Sur le code du commit `943d6bd`, deux exécutions
  enchaînées ont enregistré `clean`, avec deux sels différents ; après
  l'ajout d'une espace à la fin de
  `results/oracle/20261121T160230Z-7b91b86.json`, l'exécution suivante a
  enregistré `dirty`.
- **Chemins personnels dans le résultat.** Symptôme : 8 lignes contenant
  `/Users/` dans le premier résultat versionné (`grep -c`). Cause : le reporter JSON
  écrit des chemins absolus. Résolution : conversion dans la collecte. Le
  commit de ce premier résultat, pas encore poussé, a été retiré.
- **Chemins des bruts dépendants de la machine.** Symptôme : dans le
  résultat de `7b91b86`, les pièces jointes étaient citées par
  `../../../../../../var/folders/qf/…/T/migrabench-oracle/…`. Cause : les
  bruts étaient écrits dans le dossier temporaire du système, hors du
  dépôt. Résolution : `.oracle-artifacts/`, voir les choix ; ce résultat
  est remplacé par celui de `886692d`.
- **La garde des chemins s'est déclenchée sur une vraie exécution.**
  Symptôme : « The oracle result would contain a home directory path
  (/Users/) ». Cause : `config.argv[0]`, le binaire de Node sous `~/.nvm`,
  hors du dépôt et hors des champs de chemin connus. Résolution : `argv`
  ajouté aux champs de chemin, avec le cas dans le test.
- **R17 « échoué » contre une `BASE_URL` injoignable.** Symptôme : contre
  `http://localhost:8099`, R2 était « non atteint » mais R17 « échoué ».
  Cause : `mb:reach` posé avant le chargement. Résolution : voir les choix.
- **Renommage glissé dans le mauvais commit.** Symptôme : le `git mv` de
  `oracle/run.ts` était déjà indexé et est parti dans le commit de
  `worktree.ts`, qui ne compilait plus seul. Résolution : les quatre
  commits, non poussés, ont été refaits.
- **Commit intermédiaire qui ne compile pas.** `27f5421` rend `root`
  obligatoire pour `collect`, alors que `oracle/execute.ts` ne le passe qu'au
  commit suivant (`fcb60a2`). L'état final compile.

## Vérifier soi-même

Prérequis : la pile construite (`docker compose build`) et Chromium
(`npx playwright install chromium`). Attention : chaque `npm run oracle`
écrit un nouveau fichier dans `results/oracle/`, à supprimer s'il ne doit
pas être versionné.

```sh
npx vitest run tests/oracle
```

Attendu : `Tests  25 passed (25)`.

```sh
npm test && npm run typecheck
```

Attendu : `Tests  107 passed (107)`, puis `tsc --noEmit` sans erreur.

```sh
npm run oracle; echo "exit=$?"
```

Attendu :

```
  2 passed
Result: results/oracle/<horodatage>-<commit>.json
Scenarios: 2, passed: 2, failed: 0, unreached: 0
exit=0
```

```sh
BASE_URL=http://localhost:8099 npm run oracle
```

Attendu : `net::ERR_CONNECTION_REFUSED` pour les deux scénarios, puis
`Scenarios: 2, passed: 0, failed: 0, unreached: 2`.

Ancien résultat modifié : l'arbre devient « modifié ».

```sh
echo " " >> results/oracle/20261121T163457Z-886692d.json
npm run oracle >/dev/null 2>&1
git ls-files --others results/oracle   # le nouveau résultat
# lire config.metadata.worktree dans ce fichier
git checkout -- results/oracle/20261121T163457Z-886692d.json
```

Attendu : `dirty` (observé sur le résultat précédent, `…7b91b86.json`).
Sans la modification, deux exécutions enchaînées enregistrent toutes deux
`clean`.

Pièces jointes citées relativement au dossier des bruts :

```sh
node -e 'const r=require("./results/oracle/20261121T163457Z-886692d.json");
const walk=s=>[...s.specs,...(s.suites??[]).flatMap(walk)];
console.log(r.config.metadata.artifacts);
for (const s of r.suites.flatMap(walk)) console.log(s.title, s.tests[0].results[0].attachments.map(a=>a.path).join(" "))'
```

Attendu :

```
.oracle-artifacts/20261121T163457Z-15c5be91
search-empty-form search-search-empty-form-chromium/scenario.har search-search-empty-form-chromium/trace.zip
auth-no-credentials search-auth-no-credentials-chromium/scenario.har search-auth-no-credentials-chromium/trace.zip
```

```sh
grep -cE '/Users/|/home/' results/oracle/20261121T163457Z-886692d.json
```

Attendu : `0`.

## Pour aller plus loin

- #33 : la référence d'archivage, et `ARCHIVE_SALT` transmis au seul
  service d'archivage par la composition.
- #34 à #38 : les 36 autres scénarios, sur les outils de `oracle/support.ts`.
- #39 : le job de CI de l'oracle et la preuve sur 5 exécutions consécutives,
  qui s'appuie sur la règle de l'arbre propre posée ici.
- Limite connue : `config.argv[0]`, le binaire de Node, reste cité par un
  chemin relatif hors du dépôt (`../../../../.nvm/versions/node/…` en
  local) ; il dépend de la machine et changera en CI.
- ADR 0005 (résultats JSON versionnés, bruts hors du dépôt) et ADR 0006
  (contrat de l'oracle envers le candidat).
