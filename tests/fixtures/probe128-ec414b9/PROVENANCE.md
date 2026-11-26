# Provenance : sonde de #128 sur le commit `ec414b9`

Copies, sans aucune modification, des sorties d'axe-core écrites par la sonde
`.probes/128/probe.mjs` (dépôt ignoré par Git), le 2026-11-26, sur un arbre
propre au commit `ec414b9` de la branche `feat/128-accessibility-gate`
(`@axe-core/playwright` 4.14.0, `axe-core` 4.14.0). La pile venait d'être
reconstruite par `npm run stack:up` depuis ce commit. Le navigateur était le
service `browser` de la pile, Chromium 159.0.8154.6 en `linux/arm64`.

Chaque fichier est le JSON complet rendu par
`new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()`
sur un écran du legacy, atteint directement sur `http://localhost:8080` par
le relais du navigateur. Vérifié avec `cmp` après la copie.

| Copie | Écran | Identité | Navigation |
|---|---|---|---|
| `axe-screen1.json` | 1, recherche | agent | `BASE_URL`, puis « Rechercher » sans critère |
| `axe-screen2.json` | 2, fiche | agent | recherche de `D-0003`, puis clic sur le numéro |
| `axe-screen3.json` | 3, remise | instructeur | fiche de `D-0003`, puis lien « Remise », sans cliquer sur « Remettre » |

Sortie de la sonde sur les mêmes écrans, pour les tableaux :

| Écran | Arbre d'accessibilité (CDP `Accessibility.getFullAXTree`) | `getByRole("table")` | DOM : `table` | DOM : `table` dans un `table` |
|---|---|---|---|---|
| 1 | `table` 1, `LayoutTable` 3 | 4 | 4 | 3 |
| 2 | `LayoutTable` 3 | 3 | 3 | 2 |
| 3 | `LayoutTable` 3 | 3 | 3 | 2 |
