---
name: fiche-ticket
description: Rédige la fiche de formation d'un ticket dans docs/formation/journal/. À lancer à la fin d'un ticket, avant d'ouvrir sa PR.
argument-hint: "[numéro du ticket]"
---

# Fiche de ticket

La fiche raconte un ticket à un **apprenant** qui découvre le banc et sa stack :
ce qu'il faut savoir, ce qui a été fait, pourquoi, et comment le revérifier.
Elle est écrite en français, avec le vocabulaire de `PROTOCOL.md` et `GLOSSARY.md`.

## Règle de provenance

Chaque passage de la fiche a une **source** : l'issue, le diff, un commit, ou un
événement de la session en cours (erreur, test rouge, fausse piste, choix
discuté, relecture). Un passage dont la source est incertaine est suivi de la
ligne `> À vérifier : <ce qui est incertain>`. Une difficulté s'écrit seulement
si la session la montre ; sans difficulté observée, la section dit
« Aucune difficulté relevée pendant la session. »

**Session d'origine** : la session où le ticket a été implémenté. Si la session
en cours ne contient pas ce travail, la section « Difficultés rencontrées »
contient seulement la ligne
`> À vérifier : session d'origine indisponible, à compléter par l'humain`, et les
choix viennent des seuls commits, de l'issue et du diff.

## Étapes

1. **Rassembler.** Numéro du ticket : l'argument, sinon le nom de la branche
   ou les commits ; s'il reste ambigu, demander. Lire :
   - `gh issue view <N> --json number,title,body` ;
   - `git log --oneline main..HEAD`, `git diff main...HEAD --stat`, puis le
     diff des fichiers qui portent le ticket ;
   - la session en cours : relever chaque difficulté (symptôme, cause,
     résolution) et chaque choix (option retenue, option écartée, raison).

   Fini quand chaque commit de la branche est rattaché à au moins une section.

2. **Rédiger** `docs/formation/journal/<N>-<nom-court>.md`. `<nom-court>` :
   le titre de l'issue sans son préfixe « Étape X · Y. », en kebab-case, trois
   à cinq mots. Les sept sections, dans cet ordre :

   - `# #<N> · <titre de l'issue>`
   - `## Objectif` : le problème que le ticket résout, en deux à quatre phrases.
   - `## Notions à connaître` : une puce par notion que le diff demande de
     comprendre : une phrase d'explication, puis un lien officiel par notion,
     ou à défaut une source de référence, avec sa nature précisée
     (republication, version documentée, écarts avec le legacy). Un lien non
     confirmé reçoit `> À vérifier`.
   - `## Ce qui a été construit` : les fichiers ou groupes de fichiers et
     leur rôle, pour un lecteur qui ouvre le dépôt.
   - `## Les choix faits et pourquoi` : une puce par choix (option retenue,
     option écartée, raison).
   - `## Difficultés rencontrées` : une puce par difficulté (symptôme, cause,
     résolution).
   - `## Vérifier soi-même` : des commandes à copier, chacune suivie du
     résultat attendu tel qu'il a été **observé** (sortie réelle, abrégée).
     Pour un résultat non observé, relancer la commande, sinon `> À vérifier`.
   - `## Pour aller plus loin` : deux à quatre pistes (ticket suivant, ADR
     liée, limite connue).

   Fini quand les sept sections sont remplies.

3. **Relire contre les sources**, ligne à ligne : chaque difficulté renvoie à
   un événement de la session, chaque chiffre à une sortie réelle (règle
   « Les chiffres viennent de mesures » de `CLAUDE.md`). Corriger ou marquer
   `> À vérifier`. Fini quand chaque passage respecte la règle de provenance.

   **Preuve postérieure à la PR** : un résultat qui n'existe qu'après
   l'ouverture de la PR (un run de CI, sa durée, ses annotations) se marque
   `> À vérifier après le run de la PR : <ce qu'il faudra relever>`. Après le
   run, dans un même passage et avant la fusion :
   - remplacer la ligne par le résultat observé, avec le lien du run, le
     commit et la sortie réelle ;
   - committer : `docs(formation): record PR run result in #<N> training sheet` ;
   - cocher la case correspondante du plan de test de la PR, avec le même lien.

4. **Committer** la fiche seule : `docs(formation): add training sheet for #<N>`.
   La CI refuse une PR qui ferme le ticket #<N> sans
   `docs/formation/journal/<N>-*.md`.

Rendre le chemin de la fiche et la liste des passages `> À vérifier`, en deux
groupes : ceux à lever maintenant, et ceux à reporter après le run de la PR.
