# ADR-0005 — Convertir en PowerPoint et en Word

## Contexte

On demande souvent un PDF « en PowerPoint » ou « en Word ». Il n'existe pas de conversion sans perte : un PDF
pose des glyphes à des coordonnées, il ne connaît ni paragraphes, ni titres, ni zones de texte. Il faut donc
choisir ce qu'on garde, et le dire.

## Décision

Trois sorties, chacune avec ce qu'elle garde et ce qu'elle perd écrit dans la boîte « Convertir… » :

- **PowerPoint** (`export/pptx.ts`) : une diapositive par page, la page en image, entière et centrée. Une
  présentation n'a qu'une taille de diapositive : celle de la première page, bornée de 1 à 56 pouces.
- **Word, mise en page fidèle** (`export/docx.ts`, `ecrireDocxFidele`) : une page Word par page, à sa taille et
  son orientation (une section par page, bornée à 22 pouces), l'image ancrée derrière au coin de la page. Une image
  en ligne de la hauteur de la page pousserait une page blanche après chaque page.
- **Word, texte modifiable** (`ecrireDocxTexte`) : le texte de chaque page en paragraphes, recollés par une règle
  pure (`engine/texte.ts` : lignes, interligne, mots coupés), chaque page du PDF ouvrant une page Word
  (`pageBreakBefore`). La mise en page, les images et les tableaux sont perdus ; une page scannée reste vide (pas
  de reconnaissance de caractères).

Les images sont des JPEG à 150 dpi (4 000 px au plus sur le grand côté), dessinées par pdf.js sur fond blanc
(`io/apercu.ts`, `imageDePage`, sans cache). Les fichiers sont écrits à la main (`export/ooxml.ts`) dans le ZIP
de `export/zip.ts` : aucune dépendance, aucune date ni auteur, mêmes entrées mêmes octets. On peut convertir le
document entier ou les seules pages choisies.

## Conséquences

- Les fichiers sont vérifiés par des tests (relations, types de contenu, tailles en EMU et en twips), par le
  lecteur XML du navigateur en test de navigateur, et ont été ouverts par python-pptx, python-docx et LibreOffice
  (deux pages en sortie pour deux pages en entrée, sans page blanche).
- Les octets d'une image dépendent du navigateur qui l'encode : la reproductibilité vaut pour l'écriture des
  fichiers à images égales, pas d'un navigateur à l'autre.
- Des zones de texte modifiables posées à leur place dans PowerPoint, la reconnaissance de caractères ou la reprise
  des tableaux seraient des chantiers à part.
