# Résultats JSON versionnés, bruts lourds conservés hors du dépôt

Amende la règle 4 de `PROTOCOL.md`, qui versionnait tous les résultats bruts.
Les résultats JSON sont versionnés. Les traces, captures et HAR sont
conservés hors du dépôt, et chaque JSON cite leur empreinte (SHA-256). Une
trace Playwright pèse plusieurs Mo par scénario : multipliée par les
scénarios, les exécutions, les runs et les outils, elle ferait grossir le
dépôt sans limite. L'empreinte suffit à prouver qu'un fichier présenté plus
tard est bien celui de l'exécution.

## Durée de conservation

Elle dépend de la nature des fichiers :

- **validation du banc** (par exemple les exécutions de l'oracle contre le
  legacy, étape 2) : artefacts de CI gardés 7 jours ;
- **runs mesurés** (étape 6) : les bruts restent accessibles aussi longtemps
  que le résultat publié qu'ils fondent, par exemple en pièces jointes d'une
  release GitHub par campagne (ensemble des runs publiés ensemble), citées
  par empreinte. Le support exact est choisi à l'étape 6.

## Options écartées

- Tout versionner, comme le disait la règle 4 : taille du dépôt.
- Git LFS : dépendance d'outillage et quotas, pour des fichiers rarement relus.
- Deux régimes (bruts versionnés pour les runs mesurés seulement) : la taille
  reste le problème là où les volumes sont les plus grands.

## Conséquences

- Un JSON de résultat enregistre aussi son environnement : commit du banc,
  arbre de travail propre ou modifié, version de Node, empreinte des images
  Docker, horloge figée et sel de la référence d'archivage.
- Une preuve de critère de fin exige un arbre de travail propre.
- Le sel d'une exécution passée devient public. Ce n'est pas un risque, car
  chaque run mesuré en tire un nouveau ; une exécution relancée avec un sel
  enregistré sert au diagnostic, jamais à la mesure.
