# Provenance : mesure locale de la sonde d'isolation sur le commit `f2cdfd1`

Copies, sans aucune modification (vérifiées avec `cmp`), du `measure.json` et
du brut `start.log` de la mesure de diagnostic
`20261127T152626Z-f2cdfd1-defective-candidates-isolation-probe`, lancée le
2026-11-27 par :

```sh
npm run migrabench -- measure --candidate fixtures/defective-candidates/isolation-probe
```

sur un arbre propre (`environment.worktree: "clean"`) au commit `f2cdfd1` de
la branche `feat/160-playwright-server-token`, après `npm run stack:up` depuis
ce commit. Verdict : `completed`, `ok`.

C'est la première sonde qui tente de joindre le serveur de Playwright du
navigateur du banc (#160) : son constat porte `reach-browser-playwright`,
refusé par deux `403` (`GET http://browser:3000/json` et l'ouverture d'une
connexion WebSocket sur `http://browser:3000/`). Il garde `reach-browser-cdp`
(#134), refusé par deux `403`.

Elle remplace la mesure `local-e353940` (#134), d'avant cette tentative.
