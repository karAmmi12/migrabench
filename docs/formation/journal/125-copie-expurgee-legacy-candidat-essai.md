# #125 · Étape 4 · Copie expurgée du legacy et procédure du candidat d'essai

Niveau de rigueur : allégé (fiche courte : but, changements, preuves, limites).

## Objectif

Les portes de l'étape 4 doivent juger une vraie sortie d'agent, pas seulement
le candidat de référence, un relais JSP (ADR 0010). L'agent qui produit ce
candidat d'essai ne doit rien savoir du banc, car un agent qui se sait évalué
peut changer de comportement. Ce ticket fabrique donc ce que l'agent
reçoit : une copie du legacy expurgée par un script testé, un prompt rédigé
comme une commande de client, un brief technique, et la procédure écrite pour
lancer l'agent dans un environnement isolé.

## Notions à connaître

- **Syntaxe des commentaires Java.** Un commentaire `//` ou `/* */` ne
  commence jamais dans une chaîne ni dans un caractère littéral. Le script
  lit donc les littéraux pour ne pas prendre `"http://…"` pour un commentaire.
  Documentation (Java 8, version du legacy), section 3.7 « Comments » :
  <https://docs.oracle.com/javase/specs/jls/se8/html/jls-3.html#jls-3.7>.
- **Commentaires XML et JSP.** En XML, `<!-- … -->`, sans `--` à
  l'intérieur : <https://www.w3.org/TR/xml/#sec-comments>. Dans une JSP,
  `<%-- … --%>` ne part pas dans le HTML envoyé au navigateur :
  <https://jakarta.ee/specifications/pages/3.1/jakarta-server-pages-spec-3.1#comments>.
  C'est la version Jakarta de la spécification ; le legacy tourne sous
  Tomcat 9, en JSP 2.3, avec la même syntaxe de commentaire.
- **Commentaires d'un fichier `.properties`.** Une ligne dont le premier
  caractère non blanc est `#` ou `!` est un commentaire. Documentation de
  `Properties.load` (Java 8) :
  <https://docs.oracle.com/javase/8/docs/api/java/util/Properties.html#load-java.io.Reader->.
- **Isolement de Claude Code.** `CLAUDE_CONFIG_DIR` remplace le répertoire
  `~/.claude`, où vivent le `CLAUDE.md` global, les skills, les plugins et
  les réglages. `claude -p --output-format stream-json --verbose` écrit un
  événement `system/init`, qui liste le modèle, les outils, les serveurs MCP
  et les plugins chargés. Documentation :
  <https://code.claude.com/docs/en/env-vars> et
  <https://code.claude.com/docs/en/headless> (section « Read session
  metadata »).

Liens ouverts le 2026-11-26 : les six pages existent, sans redirection, et
chaque ancre mène à sa section.

## Ce qui a été construit

- `fixtures/legacy-app/` : seuls des commentaires changent. Ceux qui
  s'adressent au banc portent `[banc]`. Un commentaire qui mêlait
  documentation du code et note du banc est coupé en deux. `TRAPS.md`
  décrit la règle.
- `scripts/legacy-copy.ts` : la transformation, pure et déterministe. Elle
  exclut `TRAPS.md`, `Dockerfile` et `access-log/`, retire les commentaires
  marqués, filtre `dossiers.json` et renomme `fr.migrabench.legacy` en
  `fr.mairie.dossiers`.
- `scripts/trial-copy.ts` (`npm run trial:copy -- <répertoire>`) : écrit la
  copie et `brief.md` dans le répertoire de travail de l'agent, puis affiche
  le commit du banc et l'empreinte de la copie.
- `fixtures/trial-kit/prompt.md` et `brief.md` : la commande du client et le
  contrat technique (`candidate.json`, construction, variables, Node 22).
- `scripts/redact-log.ts` (`npm run trial:redact`) : expurge le journal de
  l'agent.
- `docs/candidat-essai.md` : la procédure, en quatre étapes.
- `tests/legacy-copy/` : les tests unitaires, le test à la source, le test
  témoin et le test « la copie compile et démarre », ce dernier dans son
  propre groupe Vitest (`vitest.config.ts`).

## Les choix faits et pourquoi

- **Noms des portes cherchés en mots entiers, sans `role` ni `auth`.**
  - Ces deux mots sont du vocabulaire Java EE que la copie doit garder :
    `<role-name>`, `isUserInRole`, `<auth-constraint>`.
  - Écarté : renommer ces mots dans la copie, qui ne serait plus un Tomcat
    valide.
  - Décision de Karim, posée par une question pendant la session.
- **`réservé` cherché en mot entier.**
  - Le texte de l'écran 3 « Remise réservée aux instructeurs » est vérifié
    par l'oracle et doit rester.
  - Écarté : une exception sur la phrase exacte.
  - Décision de Karim.
