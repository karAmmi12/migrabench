# Épingler une action GitHub par SHA

Chaque `uses:` des workflows de `.github/workflows/` a la forme :

```yaml
- uses: owner/repo@<SHA de commit, 40 caractères> # vX.Y.Z
```

Une étiquette (`@v7`, `@v7.0.1`) peut être déplacée par les mainteneurs de
l'action ; un SHA de commit ne bouge pas. Le commentaire donne la version
lisible. Le script `scripts/check-pinned-actions.sh`, lancé par la CI,
refuse toute autre forme (#22).

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

Exemple observé pour #10 :
`gh api repos/actions/checkout/git/ref/tags/v7.0.1 --jq '.object | "\(.type) \(.sha)"'`
rend `commit 3d3c42e5aac5ba805825da76410c181273ba90b1`.

## Vérifier le contrôle en local

```sh
bash scripts/check-pinned-actions.sh .github/workflows
```

Aucune sortie et un code de sortie `0` : tous les `uses:` sont épinglés.
