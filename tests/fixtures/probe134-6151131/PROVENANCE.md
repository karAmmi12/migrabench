# Provenance : sonde de #134 sur le commit `6151131`

`lhr-pass.json` est la copie, sans aucune modification (vérifiée avec `cmp`),
du rapport de Lighthouse (LHR) de la première passe écrite par la sonde
`.probes/134/probe.ts` (dossier ignoré par Git). La sonde a tourné le
2026-11-27, sur un arbre propre au commit `6151131` de la branche
`feat/134-lighthouse`, juste après `npm run stack:up` lancé depuis ce
commit.

- Lighthouse 13.6.0, `puppeteer-core` 25.19.0.
- Chromium de la passerelle CDP du service `browser` (`fixtures/browser/cdp-gateway.mjs`,
  nommée `cdp-relay.mjs` à ce commit) :
  `Chrome/159.0.8154.6`, image `mcr.microsoft.com/playwright:v1.65.1-noble`,
  `linux/arm64`.
- Configuration : `desktop-config.js` de Lighthouse, `onlyCategories:
  ["performance"]` et `throttlingMethod: "simulate"`.
- URL : `http://127.0.0.1:8080/`, le legacy, joint par le relais local du
  navigateur.
- En-tête `Authorization` (BASIC) de l'agent de `fixtures/users.json`.

Constats de la même exécution de la sonde (sortie `report.json`, non versionnée) :

| Essai | Résultat |
|---|---|
| `GET /json/version` sans jeton, `GET /json` sans jeton, `POST /<faux jeton>/launch` | `403` chacun |
| Passe sans `Authorization` | `runtimeError.code` `FAILED_DOCUMENT_REQUEST` (`net::ERR_INVALID_AUTH_CREDENTIALS`), score `null` |
| Passes 1 à 3 avec `Authorization` | score `1`, document en `200` |
| Passe avec `disableStorageReset: true` (témoin) | score `1`, document en `200` |
| `POST close/<id>`, puis le même `close` une seconde fois | `200`, puis `404` |

Les entrées `lh:storage:clearDataForOrigin` et `lh:storage:clearBrowserCaches`
de `timing.entries` figurent dans le LHR de chaque passe, y compris celle sans
`Authorization`. Elles sont absentes de la passe témoin
(`disableStorageReset: true`). Le cache est donc vidé avant chaque passe, et
les identifiants, portés par l'en-tête, ne se perdent pas : le document est en
`200` dans les trois passes.

Le LHR de la passe sans `Authorization` n'est pas versionné : ses piles
d'erreur citent les chemins locaux de la machine. Le cas d'une passe qui
n'aboutit pas est copié d'une mesure de CI.
