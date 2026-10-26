# ADR-0004 — Un registre de jetons, repris de svg

## Décision

Les couleurs (`src/styles/jetons.ts`), les tailles de texte (`typographie.ts`) et les espacements, rayons et
couches (`espaces.ts`) sont la seule source des valeurs de l'interface, avec les mêmes valeurs que l'éditeur
`svg` pour que les deux outils se reconnaissent. Le CSS des variables se génère au build ; la feuille
`outils/pdf/page.css` n'écrit aucune valeur en dur, et `tests/unit/styles/jetons.test.ts` le vérifie, avec les
contrastes (4,5:1 pour le texte, 3:1 pour les bords qui informent) dans les deux thèmes. Pas de `color-mix()` :
une teinte mélangée est un jeton calculé, valable dans tous les navigateurs.

`docs/jetons.md` se régénère par `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/styles`.
