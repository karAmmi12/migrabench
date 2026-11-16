# Messages de démarrage

## 1. Cadrage global — à coller après `/grill-with-docs`

Je veux construire migrabench, un banc de mesure pour comparer des migrations
de front legacy (Struts 1 / JSP vers React + TypeScript) réalisées par des
agents IA. Lis PROTOCOL.md, docs/PLAN.md et CLAUDE.md. Interroge-moi sur les
décisions encore ouvertes, une question à la fois, en commençant par celles
qui bloquent l'étape 1. Ne propose pas de code pour l'instant.

## 2. Spec de l'étape 1 — à coller après `/to-spec`

Rédige la spec de l'étape 1 de docs/PLAN.md (application legacy de test), à
partir des décisions prises pendant le cadrage. La spec doit lister les trois
écrans, le jeu de données fixe, chaque piège avec le comportement observable
qui le rend testable, et le critère de fin.

## 3. Ensuite

`/to-tickets`, puis `/implement` un ticket à la fois, `/code-review` avant
chaque merge, `/retro` en fin de session.
