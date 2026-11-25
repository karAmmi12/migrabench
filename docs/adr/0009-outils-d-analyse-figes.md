# Les portes d'analyse utilisent des outils et des bases figés par le banc, jamais ceux du candidat ni ceux du jour

Les portes qui analysent le code ou les dépendances d'un candidat utilisent
des outils épinglés par le banc, avec une configuration du banc. Elles
jugent contre une base de connaissances figée, la même pour toutes les
mesures d'une campagne :

- **`tsc --noEmit`** : le TypeScript épinglé du banc, jamais
  `node_modules/.bin/tsc` du candidat. Lancer le `tsc` du candidat
  reviendrait à exécuter du code qu'il fournit pour le juger. Un paquet du
  registre public qui se présenterait comme `typescript` pourrait toujours
  afficher « 0 erreur ».
- **Audit des dépendances** : `osv-scanner` en mode hors ligne (`--offline`),
  sur une copie de la base OSV de l'écosystème npm. Cette copie est publiée
  comme asset d'une Release GitHub du dépôt, vérifiée par son sha256 et
  citée par son empreinte et sa date dans chaque résultat. `npm audit`
  interroge la base du jour : deux mesures du même candidat faites à une
  semaine d'écart pourraient différer sans que le candidat ait changé
  (règle 1 de `PROTOCOL.md`).
- **Analyse statique du code** : ESLint, avec des plugins de sécurité sous
  licence libre, épinglés dans le `package-lock.json` du banc et lancés avec
  la seule configuration du banc (`--no-config-lookup`, `--no-inline-config`).
  Les règles de Semgrep, dépôt `semgrep-rules` comme registre, sont sous
  Semgrep Rules License v1.0. Le texte de cette licence les réserve à un
  usage interne et en interdit la distribution (« You may use the rules only
  for your own internal business purposes. This license does not allow you
  to distribute the rules, or to make them available to others as a
  service. »). On ne peut donc pas les copier dans ce dépôt public, et
  publier des scores tirés de ces règles n'est pas clairement couvert.

Changer de version d'outil ou de base est un acte délibéré : un commit qui
change l'épinglage ou l'empreinte, jamais une dérive silencieuse.

## Options écartées

- **Semgrep CE avec des règles écrites par le banc** : la licence est claire,
  mais il faut écrire et tester chaque règle, la couverture est réduite, et
  il faut une image Python de plus.
- **Semgrep avec les règles du registre** : risque de licence, et registre
  changeant.
- **`npm audit` à la date de la mesure** : non reproductible.
- **Le `tsc` et la configuration ESLint du candidat** : le candidat
  choisirait l'outil qui le juge. Un `.eslintrc` vide ou des
  `eslint-disable` suffiraient à passer.

## Conséquences

- Le `tsconfig` du candidat est gardé tel quel, puisqu'on mesure ce qu'il
  déclare. Les moyens de contourner le typage (`strict`, `@ts-nocheck`,
  `@ts-ignore`, `@ts-expect-error`, `any` explicites) sont relevés à part
  dans `values`.
- Les portes d'analyse lisent le candidat tel qu'il a été remis, sans autre
  exclusion que `node_modules/`. Un `dist/` versionné par l'agent est son
  code.
- La base OSV pèse environ 212 Mio (`content-length: 222586756`, relevé le
  26/11/2026). Elle n'est donc pas dans Git, et la CI la garde en cache
  sous la clé de son sha256.
