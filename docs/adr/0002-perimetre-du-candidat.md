---
status: superseded by ADR-0003
---

# Un candidat écrit le front React et peut adapter le serveur Java

Les actions Struts répondent en HTML, alors qu'un front React a besoin de
données. Le candidat produit donc l'application React + TypeScript et a le
droit de modifier le projet Maven du legacy, par exemple pour exposer des
endpoints JSON. Le modèle métier, le service métier et le jeu de données
restent en place. C'est le cas réel d'une migration progressive, et c'est le
seul périmètre où les portes de rôle côté serveur et de secret dans le bundle
mesurent un choix de l'agent.

## Options écartées

- Front seul, serveur figé : le candidat devrait lire du HTML.
- API JSON déjà fournie par le legacy : la porte de rôle mesurerait le legacy,
  pas le candidat.
- Réécriture complète, serveur compris : on ne mesure plus une migration de
  front, et la comparaison HAR perd son sens.

## Conséquences

- Le legacy sépare le modèle et le service métier des actions et des JSP,
  pour qu'un agent puisse les réutiliser.
- `candidate.json` doit décrire un build Maven et un build npm.
- La comparaison HAR porte sur les champs et les valeurs métier envoyés, pas
  sur la forme de la requête (formulaire encodé contre JSON).
