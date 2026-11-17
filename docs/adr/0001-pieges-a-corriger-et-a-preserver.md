# Pièges à corriger, mesurés par les portes ; pièges à préserver, mesurés par l'oracle

Le legacy doit obtenir 100 % à l'oracle (règle 6 de `PROTOCOL.md`), alors
qu'un piège est un défaut qu'une bonne migration ne doit pas reproduire. On
range donc chaque piège dans l'une de deux familles :

- un **piège à corriger** (XSS, secret, contrôle de rôle, mise en page en
  `<table>`) n'est jamais vérifié par l'oracle. Il est mesuré par une porte.
  Le legacy, déclaré comme candidat, échoue cette porte et lui sert de test
  négatif ;
- un **piège à préserver** (règles présentes seulement dans `validation.xml`,
  raccourci clavier, `focus` initial) est un comportement implicite que la
  migration ne doit pas perdre. Il est vérifié par un scénario de l'oracle, et
  le legacy y passe.

`TRAPS.md` indique pour chaque piège sa famille, ainsi que la porte ou le
scénario qui le mesure.

## Conséquences

- Le legacy obtient 100 % à l'oracle mais échoue volontairement à certaines
  portes. Le rapport ne doit pas présenter ces échecs comme une anomalie du banc.
- Ajouter un scénario d'oracle qui vérifie un piège à corriger casserait la
  règle 6. C'est la ligne rouge à surveiller en revue.
