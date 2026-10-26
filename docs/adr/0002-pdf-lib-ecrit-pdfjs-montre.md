# ADR-0002 — pdf-lib écrit, pdf.js montre

## Contexte

Il faut lire un PDF (nombre, taille et rotation des pages), en dessiner les pages, et en écrire un nouveau. Une
seule bibliothèque ne fait pas bien les trois : pdf.js dessine fidèlement mais n'écrit pas ; pdf-lib écrit et lit
la structure mais ne dessine pas.

## Décision

- **pdf-lib 1.17.1**, épinglé exactement, lit la structure (`io/lecture.ts`) et écrit (`export/assemblage.ts`).
  L'écriture se fait sans date, sans producteur et sans identifiant tiré (`updateMetadata: false`) : mêmes sources
  et même montage, mêmes octets (`tests/unit/export/assemblage.test.ts`).
- **pdfjs-dist 5.4.296**, épinglé exactement, ne sert qu'aux aperçus (`io/apercu.ts`). Il n'est pas empaqueté :
  `scripts/construire.mjs` recopie `pdf.min.mjs` et son fil de travail dans `dist/pdfjs/`, chargés au premier
  aperçu. `isEvalSupported: false`. Rien de ce qu'il dessine n'entre dans un fichier écrit.
- Au plus deux rendus à la fois ; un dessin se garde par page, rotation et largeur de rendu (400 au plus).

## Conséquences

- La page demande un serveur, même local (`npm run servir`) : un module ne se charge pas depuis `file://`.
- Monter de version de pdf-lib peut changer les octets écrits : c'est une version majeure, décidée et relue.
- Un PDF chiffré est refusé en le nommant ; le déchiffrer est un chantier à part.
