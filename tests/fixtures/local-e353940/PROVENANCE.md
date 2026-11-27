# Provenance : mesure locale de la sonde d'isolation sur le commit `e353940`

Copies, sans aucune modification (vérifiées avec `cmp`), du `measure.json` et
du brut `start.log` de la mesure de diagnostic
`20261127T124602Z-e353940-defective-candidates-isolation-probe`, lancée le
2026-11-27 par :

```sh
npm run migrabench -- measure --candidate fixtures/defective-candidates/isolation-probe
```

sur un arbre propre (`environment.worktree: "clean"`) au commit `e353940` de
la branche `feat/134-lighthouse`, après `npm run stack:up` depuis ce commit.
Verdict : `completed`, `ok`.

C'est la première sonde qui tente de joindre la passerelle CDP du navigateur du
banc (#134) : son constat porte `reach-browser-cdp`, refusé par deux `403`.