- **Toute mention de `migrabench` remplacée dans la copie, pas seulement le
  paquet.**
  - Le `groupId` du `pom.xml`, le `display-name` et le realm BASIC de
    `web.xml` la contenaient aussi, et le test témoin cherche `migrabench`.
  - Le realm de la copie devient `dossiers`. Le legacy du banc garde
    `migrabench` : le test `legacy-basic-auth` le vérifie.
- **Noms des scénarios lus dans un vrai `oracle.json`.**
  - Ils viennent de la dernière mesure comptée versionnée, et non du code de
    l'oracle.
  - La recherche en construit une partie dynamiquement (`searchScenario`) :
    une expression régulière sur `test("…")` n'en trouvait que 22 sur 38.
- **Commentaires reformulés pour éviter « porte » comme verbe.**
  - « qui porte ce numéro » devient « de ce numéro ».
  - Écarté : marquer `[banc]` ces commentaires, ce qui aurait retiré de la
    documentation utile à l'agent.
- **Image construite avec le `Dockerfile` du banc, inchangé.**
  - Un contexte temporaire place la copie sous `fixtures/legacy-app/`, avec
    `access-log/` et les fichiers des utilisateurs venus du banc.
  - Écarté : paramétrer le `Dockerfile` du legacy.
- **Le mode d'autorisation de l'agent n'est pas fixé par la procédure.**
  - C'est un choix de Karim au lancement, noté dans la provenance.
- **Garde-fous de `trial:copy`, non demandés par la spec.**
  - Le script refuse un arbre modifié et un répertoire non vide, et affiche
    `copyDigest`. La provenance cite ainsi un commit qui suffit à refaire la
    même copie.

## Difficultés rencontrées

- **Mots du banc présents dans du texte légitime.**
  - Symptôme : la liste de la spec rencontrait `réservé` dans l'écran 3,
    `role` et `auth` dans `web.xml`, et « porte » comme verbe dans deux
    Javadoc.
  - Cause : une liste de termes cherchés en sous-chaîne.
  - Résolution : deux questions à Karim (ci-dessus), des mots entiers, et une
    reformulation des commentaires.
- **Témoin du test de construction.**
  - Un renommage cassé exprès sur les chemins (`fr/migrabench/legacy`
    gardé) n'a fait échouer qu'un test sur quatre : « reads its messages
    from the renamed resource bundle ».
  - Cause : `javac` ne regarde pas le répertoire d'une source, mais Struts
    cherche le fichier de messages à son chemin.
  - Résolution : le script a été restauré. Le test de construction sait
    donc détecter ce défaut.
- **Douze tests en échec après un commit qui ne touchait que la
  documentation du legacy.**
  - Cause : `TRAPS.md` fait partie du contexte de construction du legacy, et
    la pile tournait encore avec les images d'avant (`stack-images` : « built
    from this copy »).
  - Résolution : `npm run stack:up`, puis suite verte.

## Vérifier soi-même

```sh
npx vitest run tests/legacy-copy/legacy-copy.test.ts tests/legacy-copy/legacy-copy-real.test.ts tests/legacy-copy/redact-log.test.ts
```

Observé sur `0663fef` : `Tests  178 passed (178)`.

```sh
npm run stack:up && npm test
```

Observé sur `0663fef`, arbre propre : `Test Files  86 passed (86)`,
`Tests  917 passed (917)`.

```sh
npx vitest run --project legacy-copy-build --silent=false
```

Observé en local, cache Docker chaud : `legacy copy: build 519 ms, start
1342 ms` et `Tests  4 passed (4)`.

```sh
npm run trial:copy -- /tmp/trial-copy-check
```

Observé sur `b1b3039` : `"files": 30`, et un `copyDigest`. Le répertoire
contient `brief.md` et `legacy-app/`. `npm run trial:copy -- ~/trial-x`
répond `must be outside the home directory`, avec le code 1.

> À vérifier après l'exécution de la CI de la PR : durée du test « la copie compile et démarre » en CI (cache froid), à signaler à Karim si elle dépasse 5 min ; oracle vert sur la PR.

## Pour aller plus loin

- **#126 (1b)** : Karim lance l'agent selon `docs/candidat-essai.md`, puis
  le candidat est versionné sous `fixtures/trial-candidates/`.
- **Limite connue** : la copie garde deux indices hors commentaires, que ce
  ticket ne pouvait pas toucher.
  - Le message d'exception « the bench must freeze the clock »
    (`DossierServiceListener`).
  - Le champ `reservations` de `DatasetLoader`.
  - Le témoin ne cherche pas l'anglais `bench`.
  - À trancher avant l'étape 6, qui réutilisera la copie telle quelle.
- **#124 (G0)** : quand le registre des portes existera, le test témoin
  pourra lire les noms des portes dans le registre plutôt que dans une liste.
- **ADR 0010** : le choix d'un candidat d'essai plutôt qu'un run anticipé.
