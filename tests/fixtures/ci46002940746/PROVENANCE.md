# Provenance : exécution 46002940746, job des mesures de la PR #161

`relay-untouched-lighthouse-pass-1.json` est la copie, sans aucune modification
(vérifiée avec `cmp`), du brut `gates/lighthouse/pass-1.json` de la mesure
`20261127T130721Z-08927c2-conforming-candidates-relay-untouched`. Ce brut a
été produit par le job `measures` de
l'[exécution 46002940746](https://github.com/karAmmi12/migrabench/actions/runs/46002940746),
sur le commit `08927c2` de la branche `feat/134-lighthouse`, et téléchargé
depuis son artefact `measures`.

C'est le rapport de Lighthouse (LHR) d'une passe qui n'aboutit pas : le
candidat ne sert aucun écran, et le LHR porte `runtimeError.code`
`CHROME_INTERSTITIAL_ERROR`, avec un score de performance `null`. Ses piles
d'erreur citent les chemins du runner de la CI (`/home/runner/…`).
