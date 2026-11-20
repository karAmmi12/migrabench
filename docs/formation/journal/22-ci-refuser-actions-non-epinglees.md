# #22 · CI : refuser les actions non épinglées par SHA

## Objectif

Depuis #10 (PR #21), `actions/checkout` est épinglé sur un SHA de commit
complet, avec sa version en commentaire. Cette règle n'était écrite nulle
part, et #20 va ajouter d'autres actions. Ce ticket la fait respecter par un
contrôle automatique lancé sur chaque PR, et écrit la procédure pour trouver
le SHA d'une étiquette.

## Notions à connaître

- **Épinglage d'une action par SHA** : une étiquette comme `@v7` peut être
  déplacée par les mainteneurs ; un SHA de commit complet désigne toujours le
  même code. GitHub recommande ce second épinglage. —
  [GitHub Docs : Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- **Étiquette légère et étiquette annotée** : la référence d'une étiquette
  légère pointe sur un commit ; celle d'une étiquette annotée pointe sur un
  objet *tag*, qu'il faut déréférencer pour obtenir le commit. La procédure
  le fait avec `gh api`. — [docs/agents/pinned-actions.md](../../agents/pinned-actions.md)
- **Commandes de workflow** : une ligne
  `::error file=<fichier>,line=<ligne>::<message>` écrite sur la sortie d'une
  étape devient une annotation d'erreur de l'exécution, attachée au fichier et à
  la ligne. —
  [GitHub Docs : Workflow commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)
- **Mappings de bloc et de flux en YAML** : une étape peut s'écrire
  `- uses: …` (bloc) ou `- { uses: … }` (flux), et une clé peut être entre
  guillemets. Le contrôle doit reconnaître ces formes. —
  [YAML 1.2.2 : Flow Mappings](https://yaml.org/spec/1.2.2/#flow-mappings)
- **`grep -E`** : recherche par expression régulière étendue. Le contrôle
  l'utilise ligne par ligne, sans analyser le YAML. —
  [GNU grep manual](https://www.gnu.org/software/grep/manual/grep.html)
  (manuel de GNU grep, celui du runner `ubuntu-24.04` ; les tests ont tourné
  sous macOS, avec BSD grep)

  Sous GNU grep, seul le cas accepté est observé : l'exécution de la CI de la PR a lancé
  le script sur les workflows du dépôt (voir « Vérifier soi-même »). Les cas
  refusés n'ont tourné que sous macOS, car la suite Vitest ne tourne pas en
  CI.

## Ce qui a été construit

- `scripts/check-pinned-actions.sh <dossier>` : le contrôle. Il lit chaque
  `.yml` et `.yaml` du dossier (par défaut `.github/workflows`), repère toute
  clé `uses` et refuse celles qui n'ont pas la forme
  `owner/repo@<SHA de 40 caractères> # vX.Y.Z`. Il échoue aussi quand le
  dossier ne contient aucun workflow.
- `tests/pinned-actions.test.ts` : 9 tests Vitest qui lancent le script sur
  des dossiers temporaires. Le test négatif est `actions/checkout@v4`, refusé
  avec le fichier, la ligne et le renvoi vers la procédure.
- `.github/workflows/pinned-actions.yml` : le workflow « Actions épinglées »,
  qui lance le contrôle sur chaque PR.
- `docs/agents/pinned-actions.md` : la source unique de la règle, ses
  limites, et la procédure pour trouver le SHA d'une étiquette. Le script, le
  test et le workflow y renvoient.
- `CLAUDE.md` : une section « Actions des workflows » qui pointe vers la
  procédure.

## Les choix faits et pourquoi

- **Un script bash avec `grep -E`, pas un script TypeScript.** Le ticket
  demande un `grep -E` sans nouvelle dépendance. Le script tourne sur le
  runner sans installer Node ni les dépendances, comme le contrôle de
  `fiche-ticket.yml`, écrit lui aussi en shell. Option écartée : un script
  `.ts` ou `.mjs` comme les autres fichiers de `scripts/`, qui demanderait
  une étape `setup-node` de plus.
- **Le script prend un dossier en argument et il est testé par Vitest.**
  C'est l'interface validée par l'humain avant les tests. Le test négatif
  reste ainsi dans la suite, au lieu d'une exécution locale citée une fois.
  Ce que ces tests ne prouvent pas : que le contrôle est bien lancé par la
  CI. C'est l'exécution de la CI de la PR qui le prouve.
- **Un workflow dédié plutôt qu'une étape dans `fiche-ticket.yml`.** Le
  ticket permet les deux. `fiche-ticket.yml` vérifie les fiches de
  formation ; y ajouter ce contrôle lui donnerait une deuxième raison de
  changer.
- **Les fichiers `.yaml` sont aussi lus**, alors que le ticket ne cite que
  `*.yml`. GitHub accepte les deux extensions : sans cela, renommer un
  workflow en `.yaml` contournerait le contrôle.
- **Messages d'erreur en français**, comme ceux de `fiche-ticket.yml`.
- **Après la relecture, quatre corrections, chacune décidée par l'humain :**
  - un dossier absent ou sans workflow fait échouer le contrôle (test rouge
    d'abord) ;
  - les formes `- { uses: … }` et `- "uses": …` sont refusées (test rouge
    d'abord) ;
  - les exemples de la procédure citent leur date et leur ticket ;
  - la phrase de la règle, répétée dans quatre fichiers, ne vit plus que
    dans la procédure.

  Les deux dernières ne changent que de la prose ou des commentaires : elles
  n'ont pas de test.
- **Laissé tel quel, décision humaine :** les formes `./action` locale et
  `docker://`, et un commentaire `# v7` sans correctif, sont refusées ; une
  ligne `uses:` dans un bloc `run: |` est refusée à tort. Elles seront
  revues dans #20 si ce ticket en a besoin.

## Difficultés rencontrées

- **Le contrôle passait sans rien lire.** Symptôme : la relecture « spec » a
  observé que `check-pinned-actions.sh /nonexistent` sortait avec le code
  `0`, sans sortie. Cause : la boucle sur `"$dir"/*.yml` saute les motifs qui
  ne correspondent à rien, et aucune ligne n'est alors refusée. Résolution :
  le script compte les fichiers lus et échoue s'il n'en a lu aucun
  (`26bfb89`).
- **Deux formes YAML contournaient le contrôle.** Symptôme : la relecture
  « spec » a fait passer `- { uses: actions/checkout@v4 }` et
  `- "uses": actions/checkout@v4`. Cause : la détection n'acceptait que
  `uses:` en début de ligne ou après `- `. Résolution : la détection reconnaît
  toute clé `uses`, guillemetée ou non, après `-`, `{`, `,` ou un espace
  (`b281208`).
- **Une limite écrite sans l'avoir vérifiée.** Symptôme : la première
  version de la limite disait qu'une valeur `uses` écrite sur la ligne
  suivante échappait au contrôle. Cause : la phrase n'avait pas été testée ;
  essayée sur un dossier jetable, cette forme est en fait refusée, puisque la
  ligne de la clé n'a pas la forme attendue. Résolution : la limite cite un
  contournement observé, la clé échappée `"u\x73es"`, qui passe le contrôle.
- **Des commentaires dans le mauvais commit.** Les en-têtes du script et du
  test, qui renvoient vers la procédure, ont été modifiés avant le commit de
  la détection élargie et sont partis dans `b281208` au lieu de `dc62aa8`.
  Le contenu final n'en dépend pas.

## Vérifier soi-même

État observé : commit `14b5dbc`, le 2026-11-20.

```sh
bash scripts/check-pinned-actions.sh .github/workflows; echo "exit $?"
```

Observé : aucune sortie, puis `exit 0`.

Avec un dossier qui contient un workflow à `uses: actions/checkout@v4` en
ligne 5 :

```sh
bash scripts/check-pinned-actions.sh <dossier>; echo "exit $?"
```

Observé (chemin abrégé) :
`::error file=<dossier>/ci.yml,line=5::Action non épinglée par SHA :       - uses: actions/checkout@v4. Attendu : owner/repo@<SHA de 40 caractères> # vX.Y.Z (procédure : docs/agents/pinned-actions.md).`
puis `exit 1`.

```sh
bash scripts/check-pinned-actions.sh /nonexistent; echo "exit $?"
```

Observé : `::error::Aucun workflow trouvé dans /nonexistent`, puis `exit 1`.

```sh
npx vitest run tests/pinned-actions.test.ts
```

Observé : `Tests  9 passed (9)`.

Sur la PR, le workflow « Actions épinglées » doit passer. Observé sur l'exécution
[44777959324](https://github.com/karAmmi12/migrabench/actions/runs/44777959324)
(PR #25, commit `aa5d288`) : l'étape lance
`bash scripts/check-pinned-actions.sh .github/workflows`, conclusion
`success`, aucune annotation.

## Pour aller plus loin

- #20, « CI : exécuter npm test avec la pile Docker » : ses nouvelles
  actions devront passer ce contrôle. Si ce ticket a besoin d'une action
  locale, d'une image `docker://` ou d'une action qui ne publie que des
  étiquettes majeures, il faudra élargir la forme acceptée.
- #23, « CI : lancer npm run typecheck sur chaque PR » : un autre contrôle
  de CI, sans Docker.
- Limite connue : le contrôle lit des lignes, pas du YAML. Un analyseur YAML
  fermerait les contournements comme la clé échappée, au prix d'une
  dépendance.
