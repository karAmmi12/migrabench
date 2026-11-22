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
  command itself, so a line there can use anything Bash evaluates, such as
  the `$PATH` reference in `export PATH="$PATH:./node_modules/.bin"`. » Un
  réglage d'environnement écrit là s'applique donc à toutes les commandes Bash
  de la session, et son contenu est rejoué à **chaque** commande : son coût
  aussi. —
  [Claude Code : Hooks reference, « Persist environment variables »](https://code.claude.com/docs/en/hooks#persist-environment-variables)
- **`systemMessage`** : un hook peut écrire sur sa sortie standard un objet
  JSON. Son champ `systemMessage` est décrit ainsi : « Warning message shown
  to the user ». C'est le canal de l'avertissement du hook. —
  [Claude Code : Hooks reference, « JSON output »](https://code.claude.com/docs/en/hooks#json-output)
- **`nvm` et `.nvmrc`** : `nvm` installe plusieurs versions de Node et passe
  de l'une à l'autre dans le shell courant (`nvm use <version>`). `.nvmrc`
  fixe la version du dépôt : `22.23.5`. `nvm` est une fonction shell, pas un
  exécutable : il faut charger `nvm.sh` dans chaque shell avant de l'appeler,
  et ce chargement coûte cher (environ 218 ms mesurés ici). Chaque version
  installée vit dans `$NVM_DIR/versions/node/v<version>/bin` : mettre ce
  dossier en tête du `PATH` suffit à la rendre active, sans charger `nvm`. —
  [nvm : README, section .nvmrc](https://github.com/nvm-sh/nvm#nvmrc)
- **Résolution des paquets par Node** : un `import "@playwright/test"`
  cherche le paquet dans `node_modules`, en remontant les dossiers parents à
  partir du fichier qui importe. Un script placé dans un dossier temporaire
  ne voit pas le `node_modules` du dépôt, d'où `ERR_MODULE_NOT_FOUND` dans
  #38. La spécification le dit pas à pas : « While parentURL is not the file
  system root, … Set parentURL to the parent folder URL of parentURL. » —
  [Node.js 22 : ESM, algorithme de résolution](https://nodejs.org/docs/latest-v22.x/api/esm.html#resolution-algorithm)
- **Couture (seam) testable** : `oracle/cli.ts` lance Docker et Playwright dès
  son import. On ne peut donc pas le tester sans la pile. Les lignes de fin
  sortent dans une fonction pure, `closingLines`, testable seule ; `cli.ts`
  ne fait plus que les afficher.

## Ce qui a été construit

- **`.claude/settings.json`** (versionné) : déclare le hook `SessionStart`,
  qui lance `.claude/hooks/use-nvmrc-node.sh`.
- **`.claude/hooks/use-nvmrc-node.sh`** : lit la version dans `.nvmrc`, puis
  vérifie que `$NVM_DIR/versions/node/v22.23.5/bin` existe (`NVM_DIR` vaut
  `~/.nvm` par défaut). S'il existe, il écrit une seule ligne dans
  `$CLAUDE_ENV_FILE` : `export PATH="<ce dossier>:$PATH"`. Sinon, il n'écrit
  rien et affiche un avertissement par `systemMessage` : « Node 22.23.5
  (.nvmrc) is not installed in <dossier>: Bash commands keep the shell's Node.
  Run nvm install 22.23.5. » Hors de Claude Code ou sans `.nvmrc`, il ne fait
  rien. Il sort toujours en 0.
- **`tests/session-node-hook.test.ts`** : deux tests du script, avec un dépôt
  et un `NVM_DIR` temporaires. Version installée : la ligne `PATH` exacte, et
  rien sur la sortie. Version absente : aucun fichier écrit, et un
  `systemMessage` qui cite la version et `nvm install 22.23.5`.
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
  l'exécution de l'oracle au commit `3701e18`, le dernier qui touche au code
  de l'oracle. Les commits suivants ne changent que le hook, son test et la
  fiche.

## Les choix faits et pourquoi

- **Un ajout direct au `PATH`, plutôt que le chargement de `nvm`.** La
  première version suivait l'issue à la lettre : charger `nvm.sh` puis
  `nvm use`. Mesurée, elle coûtait environ 218 ms par commande Bash (médiane
  231 ms avec, 13 ms sans). Pour une session de plusieurs centaines de
  commandes, l'humain a jugé ce coût trop élevé et demandé l'ajout direct au
  `PATH`. Mesuré à son tour : médiane 14 ms avec, 13 ms sans (`8a945e8`).
- **Le chemin écrit en clair, et la version lue à l'ouverture.** L'option
  écartée est `export PATH="$NVM_DIR/versions/…"` avec `$NVM_DIR` développé à
  chaque commande : si `NVM_DIR` n'est pas défini dans le shell de la
  commande, le chemin devient faux. Le hook développe donc le chemin à
  l'ouverture de session ; seul `$PATH` reste développé à chaque commande.
  `.nvmrc` est lu au même moment, et non dans le dossier courant de la
  commande, qui peut être hors du dépôt.
- **Un avertissement, et non plus un échec silencieux.** Avec `nvm`, un
  `nvm use` raté ne disait rien. Désormais, une version absente produit un
  `systemMessage`. Les gardes `pretest` et `preoracle` restent la protection
  de `npm test` et de `npm run oracle`.
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
- **Le chargement de `nvm` coûtait 218 ms par commande.**
  - Symptôme : mesuré à la demande de l'humain, médiane 231 ms par
    `node --version` avec le fichier du hook, 13 ms sans.
  - Cause : la documentation des hooks le dit, le fichier est rejoué avant
    chaque commande, et charger `nvm.sh` est lent.
  - Résolution : un ajout direct au `PATH` (`8a945e8`), médiane 14 ms.
- **L'avertissement n'apparaît pas tel quel en mode `-p`.**
  - Symptôme : avec un `NVM_DIR` absent, `claude -p` rend `v24.12.0` sans
    afficher le message. Il n'est visible qu'avec
    `--output-format stream-json --verbose`, dans un événement
    `"subtype":"hook_response"`, `"hook_event":"SessionStart"`, champ `output`.
  - Résolution : Karim Ammi a vérifié le rendu en session interactive, avec
    `NVM_DIR=/tmp/nvm-vide`, sur la branche à `4c3d157`. Au démarrage, Claude
    Code affiche : « SessionStart:startup says: Node 22.23.5 (.nvmrc) is not
    installed in /tmp/nvm-vide/versions/node/v22.23.5/bin: Bash commands keep
    the shell's Node. Run nvm install 22.23.5. » Dans cette session,
    `node -v` rend `v22.23.5`. Ce n'est pas l'effet du hook, qui n'a rien
    écrit : c'est le Node du shell de lancement. Le profil de ce shell met
    déjà le Node 22.23.5 de `nvm` en tête du `PATH` : au début de la session
    du ticket, avant que le hook existe, `which node` rendait
    `~/.nvm/versions/node/v22.23.5/bin/node`. L'avertissement dit donc vrai :
    les commandes gardent le Node du shell, qui se trouve être le bon.

## Vérifier soi-même

Sorties du hook observées au commit `8a945e8`, celles de l'oracle au commit
`3701e18`. Claude Code 2.1.330, Node v22.23.5, nvm 0.40.3, zsh 5.9,
Apple M4 Pro.

Le hook dans une vraie session, lancée depuis un shell sous un autre Node :

```sh
export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"   # shell sous Node 24
P="Run exactly the shell command: node --version. Reply with only its raw output."
claude -p "$P" --setting-sources user --allowedTools "Bash(node --version)"   # témoin, sans hook
# v24.12.0
claude -p "$P" --allowedTools "Bash(node --version)"                          # avec le hook
# v22.23.5
A=$(mktemp -d)/absent    # NVM_DIR sans Node 22.23.5
NVM_DIR=$A claude -p "$P" --allowedTools "Bash(node --version)" --output-format stream-json --verbose > absent.jsonl; echo "exit=$?"
# exit=0
grep -o '"result":"[^"]*"' absent.jsonl
# "result":"v24.12.0"
grep -o '"subtype":"hook_response"[^}]*' absent.jsonl | head -1
# "subtype":"hook_response",…,"hook_event":"SessionStart","output":"{\"systemMessage\": \"Node 22.23.5 (.nvmrc) is not installed in …/absent/versions/node/v22.23.5/bin: Bash commands keep the shell's Node. Run nvm install 22.23.5.\"}\n",…
```

En session interactive (vérifié par Karim Ammi, branche à `4c3d157`) :

```sh
NVM_DIR=/tmp/nvm-vide claude
# au démarrage :
# SessionStart:startup says: Node 22.23.5 (.nvmrc) is not installed in /tmp/nvm-vide/versions/node/v22.23.5/bin: Bash commands keep the shell's Node. Run nvm install 22.23.5.
# puis, lancé par l'agent : node -v
# v22.23.5      (le Node du shell de lancement, pas celui du hook)
```

Le script du hook seul, et ses tests :

```sh
d=$(mktemp -d); CLAUDE_ENV_FILE=$d/env CLAUDE_PROJECT_DIR=$PWD sh .claude/hooks/use-nvmrc-node.sh; echo "exit=$?"; cat $d/env
# exit=0
# export PATH="/Users/<vous>/.nvm/versions/node/v22.23.5/bin:$PATH"
npx vitest run tests/session-node-hook.test.ts
#      Tests  2 passed (2)
```

Avant le script, les deux tests étaient rouges : `Tests  2 failed (2)`.

Le coût du hook sur une commande (20 commandes `node --version`, avec le
fichier `$d/env` écrit ci-dessus) :

```sh
P="$HOME/.nvm/versions/node/v24.12.0/bin:/usr/bin:/bin"
time (for i in {1..20}; do env PATH="$P" zsh -f -c 'node --version' >/dev/null; done)
# … 0,298 total
time (for i in {1..20}; do env PATH="$P" zsh -f -c ". '$d/env'; node --version" >/dev/null; done)
# … 0,303 total
```

Une mesure plus fine, faite pendant la session avec un script Node hors du
dépôt (30 alternances de `zsh -f -c`, médiane), dans la même session pour
les deux versions du hook :

| Fichier d'environnement | Sans hook | Avec hook | Écart des médianes |
| --- | --- | --- | --- |
| Chargement de `nvm` (`c4721db`) | 13 ms | 231 ms | 218 ms |
| Ajout direct au `PATH` (`8a945e8`) | 13 ms | 14 ms | moins de 1 ms |

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
npm run stack:up && npm test      # au commit 8a945e8
# Test Files  31 passed (31)
#      Tests  195 passed (195)
```

Le test a d'abord échoué, avant que `oracle/closing-lines.ts` existe :
`Test Files  1 failed (1)`, `Tests  no tests` : le module n'existait pas encore.

La CI de la PR, sur le commit `4c3d157` :

- « Tests du banc »
  [45068412244](https://github.com/karAmmi12/migrabench/actions/runs/45068412244),
  en 2 min 22 s :

  ```text
  Test Files  31 passed (31)
       Tests  195 passed (195)
  ```

- « Oracle »
  [45068412266](https://github.com/karAmmi12/migrabench/actions/runs/45068412266),
  en 6 min 51 s : le job `oracle` (une exécution complète) puis le job
  `proof` (cinq exécutions). Chaque exécution se termine par le rappel :

  ```text
  Result: results/oracle/20261122T204847Z-4c3d157-ci45068412266.1-1.json
  Scenarios: 38, passed: 38, failed: 0, unreached: 0
  The stack now runs with this oracle execution's salt: run `npm run stack:up` before `npm test`.
  …
  Proof holds on 5 results.
  ```

## Pour aller plus loin

- Le hook ne connaît que `nvm`. Un Node installé autrement (Volta, fnm,
  paquet système) ne sera pas trouvé : l'avertissement s'affiche, et les
  gardes `pretest` et `preoracle` prennent le relais.
- `closingLines` n'est pas appelée si `executeOracle` lève une erreur. Le
  rappel n'apparaît alors pas, alors que la pile a peut-être déjà été recréée
  avec le sel de l'exécution.
- Fiche liée : [`46-sel-perime-apres-oracle.md`](46-sel-perime-apres-oracle.md),
  la décision de ne pas remettre la pile en place depuis l'oracle.
