# ADR-0007 — La reconnaissance de caractères, la plus juste possible, sans rien envoyer

## Contexte

Une page scannée n'a pas de texte : convertie (ADR-0005, ADR-0006), elle restait une image. On veut qu'elle devienne
du texte modifiable, avec la meilleure justesse possible, sans que la page ne contacte aucun serveur.

## Décision

- **Tesseract 5 en WebAssembly** (`tesseract.js` 7.0.0, épinglé exactement), chargé à la demande depuis `dist/ocr/`
  comme pdf.js : `tesseract.min.js`, son travailleur, et le cœur **sans SIMD** (`tesseract-core-lstm.wasm.js`). Ni CDN,
  ni cache du navigateur (`cacheMethod: 'none'`) : un test de navigateur vérifie qu'aucune requête ne quitte la page.
- **Les modèles `tessdata_best`**, LSTM en virgule flottante, français et anglais, OEM 1 (réseau LSTM seul), image à
  **300 dpi**. Ils ne sont sur aucun registre de paquets : `scripts/modeles-ocr.mjs` les prend à l'étiquette `4.1.0`
  du dépôt officiel, vérifie taille et sha256 (`data/modeles-ocr.json`), les garde dans `.cache/ocr/` (ignoré par git,
  mis en cache par la CI) et les copie dans `dist/ocr/langues/`. Un fichier non conforme fait échouer la construction.
- **Mesuré, pas supposé** : neuf pages témoins (prose française, prose anglaise, facture ; propre, scannée, mauvaise :
  flou, bruit, inclinaison jusqu'à 1,6°, JPEG, basse résolution). Taux d'erreur par caractère :

  | Modèles | Erreurs | Temps (9 pages, Node) |
  |---|---|---|
  | `tessdata` standard, LSTM seul | 0,34 % | 6,6 s (cœur SIMD) |
  | `tessdata_best` entier (`best_int`) | 0,34 % | 6,4 s (cœur SIMD) |
  | **`tessdata_best` virgule flottante** | **0,10 %** | 18,1 s (cœur sans SIMD) |

  La prose est parfaite avec les trois ; la différence est sur la facture (chiffres, colonnes, euros), où les modèles
  flottants font trois fois moins d'erreurs. Ils n'ont pas de produit scalaire dans les cœurs SIMD (`DotProductSSE`
  manquant) : le cœur sans SIMD est imposé par son fichier exact, environ deux secondes par page.
- **Ce qui devient du texte** (`engine/ocr.ts`, pur) : une ligne dont la confiance moyenne atteint 55 et qui porte une
  lettre ou un chiffre ; le reste (taches, photos, tampons) reste dans l'image. Une ligne se coupe en cellules à un
  blanc de plus d'une fois et demie sa hauteur : les colonnes d'un tableau gardent leur place, et deviennent des
  tabulations dans « texte au fil ». La taille donne à Arial la hauteur de la ligne scannée ; l'angle suit la ligne de
  base (PowerPoint la tourne).
- **Le fond sans le texte** : chaque cellule reconnue est effacée de l'image à 300 dpi, couverte par la couleur médiane
  du papier autour d'elle, et sa couleur d'encre est lue avant (le cœur des lettres). Le texte modifiable se pose
  dessus, sans doublon.
- Quand : une page **sans texte visible** (pas de texte, ou seulement une couche OCR invisible) avec la case « Reconnaître
  le texte des pages scannées (OCR) », cochée par défaut. Sans elle, la page reste une image.

## Conséquences

- `dist/` grossit d'environ 23 Mo (`ocr/`), chargés seulement à la première page scannée.
- Pas de détection d'orientation : une page scannée de travers d'un quart de tour se tourne d'abord dans la grille (R).
- Deux langues seulement ; en ajouter une, c'est une ligne de `data/modeles-ocr.json` (taille, sha256) et
  `LANGUES_OCR`, et un temps de reconnaissance un peu plus long.
- Tesseract et ses modèles sont sous licence Apache 2.0.
