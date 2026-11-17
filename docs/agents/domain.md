# Documentation du domaine

Comment les skills d'ingénierie lisent la documentation du domaine de ce
dépôt. Disposition single-context.

## Avant d'explorer, lire

- **`GLOSSARY.md`** à la racine : le vocabulaire du domaine du legacy
  (dossier, statut, remise…) et les termes dérivés du banc.
- **`PROTOCOL.md`** : le vocabulaire du banc (legacy, oracle, candidat, run,
  porte, piège). Utiliser ces mots, et seulement ceux-là.
- **`docs/adr/`** : les ADR qui touchent la zone de travail.

Si l'un de ces fichiers manque, continuer sans le signaler. Le skill
`/domain-modeling` les crée au besoin.

## Structure

```
/
├── GLOSSARY.md
├── PROTOCOL.md
└── docs/adr/
    ├── 0001-pieges-a-corriger-et-a-preserver.md
    └── …
```

## Employer le vocabulaire du glossaire

Quand une production nomme un concept du domaine (titre d'issue, proposition
de refactoring, hypothèse, nom de test), employer le terme défini dans
`GLOSSARY.md` ou `PROTOCOL.md`. Ne pas glisser vers les synonymes que le
glossaire liste sous « Éviter ».

Si le concept n'existe pas encore dans le glossaire, c'est un signal : soit
on invente un langage que le projet n'emploie pas (à reconsidérer), soit il
y a un vrai manque (à noter pour `/domain-modeling`).

## Signaler les conflits avec un ADR

Si une production contredit un ADR existant, le dire explicitement plutôt
que de passer outre en silence :

> _Contredit l'ADR 0003 (couche serveur du candidat), mais mérite d'être
> rouvert parce que…_

Un ADR au statut `superseded` (comme l'ADR 0002) ne fait plus foi : suivre
celui qui le remplace.
