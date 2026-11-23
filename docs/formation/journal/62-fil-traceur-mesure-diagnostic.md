# #62 · Étape 3 · Fil traceur : mesure de diagnostic du candidat de référence de bout en bout

## Objectif

Jusqu'ici, l'oracle savait seulement viser une `BASE_URL` déjà servie. Ce
ticket pose le premier chemin complet d'une **mesure** :
`migrabench measure --candidate <dossier>` copie le candidat, le construit
puis le démarre dans l'image d'exécution du banc (ADR 0007), rejoue l'oracle
contre lui et écrit un dossier de mesure avec `measure.json` et
`oracle.json`. C'est un fil traceur : chaque phase existe, réduite au plus
court. Les tickets suivants de l'étape 3 (#63 à #74) la complètent : verdict,
contrat, délais, verrou du banc, journal d'accès. Le candidat mesuré est le
**candidat de référence**, le legacy derrière un relais sans logique.

## Notions à connaître

- **Montage d'un dossier de l'hôte (bind mount)** : le conteneur voit un
  dossier de l'hôte. Sous Linux, les fichiers gardent leurs propriétaires
  numériques (uid, gid). L'utilisateur du conteneur doit donc avoir les
  droits de l'hôte sur ce dossier. Suffixe `:ro` : lecture seule. —
  [Docker : Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)
