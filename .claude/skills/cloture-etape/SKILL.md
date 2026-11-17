---
name: cloture-etape
description: Clôt une étape du plan — contrôle les fiches de formation, met à jour docs/formation/README.md, propose le tag etape-N.
disable-model-invocation: true
argument-hint: "<numéro d'étape>"
---

# Clôture d'étape

Argument : le numéro N de l'étape dans `docs/PLAN.md`. S'il manque, demander.

## Étapes

1. **Inventaire.** Les tickets de l'étape sont les issues dont le titre
   commence exactement par « Étape N · » :
   `gh issue list --state all --search "Étape N in:title" --json number,title,state --limit 100`,
   puis filtrer sur ce préfixe (« Étape 1 · » n'inclut pas « Étape 10 · »).
   Fini quand chaque ticket est classé fermé ou ouvert.

2. **Contrôle des fiches.** `git fetch`, puis pour chaque ticket fermé,
   chercher `docs/formation/journal/<numéro>-*.md` dans
   `git ls-tree -r --name-only origin/main`. Une fiche qui contient encore
   « > À vérifier » (`git grep -n "> À vérifier" origin/main -- <fiche>`) compte
   comme manquante. Fini quand chaque ticket fermé a sa fiche complète ou
   figure dans la liste des manques, avec la raison (absente, ou les lignes
   « > À vérifier » restantes).
   S'il reste un ticket ouvert ou une fiche manquante : rendre les deux listes
   et s'arrêter, l'étape n'est pas close.

3. **Mettre à jour `docs/formation/README.md`** sur une branche
   `docs/cloture-etape-N` partie de `origin/main`. Ce skill tient deux
   sections ; le reste du fichier garde son texte. Créer le fichier s'il
   n'existe pas.
   - `## Sommaire` : une sous-section par étape
     (`### Étape N · <titre dans PLAN.md>`), une ligne par fiche dans l'ordre
     des tickets : `- [#<n> · <titre>](journal/<fichier>) : <objectif en une phrase, repris de la fiche>`.
   - `## Parcours de lecture` : l'ordre conseillé à un apprenant, étape par
     étape : quelles fiches lire d'abord, lesquelles se lisent ensemble, en
     suivant les « Notions à connaître » (une notion est introduite avant
     d'être utilisée).

   Fini quand chaque fiche de `docs/formation/journal/` apparaît une fois au
   sommaire et au moins une fois dans le parcours.

4. **Committer** : `docs(formation): close step N in training index`, puis
   proposer d'ouvrir la PR.

5. **Proposer le tag.** Le tag est posé par l'humain, sur `main`, après la
   fusion de la PR de clôture. Rendre la commande :

   ```sh
   git switch main && git pull
   git tag -a etape-N -m "Étape N · <titre> : <k> tickets, fiches à jour"
   git push origin etape-N
   ```

Rendre : les tickets de l'étape, les fiches trouvées, les fichiers modifiés,
la commande du tag.
