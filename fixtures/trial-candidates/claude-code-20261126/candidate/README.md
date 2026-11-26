# Dossiers — nouvelle application

Front React/TypeScript (Vite) et couche serveur Node 22/TypeScript (Express 5).
Le navigateur ne parle qu'à la couche serveur, qui appelle l'API interne de
`legacy-app` (`LEGACY_API_URL`).

- `npm run build` puis `npm start` (voir `candidate.json`).
- `npm test` : tests de la couche serveur (contre un double de l'API interne,
  `scripts/fake-legacy.mjs`) et des écrans (clavier, focus, messages).
- Mêmes adresses que l'application actuelle : `/recherche.do`, `/rechercher.do`,
  `/fiche.do?number=`, `/remise.do?number=`.

Règles portées par la couche serveur, car l'API interne ne les applique pas :
authentification BASIC (`USERS_FILE`), validation de `validation.xml`
(`src/server/validation.ts`), réservation de la remise aux instructeurs, et
accusé de remise relayé avec le jeton `ARCHIVE_TOKEN`, qui ne quitte jamais le serveur.