- **`docker run --user`, `--network`, `--volume`** : options du conteneur de
  construction. Elles fixent l'utilisateur, le réseau (ici `bridge`, sans
  `mb-internal`) et le dossier monté. —
  [Docker CLI : docker container run](https://docs.docker.com/reference/cli/docker/container/run/)
- **Plusieurs fichiers Compose** : `docker compose --file A --file B` fusionne
  B dans A. Le runner ajoute ainsi le service `candidate` à
  `docker-compose.yml` sans modifier ce fichier. —
  [Compose : Merge Compose files](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/)
- **Clés d'un service Compose** utilisées par la composition complémentaire :
  `user`, `working_dir`, `command`, `volumes`, `tmpfs`, `ports`,
  `networks`, `pull_policy: never` (l'image est construite par le banc,
  jamais tirée d'un registre). —
  [Compose file reference : Services](https://docs.docker.com/reference/compose-file/services/)
- **JSON est du YAML** : YAML 1.2 est un sur-ensemble de JSON. Docker
  Compose lit donc une composition écrite en JSON, sans bibliothèque YAML. —
  [YAML 1.2.2](https://yaml.org/spec/1.2.2/) (spécification, chapitre 1)
- **Image épinglée par empreinte** : `FROM image:tag@sha256:…` fige l'image de
  base même si le tag est republié. —
  [Dockerfile reference : FROM](https://docs.docker.com/reference/dockerfile/)
- **`npm ci`** : installe exactement ce que dit `package-lock.json`, et
  échoue si le lock ne correspond pas à `package.json`. —
  [npm Docs : npm ci](https://docs.npmjs.com/cli/v10/commands/npm-ci)
- **Configuration de npm par variable d'environnement** : une variable
  `npm_config_<clé>` règle la clé de configuration du même nom. Le runner
  impose ainsi `npm_config_registry`. —
  [npm Docs : config, section « Environment Variables »](https://docs.npmjs.com/cli/v10/using-npm/config)
- **`message.rawHeaders` de Node** : les en-têtes reçus tels quels, noms et
  casse d'origine, dans une liste plate `[nom, valeur, …]`. `http.request` et
  `response.writeHead` acceptent ce même format. C'est ce qui permet au
  relais de ne rien modifier. —
  [Node.js 22 : HTTP](https://nodejs.org/docs/latest-v22.x/api/http.html)
- **`util.parseArgs` et `util.parseEnv`** : lecture des options de la ligne
  de commande et du fichier `.env`, sans dépendance. —
  [Node.js 22 : Util](https://nodejs.org/docs/latest-v22.x/api/util.html)

## Ce qui a été construit

- `fixtures/runtime-image/Dockerfile` : l'**image d'exécution du banc**.
  Elle part de `node:22.23.5-alpine`, épinglée par empreinte, avec
  `USER node` par défaut. `migrabench measure` la construit sous le nom
  `migrabench-runtime`.
- `fixtures/reference-candidate/` : le **candidat de référence**.
  - `server.js` : un relais de `PORT` vers `legacy:8080`, en Node sans
    dépendance. Il transmet en-têtes (`Host` compris) et corps tels quels.
  - `candidate.json` (`contract: 1`, `start: "node server.js"`, sans
    `build`), `package.json` et `package-lock.json`.
- `runner/`, le **runner de mesure** :
  - `measure.ts` : `measureCandidate`, le seul point d'entrée. Il enchaîne
    les sept phases : préparation, contrat, construction, démarrage, oracle,
    portes (vide), clôture ;
  - `cli.ts` : `migrabench measure`, commande mince sur `measureCandidate`,
    lancée par `npm run migrabench -- measure --candidate <dossier>` ;
  - fonctions pures, testées dans `tests/runner/` :
    - `measure-id.ts` : l'identifiant `<horodatage>-<commit court>-<nom>` ;
    - `candidate-content.ts` : ce que la copie emporte, et l'empreinte du
      contenu (`contentDigest`) ;
    - `candidate-compose.ts` : la composition complémentaire du service
      `candidate` ;
    - `container-user.ts` : l'utilisateur des conteneurs du candidat ;
    - `measure-record.ts` : l'assemblage de `measure.json` ;
  - `paths.ts` : `results/diagnostic/`, le dossier des mesures de
    diagnostic, ignoré par Git (`.gitignore`).
- `shared/`, partagé par l'oracle et le runner :
  - `root.ts` : racine du dépôt, dossier `.oracle-artifacts`, lecture de
    `.env` ;
  - `digest.ts` : le seul calcul d'empreinte SHA-256 du banc ;
  - `process.ts` : le lanceur de commandes (Git, Docker, Playwright).
- `oracle/execute.ts` : `executeOracle` gagne trois options.
  - Le rappel `onStackReady` : il est appelé une fois le legacy et le
    service d'archivage recréés et sains, avant Playwright.
  - `artifactsDir` et `resultFile` : ils placent les bruts dans
    `.oracle-artifacts/<identifiant de la mesure>/oracle` et le résultat
    dans le dossier de la mesure.

  Sans ces options, `npm run oracle` fait la même chose qu'avant.
- `docs/adr/0007-execution-du-candidat.md` : un paragraphe explique sous
  quel utilisateur tourne le candidat, et pourquoi.

Une mesure produit :

- `results/diagnostic/<identifiant>/measure.json` et `oracle.json` ;
- dans `.oracle-artifacts/<identifiant>/` :
  - la copie du candidat ;
  - `npm-ci.log` et `start.log` ;
  - la composition générée `compose.candidate.yml` ;
  - les bruts de l'oracle.

## Les choix faits et pourquoi

- **TDD sur les fonctions pures, aux seams de la spec.** Le seam 2 de la spec
  (« Décisions de test ») couvre les fonctions pures, écrites test rouge
  d'abord : identifiant, contenu, composition, utilisateur, `measure.json`.
  Le seam 1, `migrabench measure` sur la vraie pile, a été vérifié à la main.
  Son passage en CI appartient à #74.
- **Le candidat tourne sous l'uid et le gid de l'utilisateur du runner, pas
  sous `node` (1000).** C'est une décision humaine prise à la relecture. La
  première version faisait déjà ce choix, sans l'enregistrer ni l'écrire dans
  l'ADR. Raison : sous Linux, la copie du candidat appartient à l'utilisateur
  du runner. Sous l'uid 1000, `npm ci` ne pourrait pas y écrire
  `node_modules` sans ouvrir la copie en écriture à tous, et l'hôte ne
  pourrait plus supprimer ce que le conteneur y crée. Sous macOS, Docker
  Desktop masque les propriétaires, donc l'uid n'y change rien. Le runner
  refuse une mesure lancée en root, pour que le candidat ne tourne jamais en
  root. L'uid et le gid sont enregistrés dans `environment.containerUser`,
  et l'ADR 0007 le dit.
- **Composition complémentaire écrite en JSON.** Compose la lit comme du
  YAML, donc aucune dépendance n'est ajoutée. Son empreinte est citée dans
  `environment.composeOverride`.
- **L'image d'exécution est construite à chaque mesure** (`docker build`,
  cache de Docker). Le service y renvoie par son nom, avec
  `pull_policy: never`. L'identifiant de l'image (`docker image inspect
  {{.Id}}`) est relevé dans `environment.runtimeImage`.
- **Port imposé `8100`**, une constante publiée sur `127.0.0.1` seulement.
  Il ne doit pas croiser `8080` (legacy) ni `8090` (service d'archivage).
- **Empreinte du contenu = empreinte de ce qui est copié.** Ni
  `node_modules` (à toute profondeur), ni `dist` et `build` à la racine :
  plus bas, un dossier `build` peut être du code source. Le format est celui
  de `sha256sum`, une ligne par fichier, trié par chemin. La valeur attendue
  du test a été calculée à part avec `shasum -a 256`, pour ne pas recopier le
  calcul du code. Un lien symbolique est refusé, car il pourrait faire copier
  un fichier hors du candidat.
- **Le candidat est disponible dès la première réponse HTTP**, quel que soit
  son statut (spec, « Règles des issues »). Le plafond de 60 s est
  provisoire : le délai sortira de l'étalonnage (#72).
- **Construction** : `npm ci` dans un conteneur de l'image d'exécution, sur
  le réseau `bridge`, sans `mb-internal` ni variable du banc. Le registre
  est imposé par `npm_config_registry` et `HOME=/tmp`, parce que l'uid de
  l'hôte n'a pas de dossier personnel dans l'image.
- **Ce qui n'est pas pris en charge échoue franchement**, au lieu de mesurer
  à moitié :
  - une commande `build` déclarée (#65) ;
  - `--counted` (#73) ;
  - une issue `oracle-error` ou toute issue que le verdict ne sait pas
    encore ranger (#63, #68).

  Dans ces cas, la commande plante (code `1`) sans écrire `measure.json`.
- **`executeOracle` rend aussi ses métadonnées.** `measure.json` reprend
  ainsi l'environnement de l'étape 2 (`chromium`, `playwright`, `images`,
  `frozenDate`, `baseUrl`, `artifacts`) sans le relever une seconde fois.
- **Un module partagé `shared/`**, demandé par l'humain après la relecture.
  `oracle/execute.ts` et le runner avaient chacun leur racine du dépôt, leur
  empreinte SHA-256, leur lanceur de commandes et leur lecture de `.env`. Il
  n'en reste qu'un de chaque. Deux appels synchrones restent hors du module :
  `oracle/repository.ts` et `scripts/stack-up.ts`, hors du périmètre demandé.
  Ce refactoring et l'utilisateur des conteneurs touchent tous deux
  `runner/measure.ts`. Ils forment donc un seul commit (`860b99b`), pour que
  chaque commit passe le typecheck.
- **Relecture en deux axes**, standards et spec. Corrigé dans `ec09182` :
  - le lanceur de commandes ne s'appelle plus `run`, mot que le glossaire
    réserve ;
  - le type de l'issue s'appelle `MeasureOutcome`, comme dans la spec ;
  - le commentaire d'en-tête du relais est recoupé.

  Laissé, et dit dans la PR :
  - les issues de phase en chaînes libres. Un commentaire sur #63 demande
    d'en faire d'abord un type fermé, sur lequel le verdict s'appuiera ;
  - `environment` incomplet quand l'oracle n'a pas tourné ;
  - aucun test automatique du rappel `onStackReady`, que seule la mesure
    réelle exerce.

## Difficultés rencontrées

- **Une propriété de paramètre refusée par le typecheck.**
  - Symptôme : `runner/measure.ts(175,15): error TS1294: This syntax is not
    allowed when 'erasableSyntaxOnly' is enabled.`
  - Cause : `constructor(readonly outcome: string)` génère du code. Or le
    dépôt exige une syntaxe effaçable, parce que Node exécute le TypeScript
    en retirant seulement les types.
  - Résolution : un constructeur ordinaire, sans propriété de paramètre.
- **Une commande Docker rangée dans une variable du shell ne se lançait pas.**
  - Symptôme : pendant la vérification à la main, `$C exec candidate …`
    rendait `no such file or directory: docker compose --file …`.
  - Cause : zsh ne découpe pas une variable en mots. Toute la chaîne était
    prise comme un seul nom de commande.
  - Résolution : une fonction du shell, `c() { docker compose … "$@"; }`.
- **Cinq empreintes là où le script de refactoring en attendait quatre.**
  - Symptôme : le script de réécriture de `runner/measure.ts` s'arrêtait sur
    son contrôle : `('await sha256(', 5)`.
  - Cause : quatre appels citaient un brut (`sha256:<hex>`). Le cinquième
    hachait un fichier du candidat et retirait ensuite le préfixe.
  - Résolution : ce cinquième appel prend directement `fileSha256` du module
    partagé, qui rend l'hexadécimal. Le préfixe n'est plus ajouté puis
    retiré.
- **Commentaire sur #63 publié avec des `\"`.**
  - Cause : le corps du commentaire était passé par un heredoc entre
    apostrophes, qui laisse les barres obliques telles quelles.
  - Résolution : corps relu par `gh api`, corrigé, puis renvoyé par
    `PATCH`.

## Vérifier soi-même

Sorties observées au commit `860b99b`, arbre propre, avec Node 22.23.5,
Docker Engine 29.1.3 et Compose 2.40.3-desktop.1, sous macOS (uid 501, gid
20).

Une mesure de diagnostic du candidat de référence :

```sh
npm run migrabench -- measure --candidate fixtures/reference-candidate; echo "exit=$?"
# …
#   38 passed (…)
# Measure: results/diagnostic/20261123T150250Z-860b99b-reference-candidate
# Outcome: completed (ok)
# The stack now runs with this measure's salt: run `npm run stack:up` before `npm test`.
# exit=0
```

Ce qu'elle a enregistré (adapter le nom du dossier) :

```sh
D=results/diagnostic/20261123T150250Z-860b99b-reference-candidate
node -e 'const m=require("./'$D'/measure.json"); const e=m.environment;
console.log(e.worktree, m.saltImposed, JSON.stringify(e.containerUser), e.port, JSON.stringify(m.verdict), JSON.stringify(m.oracle.summary));
for (const p of m.phases) console.log(p.name, p.outcome, p.durationMs, JSON.stringify(p.raw))'
# clean false {"uid":501,"gid":20} 8100 {"category":"completed","reason":"ok"} {"scenarios":38,"passed":38,"failed":0,"unreached":0,"passRate":1,"reachedPassRate":1,"keyboard":{"passed":5,"total":5}}
# preparation ok 464 {}
# contract ok 0 {}
# build ok 418 {"npm-ci.log":"sha256:0413652b…"}
# start ok 5168 {"start.log":"sha256:a79c5a34…"}
# oracle ok 5165 {}
# gates ok 0 {}
# closing ok 1519 {}
```

`environment.runtimeImage` y vaut `sha256:c08e43f0…` et
`environment.composeOverride` `sha256:bc027431…`.

La mesure ne modifie pas le dépôt :

```sh
git status --short
# (aucune sortie)
```

Le candidat tourne sous l'utilisateur du runner, sa copie en lecture seule,
`/tmp` en écriture. Pour le vérifier, relancer le service avec la
composition générée par la mesure :

```sh
O=.oracle-artifacts/20261123T150250Z-860b99b-reference-candidate/compose.candidate.yml
c() { docker compose --file docker-compose.yml --file "$O" "$@"; }
c up -d --no-deps candidate
c exec candidate sh -c 'id; touch /candidate/x 2>&1; touch /tmp/y && echo tmp-writable'
# uid=501 gid=20(dialout) groups=20(dialout)
# touch: /candidate/x: Read-only file system
# tmp-writable
c rm --stop --force candidate
```

`npm run oracle`, sans rappel, se comporte comme avant :

```sh
npm run oracle
# Result: results/oracle/20261123T150327Z-860b99b.json
# Scenarios: 38, passed: 38, failed: 0, unreached: 0
```

Ce résultat local a ensuite été supprimé : il n'avait pas à être versionné.

Les tests, après `npm run stack:up` :

```sh
npx vitest run tests/runner
#  Test Files  6 passed (6)
#       Tests  28 passed (28)
npm test
#  Test Files  43 passed (43)
#       Tests  287 passed (287)
npm run typecheck   # aucune erreur
```

En CI, la PR rejoue les tests du banc et l'oracle contre le legacy ; aucun
job ne lance encore `migrabench measure` (#74).

CI de la PR #75, sur le head SHA `d14909c` : tous les jobs verts.

- « Tests du banc » ([job](https://github.com/karAmmi12/migrabench/actions/runs/45201392587/job/137785524349), 2 min 12 s) :
  `Test Files  43 passed (43)`, `Tests  287 passed (287)`.
- « Oracle », job `oracle` ([job](https://github.com/karAmmi12/migrabench/actions/runs/45201392534/job/137785523459), 2 min 29 s) :
  `Scenarios: 38, passed: 38, failed: 0, unreached: 0`.
- « Oracle », job `proof` ([job](https://github.com/karAmmi12/migrabench/actions/runs/45201392534/job/137787211727), 5 min 56 s) :
  cinq exécutions complètes à `Scenarios: 38, passed: 38, failed: 0, unreached: 0`, puis `Proof holds on 5 results.`
  L'exécution « Oracle » (les deux jobs) a duré de 15:06:05Z à 15:14:39Z.
- « Typecheck » ([job](https://github.com/karAmmi12/migrabench/actions/runs/45201393585/job/137785527618), 19 s) : vert.
- « Fiche de formation » ([job](https://github.com/karAmmi12/migrabench/actions/runs/45201392550/job/137785523595), 18 s) :
  `Fiche trouvée pour #62.` et `Chaque case cochée chiffrée cite un état.`

## Pour aller plus loin

- **#63, verdict et codes de sortie** : un type fermé des issues de phase
  d'abord (commentaire sur #63), puis la seule définition de « invalide » et
  les codes `0`, `3`, `4`.
- **#64 à #67** : le contrat validé par un schéma publié, la phase de
  construction avec `build`, délais et registre, l'isolation du candidat
  avec sa sonde, et le journal d'accès du legacy avec ses requêtes témoins.
- **ADR 0007** : le paragraphe sur l'utilisateur des conteneurs, et la limite
  connue du réseau `default`, qui laisse le candidat joindre le port `8080`.
- **#74, critère de fin** : le candidat de référence à 100 % dans une mesure
  comptée, lancée en CI depuis `main`.
