# #52 · Environnement de l'agent : Node de .nvmrc à l'ouverture de session, commentaires lus par /fiche-ticket, rappel du sel après l'oracle, dossier des sondes

## Objectif

La rétro de l'étape 2 (tickets #32 à #39 et #46) relève quatre difficultés qui
reviennent d'un ticket à l'autre, chacune réglée par un petit changement
d'environnement. Le shell de l'agent ne tourne pas sous le Node de `.nvmrc`.
`/fiche-ticket` ignore les commentaires de l'issue. Après `npm run oracle`, la
pile garde le sel de l'exécution de l'oracle. Enfin, une sonde Playwright
écrite hors du dépôt ne trouve pas `@playwright/test`. Le ticket traite les
quatre, sans toucher au legacy ni à la mesure.

## Notions à connaître

- **Hook `SessionStart` et `$CLAUDE_ENV_FILE`** : Claude Code lance une
  commande à l'ouverture de chaque session. Cette commande peut écrire du code
  shell dans le fichier désigné par `$CLAUDE_ENV_FILE`. La documentation dit :
  « Each Bash command runs the file's contents as shell code before the
  command itself ». Un réglage d'environnement écrit là s'applique donc à
  toutes les commandes Bash de la session. —
  [Claude Code : Hooks reference, « Persist environment variables »](https://code.claude.com/docs/en/hooks)
  > À vérifier : la citation vient d'un résumé de la page, pas de son texte lu mot à mot.
- **`nvm` et `.nvmrc`** : `nvm` installe plusieurs versions de Node et passe
  de l'une à l'autre dans le shell courant (`nvm use <version>`). `.nvmrc`
  fixe la version du dépôt : `22.23.5`. `nvm` est une fonction shell, pas un
  exécutable. Il faut donc charger `nvm.sh` dans chaque shell avant de
  l'appeler. — [nvm : README, section .nvmrc](https://github.com/nvm-sh/nvm#nvmrc)
  > À vérifier : l'ancre `#nvmrc` n'a pas été ouverte.
- **Résolution des paquets par Node** : un `import "@playwright/test"`
  cherche le paquet dans `node_modules`, en remontant les dossiers parents à
  partir du fichier qui importe. Un script placé dans un dossier temporaire
  ne voit pas le `node_modules` du dépôt, d'où `ERR_MODULE_NOT_FOUND` dans
  #38. — [Node.js 22 : ESM, algorithme de résolution](https://nodejs.org/docs/latest-v22.x/api/esm.html#resolution-algorithm)
  > À vérifier : l'ancre `#resolution-algorithm` n'a pas été ouverte.
- **Couture (seam) testable** : `oracle/cli.ts` lance Docker et Playwright dès
  son import. On ne peut donc pas le tester sans la pile. Les lignes de fin
  sortent dans une fonction pure, `closingLines`, testable seule ; `cli.ts`
  ne fait plus que les afficher.

## Ce qui a été construit

- **`.claude/settings.json`** (versionné) : déclare le hook `SessionStart`,
  qui lance `.claude/hooks/use-nvmrc-node.sh`.
- **`.claude/hooks/use-nvmrc-node.sh`** : lit la version dans `.nvmrc` et
  écrit dans `$CLAUDE_ENV_FILE` trois lignes : `export NVM_DIR`,
  `. "$NVM_DIR/nvm.sh" --no-use`, puis `nvm use --silent "22.23.5"`. Il sort
  en 0 sans rien écrire hors de Claude Code, sans `.nvmrc`, ou sans `nvm`.
- **`.claude/skills/fiche-ticket/SKILL.md`** : à l'étape 1, la commande devient
  `gh issue view <N> --json number,title,body,comments`, et une phrase précise
  qu'un commentaire qui modifie la spec l'emporte sur le corps de l'issue.
- **`oracle/closing-lines.ts`** : `closingLines({ resultFile, summary,
  saltImposed })` rend les lignes de fin de `npm run oracle`. La dernière est
  toujours : « The stack now runs with this oracle execution's salt: run
  `npm run stack:up` before `npm test`. » Le sel n'est pas un paramètre : la
  fonction ne peut pas le citer.
- **`oracle/cli.ts`** : affiche une ligne vide, puis les lignes de
  `closingLines`.
- **`tests/oracle/closing-lines.test.ts`** : trois tests. Le rappel est la
  dernière ligne. Il reste la dernière sur une exécution de diagnostic, sans
  valeur hexadécimale. Le fichier de résultat et le résumé viennent avant lui.
- **`.gitignore`** gagne `.probes/`, et **`CLAUDE.md`** gagne une ligne :
  « Une sonde Playwright jetable s'écrit dans `.probes/` (ignoré par Git),
  jamais hors du dépôt. »
- **`results/oracle/20261122T203840Z-3701e18.json`** : le résultat de
  l'exécution de l'oracle sur l'état final du code (`3701e18`).

## Les choix faits et pourquoi

- **La version passée à `nvm use` explicitement.** L'option écartée est un
  `nvm use` sans argument, qui lit `.nvmrc` dans le dossier courant. Or une
  commande Bash peut tourner ailleurs que dans le dépôt. Le hook lit donc
  `.nvmrc` à l'ouverture de session et écrit la version en clair.
- **Charger `nvm`, comme le demande l'issue, plutôt que préfixer le `PATH`.**
  Préfixer le `PATH` par le dossier de Node 22.23.5 serait plus rapide, mais
  l'issue demande « le chargement de `nvm` et `nvm use` ». Le coût a été
  mesuré : environ 218 ms par commande (voir « Vérifier soi-même »). L'humain
  l'a accepté.
- **Échec silencieux de `nvm use` accepté.** Si la version de `.nvmrc` n'est
  pas installée, `nvm use` échoue sans bruit, et l'ancien Node reste actif.
  Les gardes `pretest` et `preoracle` arrêtent quand même `npm test` et
  `npm run oracle`. Relevé par la revue de code, accepté par l'humain.
- **Vérifier le hook dans une vraie session, avec une session témoin.**
  `claude -p` est lancé depuis un shell sous Node `v24.12.0` : une session
  sans les réglages du projet (`--setting-sources user`), puis une avec. Sans
  le témoin, un `v22.23.5` aurait pu venir du profil du shell, et non du hook.
- **Une fonction pure `closingLines`, plutôt qu'un test qui lance
  `npm run oracle`.** Lancer la commande demande Docker et Playwright. La
  fonction se teste en millisecondes, et `cli.ts` reste une commande mince.
  La revue de spec l'a relevé comme un petit hors-champ, justifié par
  « test rouge d'abord ».
- **« oracle execution » plutôt que « run » dans le rappel.** Dans
  `PROTOCOL.md`, un run est l'exécution complète d'un outil. Relevé par la
  revue de code (`3701e18`). La ligne existante « Salt imposed: diagnostic
  run, not a measurement. » reste telle quelle.
- **La ligne vide affichée par `cli.ts`, pas par `closingLines`.** C'est de la
  mise en page de console, pas une ligne du résultat. Relevé par la revue de
  code (`3701e18`).
- **« Sonde » reste hors de `GLOSSARY.md`.** C'est un mot d'outillage, pas du
  domaine du banc. Décision de l'humain, après la revue.
- **Un seul résultat d'oracle versionné, celui de l'état final.** Un premier
  résultat, sur `c4721db`, a été retiré de la branche. Décision de l'humain.

## Difficultés rencontrées

- **`claude -p` prenait la consigne pour une valeur de `--allowedTools`.**
  - Symptôme : `"Run exactly the shell command: node --v…" was read as a value
    of --allowedTools, not as a prompt`.
  - Cause : `--allowedTools` accepte plusieurs valeurs, et avale l'argument
    suivant.
  - Résolution : placer la consigne juste après `-p`, avant les options.
- **`npm test` en échec sur un sel périmé, en plein ticket.**
  - Symptôme : `5 failed | 188 passed`, avec « The stack does not run with the
    archive salt of npm test: rerun `npm run stack:up` … ». La pile tournait
    depuis 5 heures (`docker compose ps`) avec un autre sel que celui de
    `.dev-archive-salt`.
    > À vérifier : l'origine de ce sel, sans doute une exécution de l'oracle d'une session antérieure.
  - Cause : la difficulté n° 3 de l'issue elle-même.
  - Résolution : `npm run oracle` (qui affiche désormais le rappel), puis
    `npm run stack:up`, puis `npm test` : `193 passed`.
- **Le résultat d'oracle gardé citait un commit disparu.**
  - Symptôme : après le retrait du premier résultat par un `git rebase
    --onto`, le résultat restant citait `422f988`. Le rebase avait réécrit ce
    commit en `3701e18`.
  - Cause : un rebase change l'identifiant de chaque commit qu'il rejoue,
    même à contenu identique.
  - Résolution : ce résultat est retiré, et l'oracle relancé sur `3701e18`.
    Le nouveau résultat cite ce commit (`benchCommit`). Une preuve cite l'état
    exact (`CLAUDE.md`).

## Vérifier soi-même

Sorties observées au commit `3701e18` (code) et `c9f257e` (avec le résultat),
Claude Code 2.1.330, Node v22.23.5, nvm 0.40.3, zsh 5.9, Apple M4 Pro.

Le hook dans une vraie session, lancée depuis un shell sous un autre Node :

```sh
export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"   # shell sous Node 24
P="Run exactly the shell command: node --version. Reply with only its raw output."
claude -p "$P" --setting-sources user --allowedTools "Bash(node --version)"   # témoin, sans hook
# v24.12.0
claude -p "$P" --allowedTools "Bash(node --version)"                          # avec le hook
# v22.23.5
NVM_DIR=$(mktemp -d)/absent claude -p "$P" --allowedTools "Bash(node --version)"; echo "exit=$?"   # sans nvm
# v24.12.0
# exit=0
```

Le script du hook seul, avec et sans `nvm` :

```sh
d=$(mktemp -d); CLAUDE_ENV_FILE=$d/env CLAUDE_PROJECT_DIR=$PWD sh .claude/hooks/use-nvmrc-node.sh; echo "exit=$?"; cat $d/env
# exit=0
# export NVM_DIR="/Users/<vous>/.nvm"
# . "$NVM_DIR/nvm.sh" --no-use
# nvm use --silent "22.23.5" >/dev/null 2>&1 || true
e=$(mktemp -d); CLAUDE_ENV_FILE=$e/env CLAUDE_PROJECT_DIR=$PWD NVM_DIR=$e/absent sh .claude/hooks/use-nvmrc-node.sh; echo "exit=$?"; ls $e | wc -l
# exit=0
#        0
```

Le coût du hook sur une commande (20 commandes `node --version`, avec le
fichier `$d/env` écrit ci-dessus) :

```sh
P="$HOME/.nvm/versions/node/v24.12.0/bin:/usr/bin:/bin"
time (for i in {1..20}; do env PATH="$P" zsh -f -c 'node --version' >/dev/null; done)
# … 0,331 total          (≈ 17 ms par commande)
time (for i in {1..20}; do env PATH="$P" zsh -f -c ". '$d/env'; node --version" >/dev/null; done)
# … 4,741 total          (≈ 237 ms par commande)
```

Une mesure plus fine, faite pendant la session avec un script Node hors du
dépôt (30 alternances, médiane) : 13 ms sans hook, 230 ms avec, soit un
écart de 218 ms par commande.

La sonde dans `.probes/` :

```sh
mkdir -p .probes && printf 'import { chromium } from "@playwright/test";\nconsole.log(typeof chromium.launch);\n' > .probes/resolve.ts
node .probes/resolve.ts
# function
git check-ignore -v .probes/resolve.ts
# .gitignore:21:.probes/	.probes/resolve.ts
rm -rf .probes
```

Le rappel de l'oracle, puis les tests du banc :

```sh
npx vitest run tests/oracle/closing-lines.test.ts
#      Tests  3 passed (3)
npm run oracle
# Result: results/oracle/20261122T203840Z-3701e18.json
# Scenarios: 38, passed: 38, failed: 0, unreached: 0
# The stack now runs with this oracle execution's salt: run `npm run stack:up` before `npm test`.
npm run stack:up && npm test
# Test Files  30 passed (30)
#      Tests  193 passed (193)
```

Le test a d'abord échoué, avant que `oracle/closing-lines.ts` existe :
`Test Files  1 failed (1)`, `Tests  no tests` : le module n'existait pas encore.

> À vérifier après l'exécution de la CI de la PR : le lien des exécutions
> « Tests du banc » et « Oracle », leur head SHA, leur durée et leur sortie.

## Pour aller plus loin

- Le coût de 218 ms par commande vient du chargement de `nvm.sh`. Si ce coût
  gêne, il existe une option plus rapide : écrire dans `$CLAUDE_ENV_FILE` un
  `PATH` préfixé par le dossier de la version installée, sans charger `nvm`.
- `closingLines` n'est pas appelée si `executeOracle` lève une erreur. Le
  rappel n'apparaît alors pas, alors que la pile a peut-être déjà été recréée
  avec le sel de l'exécution.
- Fiche liée : [`46-sel-perime-apres-oracle.md`](46-sel-perime-apres-oracle.md),
  la décision de ne pas remettre la pile en place depuis l'oracle.
