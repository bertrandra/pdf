# pdf

Fusionner, découper, scinder, numéroter des PDF et les convertir en PowerPoint, en Word, en PDF cherchable ou en
images, dans le navigateur. Une page autonome : les fichiers sont lus et écrits
sur place, rien ne part sur le réseau.

- **Fusionner** : ajoutez plusieurs PDF (bouton ou glisser-déposer, y compris sur la grille pour les insérer à un
  endroit précis) ; leurs pages se mettent à la suite.
- **Ranger** : glissez les vignettes, ou Alt+flèches ; tournez (R, Maj+R), inversez, dupliquez (Ctrl+D), supprimez,
  insérez une page blanche.
- **Garder la structure** : les signets, les liens internes et les champs de formulaire suivent les pages, dans la
  fusion, le découpage et la scission.
- **Découper** : choisissez des pages (clic, Maj+clic, Ctrl+clic, ou « Choisir les pages » : `1-3, 7, 10-`), puis
  « Découper » pour ne garder qu'elles, ou « Extraire… » pour les enregistrer à part.
- **Scinder** : toutes les *n* pages, avant certaines pages, ou en parties écrites (`1-3 / 4-8, 12 / 9-11`) ;
  plusieurs fichiers partent dans une archive ZIP, nommés `document-1.pdf`, `document-2.pdf`…
- **Convertir** : en PowerPoint (une diapositive par page) ou en Word (une page Word par page, à la même taille),
  le texte restant modifiable, chaque ligne à sa place avec sa police, sa taille et sa couleur ; ou en Word texte au
  fil (des paragraphes à réécrire, sans la mise en page). Le document entier ou les pages choisies. Une page
  scannée passe par la reconnaissance de caractères (Tesseract, modèles les plus justes, français et anglais), sur
  l'ordinateur même.
- **Numéroter** : « 3 », « 3 / 12 » ou « Page 3 sur 12 », dans un coin ou au centre, à l'endroit même sur une page
  tournée ; la couverture peut ne pas en porter.
- **PDF cherchable, images** : les pages scannées reçoivent une couche de texte invisible (on y cherche, on copie),
  le reste ne change pas ; ou une image PNG par page.
- **Zoomer** : la grille par paliers (curseur, + et −, Ctrl+molette), l'aperçu d'une page en grand (double clic ou
  Entrée) en pourcentage, page entière ou pleine largeur.

## Démarrer

```bash
npm ci
npm run construire   # dist/pdf.html, dist/pdfjs/
npm run servir       # http://localhost:5299/pdf.html
```

Pour la publier comme artefact claude.ai : `npm run artefact` écrit `dist/artefact/index.html`, à publier avec
`dist/pdfjs/` et `dist/ocr/` aux mêmes chemins ; l’hôte y demande confirmation avant chaque enregistrement.

La page demande un serveur (même local) : pdf.js, qui dessine les aperçus, se charge en module, ce que les
navigateurs refusent depuis `file://`.

## Architecture

Les mêmes couches que `svg` (`tests/unit/architecture.test.ts` les impose) :

| Couche | Rôle |
|---|---|
| `src/util` | primitives pures : `au`, historique, couleur |
| `src/geometry` | le passage du repère vu au repère d'une page |
| `src/model` | ce qu'est un montage : sources et références de pages |
| `src/engine` | le calcul pur : opérations de montage, plages de pages, sélection, zoom, texte en paragraphes, signets, numéros |
| `src/styles` | les jetons de l'interface |
| `src/export` | l'écriture : PDF (pdf-lib) et ce qui suit ses pages, surimpressions, PowerPoint et Word (à la main), ZIP |
| `src/io` | la lecture des fichiers, les aperçus (pdf.js), l'OCR (Tesseract), les téléchargements |
| `src/zones` | les composants React |

Les décisions sont dans `docs/adr/`, les consignes de travail dans `CLAUDE.md`.

## Vérifier

```bash
npm run verifier     # types, lint, cliquet de rigueur, tests unitaires
npm run e2e          # la page dans un vrai navigateur (après construire)
```
