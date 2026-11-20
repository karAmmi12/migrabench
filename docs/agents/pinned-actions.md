# Épingler une action GitHub par SHA

Source unique de la règle (#22). Le script, son test et le workflow qui le
lance renvoient ici.

## La règle

Chaque `uses:` des workflows de `.github/workflows/` a la forme :

```yaml
- uses: owner/repo@<SHA de commit, 40 caractères> # vX.Y.Z
```

Une étiquette (`@v7`, `@v7.0.1`) peut être déplacée par les mainteneurs de
l'action ; un SHA de commit ne bouge pas. Le commentaire donne la version
lisible.

## Le contrôle

`scripts/check-pinned-actions.sh`, lancé sur chaque PR par
`.github/workflows/pinned-actions.yml`, refuse :

- toute clé `uses` qui n'a pas la forme ci-dessus, y compris en mapping de
  flux (`- { uses: … }`) ou avec une clé entre guillemets (`- "uses": …`) ;
- un dossier qui ne contient aucun fichier `.yml` ou `.yaml`, pour qu'un
  chemin qui a dérivé ne fasse pas passer le contrôle sans rien lire.

**Limite :** le contrôle lit les lignes avec `grep -E`, sans analyser le
YAML. Il repère les formes courantes, pas toute la syntaxe YAML. Par
exemple, une clé écrite avec un échappement (`"u\x73es": actions/checkout@v4`)
lui échappe. À l'inverse, une ligne `uses:` placée dans un bloc `run: |` est
refusée alors qu'elle n'est pas une action.

## Trouver le SHA d'une étiquette

1. Lire la référence de l'étiquette :

   ```sh
   gh api repos/<owner>/<repo>/git/ref/tags/<étiquette> --jq '.object | "\(.type) \(.sha)"'
   ```

2. Si le type est `commit` (étiquette légère), ce SHA est celui à épingler.
3. Si le type est `tag` (étiquette annotée), ce SHA est celui de l'objet
   *tag*, pas du commit. Le déréférencer :

   ```sh
   gh api repos/<owner>/<repo>/git/tags/<sha-du-tag> --jq '.object | "\(.type) \(.sha)"'
   ```

   Le type rendu est `commit` : ce SHA est celui à épingler.

Exemples observés le 2026-11-20 :

- étiquette légère, pendant #10 (épinglage fusionné par la PR #21) :
  `gh api repos/actions/checkout/git/ref/tags/v7.0.1 --jq '.object | "\(.type) \(.sha)"'`
  rend `commit 3d3c42e5aac5ba805825da76410c181273ba90b1` ;
- étiquette annotée, pendant #22 : `git/git` `v2.47.0` rend d'abord
  `tag 4ec4435df758668055cc904ef64c275bc8d1089b`, puis, déréférencée,
  `commit 777489f9e09c8d0dd6b12f9d90de6376330577a2`.

## Vérifier le contrôle en local

```sh
bash scripts/check-pinned-actions.sh .github/workflows
```

Aucune sortie et un code de sortie `0` : tous les `uses:` sont épinglés.
