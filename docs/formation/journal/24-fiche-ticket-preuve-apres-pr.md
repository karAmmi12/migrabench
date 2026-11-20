# #24 · /fiche-ticket : reporter une preuve obtenue après l'ouverture de la PR

## Objectif

La CI exige la fiche de formation d'un ticket avant que sa PR le ferme. Mais
certaines preuves n'existent qu'une fois la PR ouverte, par exemple
l'exécution de la CI sur la PR. Pour #10 et #22, la fiche est donc partie
avec une ligne `> À vérifier`, puis le résultat a été reporté à la main. Ce
ticket écrit ce cas dans le skill `/fiche-ticket`, pour qu'il soit traité de
la même façon à chaque ticket, à commencer par #20.

## Notions à connaître

- **Skill de Claude Code** : un fichier `SKILL.md` qui donne à l'agent une
  suite d'étapes à suivre quand on l'invoque, ici avec `/fiche-ticket`. Le
  dépôt range ses skills dans `.claude/skills/`. —
  [Claude Code Docs : Skills](https://code.claude.com/docs/en/skills)
- **Exécution d'un workflow et head SHA** : chaque exécution d'un workflow
  GitHub Actions tourne sur un commit précis, son *head SHA*. Après un nouveau
  push, la PR a un nouveau commit et de nouvelles exécutions : la preuve doit
  citer le commit de l'exécution observée. `gh run view` donne ce commit et
  les horodatages de début et de fin. —
  [GitHub CLI manual : gh run view](https://cli.github.com/manual/gh_run_view)
- **« Run » dans ce dépôt** : `PROTOCOL.md` réserve ce mot à l'exécution
  complète d'un outil par le banc. Pour la CI, la documentation dit
  « exécution de la CI ». Le mot reste seulement dans les noms de commandes
  (`gh run view`, `npm run`).

## Ce qui a été construit

- `.claude/skills/fiche-ticket/SKILL.md` :
  - l'étape 3 garde la règle de marquage : une preuve qui n'existe qu'après
    l'ouverture de la PR se marque
    `> À vérifier après l'exécution de la CI de la PR : <ce qu'il faudra relever>` ;
  - une nouvelle étape 5, « Reporter après l'exécution de la CI de la PR »,
    regroupe ce qui se fait après : remplacer la ligne par le résultat
    observé (lien, head SHA, sortie réelle), committer, cocher la case de la
    PR. Elle a son critère de fin : plus aucune ligne de ce type dans la
    fiche ;
  - le skill rend les passages `> À vérifier` en deux groupes : ceux à lever
    tout de suite, et ceux à reporter à l'étape 5.
- `docs/formation/journal/10-*.md` et `22-*.md` : « run » y est remplacé par
  « exécution » quand le mot désignait la CI (commit `a6d0e64`, séparé).

## Les choix faits et pourquoi

- **Un marqueur distinct, `> À vérifier après l'exécution de la CI de la PR`.**
  Il commence comme le marqueur habituel, donc une recherche de
  `> À vérifier` le trouve toujours. Son suffixe permet de séparer les deux
  groupes demandés par le ticket.
- **La règle de marquage à l'étape 3, les actions d'après la PR à l'étape 5.**
  Le ticket demandait tout à l'étape 3. Les deux relectures ont relevé que
  ces actions ont lieu après le commit de l'étape 4 et après l'ouverture de
  la PR. L'humain a retenu le compromis proposé : on marque au moment de la
  relecture, et on reporte dans une étape à part, dans l'ordre réel.
- **« Exécution de la CI » plutôt que « run ».** La relecture « standards » a
  relevé la collision avec le sens réservé par `PROTOCOL.md`. L'humain a
  décidé que « run » garde ce seul sens, et que les fiches de #10 et #22,
  qui sont des supports de formation, sont corrigées dans un commit séparé.
  Le message de commit de l'étape 5 dit aussi « CI » : `record PR CI result`.
- **Citer le head SHA de l'exécution.** La relecture « spec » a noté qu'une
  fois le résultat reporté, deux commits pouvaient être cités : celui de
  l'exécution observée et celui du report. Le skill demande le premier.
- **Nommer la source d'une durée**, `gh run view <id> --json startedAt,updatedAt`,
  pour que la durée relevée par #20 vienne des données de l'exécution
  (règle « Les chiffres viennent de mesures »).
- **Pas de test automatique.** Le ticket ne change que la prose d'un skill.

## Difficultés rencontrées

- **Des actions placées avant leur moment.** Symptôme : les deux relectures
  ont relevé que le premier texte (`e6c8358`) plaçait à l'étape 3 des actions
  qui ont lieu après l'ouverture de la PR, sans critère de fin. Cause : le
  ticket demandait d'écrire le cas « à l'étape 3 », et le texte avait suivi
  cette lettre. Résolution : une étape 5 avec son critère de fin (`5ee8aff`).
- **Un mot réservé employé dans un autre sens.** Symptôme : la relecture
  « standards » a compté cinq emplois de « run » pour la CI dans le nouveau
  texte. Cause : l'usage venait des fiches de #10 et #22, et du texte du
  ticket lui-même. Résolution : « exécution de la CI » dans le skill et dans
  ces deux fiches (`5ee8aff`, `a6d0e64`).
- **« Passage » avec deux sens.** Le premier texte disait « dans un même
  passage » pour « en une seule fois », alors que le skill appelle
  « passage » un extrait de la fiche. Corrigé en « en une seule fois »
  (`5ee8aff`).

## Vérifier soi-même

État observé : commit `a6d0e64`, le 2026-11-20.

```sh
grep -n "^[0-9]\. \*\*" .claude/skills/fiche-ticket/SKILL.md
```

Observé : cinq étapes, de `1. **Rassembler.**` à
`5. **Reporter après l'exécution de la CI de la PR**`.

```sh
grep -nw "run" .claude/skills/fiche-ticket/SKILL.md
```

Observé : une seule ligne, la commande `gh run view <id> --json startedAt,updatedAt`.

Sur la PR, le workflow « Fiche de formation » doit trouver cette fiche.
Observé sur l'exécution
[44782383572](https://github.com/karAmmi12/migrabench/actions/runs/44782383572)
(PR #26, head SHA `9b9c32b`) : conclusion `success`, et la ligne
`Fiche trouvée pour #24.` dans le journal.

## Pour aller plus loin

- #20, « CI : exécuter npm test avec la pile Docker » : son critère, une
  exécution verte sur une PR avec sa durée, sera le premier cas traité par
  l'étape 5.
- Rien ne rappelle à l'agent de revenir après l'exécution de la CI : le
  skill est terminé quand la PR s'ouvre, et c'est le groupe « à reporter à
  l'étape 5 » qu'il rend qui sert de rappel. La relecture « spec » l'a
  relevé comme une limite.
- Éditer le corps de la PR relance aussi le workflow « Fiche de formation »,
  qui écoute l'événement `edited`. Cocher la case de l'étape 5 produit donc
  une exécution de plus.
