# #131 · Étape 4 · Porte de rôle par rejeu

## Objectif

Sur le legacy, seul un scriptlet de la JSP masque le bouton « Remettre » à
l'agent : `RemiseAction` ne vérifie aucun rôle. C'est un piège à corriger
(`TRAPS.md`, « Contrôle de rôle dans la vue »). Ce ticket ajoute la porte qui
le mesure. Elle enregistre la remise de `D-0112` par l'instructeur, puis la
rejoue dans une session d'agent. Elle tente aussi d'atteindre directement
l'écran de remise en agent. C'est aussi la première porte qui redémarre le
legacy (`restartLegacy()`, fourni par G0, #124) : elle en apporte la preuve
sur la vraie pile.

## Notions à connaître

- **Rejeu d'une requête dans une autre session** : on renvoie la requête
  enregistrée, mais avec l'identité d'un autre utilisateur. Pour cela, on
  remplace aussi les valeurs liées à la session d'origine (cookie de session,
  jeton anti-CSRF). Si le serveur ne contrôle que la vue, le rejeu passe.
- **Jeton anti-CSRF (synchronizer token)** : un secret par session, posé
  dans la page et renvoyé avec chaque écriture. Il protège contre une requête
  forgée par un autre site, mais pas contre un utilisateur authentifié qui
  n'a pas le bon rôle. —
  [OWASP, CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- **Changement d'identifiant de session à l'authentification** : Tomcat
  remplace le `JSESSIONID` quand l'utilisateur s'authentifie, contre la
  fixation de session. La sonde de ce ticket le montre sur le legacy. —
  [Tomcat 9, Valves, `changeSessionIdOnAuthentication`](https://tomcat.apache.org/tomcat-9.0-doc/config/valve.html)
- **Clic d'essai de Playwright (`trial: true`)** : il vérifie que l'élément
  est cliquable (visible, stable, actif, et qu'il reçoit le clic), sans
  cliquer. —
  [Playwright, Locator.click](https://playwright.dev/docs/api/class-locator)
- **En-têtes et corps vus par Playwright** : `request.allHeaders()` donne
  tous les en-têtes envoyés, `Authorization` et `Cookie` compris.
  `response.body()` donne le corps de la réponse, sauf pour une redirection. —
  [Playwright, Request](https://playwright.dev/docs/api/class-request),
  [Playwright, Response](https://playwright.dev/docs/api/class-response)

Ces cinq liens ont été ouverts le 2026-11-27 (`curl -L`). Tous ont répondu
`200`, et chaque page contient le passage cité : « Synchronizer Token
Pattern », `changeSessionIdOnAuthentication`, « When set, this method only
performs the actionability checks and skips the action », `allHeaders`,
`response-body`.

## Ce qui a été construit

- **`gates/role-transplant.ts`**, en fonctions pures, transplante une requête
  enregistrée vers une autre session. Les valeurs lues dans la requête sont :
  - les cookies ;
  - les paramètres de chemin (`;jsessionid=`) et d'URL ;
  - les champs d'un formulaire et les chaînes d'un JSON ;
  - les en-têtes propres à l'application.

  Une valeur apparue dans ce que la session source a reçu est cherchée au
  même endroit dans la session cible. Cet endroit est soit le cookie du même
  nom, soit la même réponse, la même partie et le même contexte de
  32 caractères. Une valeur introuvable dans la cible est retirée.
  `Authorization` est toujours remplacé.
- **`gates/role.ts`**, la porte `role-check`, dans le groupe des portes qui
  écrivent, entre XSS et le relais :
  - **Enregistrement** : l'instructeur va jusqu'à la remise de `D-0112`
    (`gate:role`), puis clique. La porte enregistre les requêtes émises
    jusqu'au repos du réseau, et l'API interne confirme la remise.
  - Après chaque redémarrage du legacy :
    - `role-replay-control` rejoue dans une nouvelle session d'instructeur ;
    - `role-replay` rejoue dans une session d'agent ;
    - `role-forced-browsing` atteint l'écran de remise en agent, par son URL
      puis par clics.
  - **Bruts** : `gates/role-check/*.json`.
- **`gates/settle.ts`** : l'attente du réseau au repos, sortie de la porte XSS
  pour être partagée.
- **Candidats de test** : des relais du legacy, qui partagent `relay.js`
  (réécriture des pages et garde sur les requêtes). Les candidats à jeton
  partagent aussi `csrf.js`.
  - `defective-candidates/role-button-hidden-in-view` : le formulaire de
    remise de l'agent est masqué (`display:none`) ;
  - `defective-candidates/role-screen-protected-by-link` : le lien
    « Remise » de la fiche est retiré pour l'agent, mais l'écran de remise
    montre le bouton à tous ;
  - `defective-candidates/role-csrf-without-role-check` : le jeton est exigé,
    pas le rôle ;
  - `conforming-candidates/role-csrf-and-role-check` : le jeton et le rôle
    sont exigés.
- **`scripts/measure-cases.ts`** :
  - les issues de la porte pour chaque cas ;
  - un contrôle neuf, `startWitnesses`, qui compare la liste exacte des
    témoins `start-N` ;
  - les quatre mesures, ajoutées à `.github/workflows/measures.yml`.
- **`tests/gates/role.test.ts`** : tests de la transplantation, du jugement
  et de la déclaration de la porte. Ils lisent la sortie réelle de la sonde
  (`tests/fixtures/probe131-6e514ab/`).
- **`docs/specs/04-gates.md`** : les « Précisions de #131 ».

## Les choix faits et pourquoi

- **Requêtes rejouées.** Le rejeu envoie toutes les requêtes émises après le
  clic, dans l'ordre et sans suivre les redirections. La porte ne cherche pas
  à isoler « la » requête d'écriture. Raison : la sonde montre deux requêtes
  sur le legacy (`POST /remettre.do`, puis le `GET` de la redirection), et un
  candidat peut en émettre d'autres. Rejouer un `GET` ne coûte rien.
- **Endroit d'une valeur.** Il est repéré par un contexte de 32 caractères,
  où une longue suite de caractères de jeton vaut toute suite. C'est le
  remplaçant d'un contexte raccourci pas à pas. Raison : le raccourcissement
  tombait sur un autre `<meta … content="…">` (voir « Difficultés »).
- **Valeur absente de la cible.** Elle est retirée, comme le prévoit la spec
  de la porte d'authentification. Garder la valeur de l'instructeur aurait
  testé le vol d'un jeton, pas le contrôle de rôle.
- **Contrôle manqué et agent qui remet.** Le résultat reste `failed`, par la
  règle de #153 : un échec constaté reste `failed`. La spec dit seulement
  « `not-evaluable` si le contrôle ne remet pas le dossier », mais l'agent
  qui remet est un échec observé.
- **Enregistrement manqué.** Les trois résultats sont alors `not-evaluable`,
  sans redémarrage. Raison : sans instructeur qui atteint un bouton, un refus
  de l'agent ne prouve rien. On économise aussi trois redémarrages sur les
  candidats qui ne servent pas les écrans (`relay-untouched`).
- **Nom `role-check`.** Le nom `role` a été écarté. Raison : décision de
  Karim du 26/11 sur #125. `role` est du vocabulaire Java EE que la copie
  expurgée garde, et `tests/legacy-copy/legacy-copy-real.test.ts` cherche les
  noms des portes dans cette copie.
- **Utilisateur de l'instructeur écrit en dur dans le candidat conforme.**
  Raison : un candidat n'a pas d'annuaire des rôles. Le nom suit
  `fixtures/users.json`.

## Difficultés rencontrées

- **Mauvais endroit pour le jeton.** Le test « removes the token when the
  target session has none » était rouge :
  `Received: "number=D-0112&_csrf=text%2Fhtml%3B+charset%3DUTF-8"`. Le contexte
  raccourci jusqu'à 8 caractères (`content="`) trouvait, dans la page de
  l'agent sans jeton, le `<meta http-equiv="Content-Type">`. Correction : un
  seul contexte de 32 caractères, avec les longues suites de jeton
  généralisées.
- **Nom de porte refusé par la copie expurgée.** `legacy-copy-real.test.ts`
  attendait `GATE_NAMES` sans `role`, et le brief de l'agent en contient le
  mot. Correction : la porte a été renommée `role-check` (commit `f9510e8`).
  La première exécution des mesures (46001338380) a été annulée, puisqu'elle
  attendait l'ancien nom.
- **Attente fausse sur l'oracle.** Pour le candidat « lien seul », j'avais
  supposé des scénarios échoués. L'exécution 46001662192 (commit `f9510e8`)
  a relevé 33 réussis, 0 échoué et 5 non atteints : sans le lien, l'agent
  n'atteint pas ces écrans. La porte rendait exactement l'issue attendue.
  Correction : `{ passed: 33, failed: 0, unreached: 5 }`, repris de la mesure
  (commit `32b20de`).
- **Verrou du banc tenu par une autre session.** Une mesure d'un candidat
  d'essai tenait le verrou : ni mesure locale, ni `npm test` complet. Les
  mesures ont été lancées en CI par `workflow_dispatch` sur la branche. Cela
  donne une mesure de diagnostic, sans PR à ouvrir avant la fiche.
- **`erasableSyntaxOnly`.** `tsc` a refusé un paramètre de constructeur
  `readonly step`. Correction : champ déclaré, puis affecté.

## Vérifier soi-même

```sh
npx vitest run tests/gates/role.test.ts tests/gates/registry.test.ts tests/measure-cases.test.ts
```

Observé sur `32b20de` : `Test Files  3 passed (3)`, `Tests  65 passed (65)`.

```sh
gh run view 46001662192 --json jobs -q '.jobs[]|select(.name=="measures")|.steps[]|select(.name|test("rôle|Candidat de référence"))|"\(.conclusion) \(.name)"'
```

Observé (commit `f9510e8`) : succès pour la référence, le bouton masqué, le
jeton sans contrôle de rôle et le candidat conforme. Échec pour « écran
protégé seulement par son lien », seulement sur l'attente de l'oracle,
corrigée depuis (voir « Difficultés »).

Mesures de cette exécution (artefact `measures`, `results/diagnostic/`). Les
trois colonnes de la porte sont `role-replay-control`, `role-replay` et
`role-forced-browsing` :

| Candidat | Oracle (réussis/échoués/non atteints) | Les trois résultats de la porte | Témoins | Relais |
|---|---|---|---|---|
| référence (legacy) | 38/0/0 | passed, **failed**, passed | start-1@2, start-2@249, start-3@266, start-4@283, end@300 | failed, 299 lignes |
| bouton masqué | 38/0/0 | passed, **failed**, passed | idem | failed, 299 lignes |
| lien seul | 33/0/5 | passed, **failed**, **failed** | start-1@2, start-2@272, start-3@289, start-4@306, end@336 | failed, 335 lignes |
| jeton sans rôle | 38/0/0 | passed, **failed**, passed | idem que la référence | failed, 299 lignes |
| conforme | 38/0/0 | passed, passed, passed | start-1@2 … start-4@282, end@299 | failed, 298 lignes |

Chaque clôture est `ok`. Le relais lit donc la fenêtre de `start-1` à `end`
à travers les trois redémarrages. Sur le candidat « jeton sans rôle », le
constat `form:_csrf` montre le jeton placé dans le `<meta name="csrf-token">`
de `GET /fiche.do`, et retrouvé dans la session cible (`found: true,
changed: true`).

**Durée ajoutée.** La mesure du candidat de référence prend 47 s dans
l'exécution 45914452588, avant la porte, et 2 min 16 s dans 46001662192. La
porte ajoute donc environ 1 min 29 s par mesure, sous le seuil de 5 minutes.
Le job entier passe de 12 min 43 s à 33 min, sous son délai de 45 min.

**Pannes d'un redémarrage.** Elles sont prouvées sous faux `docker` par
`tests/runner/candidate-start.test.ts` (#143, commit `12509e1`) : pile
malsaine, images d'une autre copie, témoin absent, candidat arrêté ou jamais
disponible. Chacune passe par le vrai registre en `StackIncident`.

> À vérifier après l'exécution de la CI de la PR : le lien de l'exécution des mesures sur le dernier commit, son head SHA, le résultat des quatre mesures de rôle (dont « lien seul » à 33/0/5) et la durée du job ; le résultat du job `tests` (`npm test` complet, non lancé localement à cause du verrou).

## Pour aller plus loin

- **#132, porte d'authentification** : elle reprend la transplantation
  (`gates/role-transplant.ts`) avec une session anonyme. Elle ajoutera aussi
  du temps au job des mesures, qui n'a plus que 12 min de marge.
- **#100, étalonnage** : le délai de la porte (15 min), les attentes du
  réseau et le délai d'un rejeu sont des valeurs de conception.
- **Limite connue** : un corps de requête ni formulaire ni JSON (multipart,
  texte) est rejoué tel quel, sans transplantation.
- **Limite connue** : un jeton calculé par le navigateur ne se retrouve dans
  aucune réponse. Le contrôle ne remet alors pas le dossier, et `role-replay`
  devient `not-evaluable` avec le constat prévu. Ce cas est prouvé par un
  test unitaire seulement, pas par un candidat sur la vraie pile.
