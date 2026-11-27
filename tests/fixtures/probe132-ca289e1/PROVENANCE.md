# Provenance : sonde de #132 sur le commit `ca289e1`

`probe-output.json` est la copie, sans aucune modification, de la sortie
écrite par la sonde `.probes/132/probe.ts` (dossier ignoré par Git). Cette
sonde est copiée ici en `probe.ts.txt`. Elle a été lancée le 2026-11-27 vers
16:00 UTC, sur un arbre propre au commit `ca289e1` de la branche
`feat/132-auth-gate` (la branche venait d'être créée, sans autre changement).
La pile venait d'être reconstruite par `npm run stack:up` depuis cette copie,
et la sonde a tourné sous le verrou du banc. Le navigateur était le service
`browser` de la pile. Les deux copies ont été vérifiées avec `cmp`.

La sonde vise le port 8080 du legacy, que le candidat de référence relaie
sans rien changer. Les dossiers `gate:auth` n'existaient pas encore : elle se
sert de `D-0117` (`BROUILLON`) et de `D-0112` (`EN_INSTRUCTION`). Le legacy
est redémarré (`docker restart`) avant l'enregistrement, avant les rejeux et
à la fin.

| Clé | Ce qu'elle contient |
|---|---|
| `stateBefore`, `stateAfterRecording`, `stateAfterRestart`, `stateAfterReplayNoCookie`, `stateAfterReplayAnonymousCookie` | les deux dossiers lus par l'API interne à chaque étape |
| `anonymous` | la session anonyme : `BASE_URL` ouvert sans identifiants, ses réponses et ses cookies |
| `agent`, `instructeur` | chaque requête émise (`allHeaders()`, corps) et chaque réponse reçue, avec l'étape du parcours (`sheet`, `save`, `remise`, `submit`) ; puis les cookies du contexte |
| `replayNoCookie` | rejeu en Node de chaque requête enregistrée, dans l'ordre, sans `Authorization` ni cookie : statut, en-têtes, corps, numéros de dossier trouvés |
| `replayAnonymousCookie`, `anonymousCookieSent` | le même rejeu, avec les cookies de la session anonyme (aucun) |

Ce que la sonde montre :

- `BASE_URL` sans identifiants rend `401` (page d'erreur de Tomcat, 683
  octets, `WWW-Authenticate: Basic realm="migrabench"`), sans aucun cookie.
  Sur le legacy, la session anonyme n'a donc reçu aucune valeur à
  transplanter ;
- le parcours de l'agent émet `GET /`, la recherche (`;jsessionid=` dans le
  chemin), `GET /fiche.do`, puis `POST /enregistrer.do` (corps
  `number`, `applicant`, `subject`, en `x-www-form-urlencoded`) suivi du `GET`
  de sa redirection. Celui de l'instructeur y ajoute `GET /remise.do`,
  `POST /remettre.do` (corps `number=…`) et le `GET` de sa redirection ;
- `allHeaders()` ne donne pas `authorization` pour la première requête
  (`GET /`), qui a reçu le défi `401`. Il le donne pour toutes les suivantes ;
- l'enregistrement change l'objet de `D-0117`, et l'objet et le statut de
  `D-0112` (`REMIS`, `submittedOn` posé). Le redémarrage remet les deux ;
- chaque requête rejouée sans identifiants reçoit `401`, avec ou sans cookie.
  Aucun corps ni en-tête ne contient un numéro du jeu de données, et l'état des
  deux dossiers ne change pas : le legacy passe la porte.
