# Plan de construction

Une spec par étape. On ne commence pas une étape avant que la précédente
remplisse son critère de fin.

## Architecture cible

```
migrabench/
├── fixtures/legacy-app/   # Struts 1.3 + JSP, Tomcat 9, Docker, pièges volontaires
├── oracle/                # scénarios Playwright validés sur le legacy
├── gates/                 # portes : a11y, perf, sécurité, types
├── runner/                # CLI : lance un candidat, exécute oracle + portes, écrit du JSON
├── report/                # rapport HTML comparatif
├── candidates/            # sorties des agents (outil × run)
├── skills/                # skills de migration écrits pour l'étude
└── PROTOCOL.md
```

## Étapes

### 0. Cadrage
`PROTOCOL.md` relu et validé.
**Fini quand** : chaque critère a une métrique et un outil de mesure.

### 1. Application legacy de test
Struts 1.3.10 + JSP, build Maven, Tomcat 9 / JDK 8 dans Docker. Trois écrans :

1. **Recherche de dossiers** : formulaire, `validation.xml`, tableau `<logic:iterate>`,
   messages `<html:errors/>`.
2. **Fiche dossier** : formulaire d'édition, champ verrouillé selon un état
   serveur, raccourci clavier d'enregistrement, ordre de tabulation défini.
3. **Remise** : action réservée à un rôle, contrôlée côté serveur.

Pièges à planter (un par ligne, documentés dans `fixtures/legacy-app/TRAPS.md`) :

- `<bean:write filter="false">` sur un champ alimenté par l'utilisateur (XSS) ;
- un secret lu par `System.getenv()` dans un scriptlet ;
- un contrôle de rôle fait dans un scriptlet ;
- des règles de saisie présentes seulement dans `validation.xml` ;
- un raccourci clavier et un `focus` initial ;
- une mise en page en `<table>` imbriquées.

**Fini quand** : `docker compose up` sert les trois écrans avec un jeu de données fixe.

### 2. Oracle
Scénarios Playwright avec sélecteurs sémantiques (`getByRole`, `getByLabel`),
paramétrés par `BASE_URL`. Parcours nominaux, erreurs de validation, clavier
seul, enregistrement HAR.
**Fini quand** : 100 % vert sur 5 exécutions consécutives contre le legacy.

### 3. Contrat de candidat et runner
`candidate.json` (commande de build, commande de démarrage, URL). CLI
`migrabench run --candidate <dossier>` qui démarre le candidat, rejoue
l'oracle et écrit un résultat JSON.
**Fini quand** : le legacy, déclaré comme candidat, obtient 100 %.

### 4. Portes
axe-core, Lighthouse, test XSS, scan de secrets dans le bundle, test de rôle
côté API, `tsc --noEmit`, audit des dépendances.
**Fini quand** : chaque porte sort un JSON au même format, testée sur un
candidat volontairement défectueux.

### 5. Score et rapport
Agrégation sur N runs (médiane, min, max), `migrabench report` génère une page HTML.
**Fini quand** : un tableau comparatif lisible sans explication orale.

### 6. Runs d'agents
Prompt figé et versionné, 2 ou 3 outils, 3 à 5 runs chacun, coût relevé.
**Fini quand** : premières mesures réelles dans `candidates/`.

### 7. Skills
Un skill d'inventaire Struts (lit `struts-config.xml`, `validation.xml`, les
JSP) et un skill de migration. Relance des runs avec et sans.
**Fini quand** : l'effet du cadrage est mesuré.

### 8. Synthèse
Catalogue des pièges observés, limites du banc, README final.
**Fini quand** : le dépôt se présente seul.
