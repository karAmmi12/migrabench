# Provenance : sonde de #131 sur le commit `6e514ab`

`probe-output.json` est la copie, sans aucune modification, de la sortie
écrite par la sonde `.probes/131/probe2.ts` (dossier ignoré par Git), copiée
ici en `probe.ts.txt`. Lancée le 2026-11-27 entre 12:35 et 12:38 UTC, sur un
arbre propre au commit `6e514ab` de la branche `feat/131-role-gate` (rien
d'autre que la branche créée). La pile venait d'être reconstruite par
`npm run stack:up` depuis ce commit. Le navigateur était le service `browser`
de la pile, Chromium 159.0.8154.6. Vérifié avec `cmp` après la copie.

La sonde vise le port 8080 du legacy, que le candidat de référence relaie
sans rien changer. Le legacy est redémarré (`docker restart`) avant chaque
session, pour remettre `D-0112` à `EN_INSTRUCTION`.

| Clé | Ce qu'elle contient |
|---|---|
| `before`, `afterInstructeur`, `afterRestart`, `afterAgentReplay`, `final` | statut de `D-0112` lu par l'API interne à chaque étape |
| `instructeur.responses` | chaque réponse reçue par la session de l'instructeur (`page.on("response")`, corps par `response.body()`), de `BASE_URL` à la remise de `D-0112`, puis après le clic sur « Remettre » (`afterClick`) |
| `instructeur.posted` | chaque requête émise après le clic, avec `allHeaders()` et son corps |
| `instructeur.cookies`, `agent.cookies` | cookies du contexte à la fin de la session |
| `agent.responses` | la même navigation en agent, sans clic |
| `replay` | réponse au rejeu en Node du `POST` enregistré, `Authorization` et cookie de l'agent |

Ce que la sonde montre, et qui fixe la conception de la porte :

- la requête de remise est un `POST /remettre.do`, corps
  `number=D-0112`, suivi d'un `302` vers `/remise.do?number=D-0112`, puis
  d'un `GET` de cette page ;
- `allHeaders()` donne `authorization` (Basic) et `cookie` ;
- Tomcat change l'identifiant de session à l'authentification : la réponse
  de `BASE_URL` pose un premier `JSESSIONID`, cité dans l'URL de l'action de
  la recherche (`;jsessionid=…`), et la réponse de la recherche en pose un
  second, envoyé ensuite ;
- `response.body()` rend tous les corps, sauf celui de la redirection
  (« Response body is unavailable for redirect responses ») ;
- l'agent atteint la remise par le lien de la fiche et lit « Remise
  réservée aux instructeurs », sans formulaire ;
- le rejeu avec l'identité de l'agent remet le dossier (`afterAgentReplay:
  "REMIS"`) : le legacy échoue au rejeu.
