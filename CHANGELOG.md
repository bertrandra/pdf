# Journal des modifications

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et le projet le versionnage
sémantique : un changement des octets écrits pour les mêmes entrées est une version majeure.

## [Non publié]

### Ajouté

- La page : ajouter des PDF (bouton ou dépôt), les fusionner, ranger les pages (glisser, Alt+flèches), les tourner,
  inverser, supprimer, découper (ne garder que la sélection), extraire, et scinder en plusieurs fichiers (toutes les
  *n* pages, avant certaines pages, ou en parties écrites), livrés dans une archive ZIP.
- La grille de vignettes zoomable par paliers (curseur, + et −, Ctrl+molette), dessinée par pdf.js à la demande.
- L'aperçu d'une page en grand, zoomable en pourcentage, page entière, pleine largeur ou 100 %, Ctrl+molette ancré
  sous le pointeur, page précédente et suivante au clavier.
- La conversion en PowerPoint (une diapositive par page), en Word mise en page conservée (une page Word par page,
  à sa taille) ou en Word texte au fil (le texte en paragraphes), du document entier ou des pages choisies ;
  fichiers écrits sans dépendance, sans date ni auteur.
- Le texte converti reste modifiable : en PowerPoint et en Word mise en page conservée, chaque ligne devient une
  zone de texte à sa place, avec sa police, sa taille, son gras, son italique et sa couleur, sur le fond de la page
  dessiné sans son texte.
- Le choix de pages par plages écrites (`1-3, 7, 10-`).
- L'écriture reproductible par pdf-lib : mêmes sources et même montage, mêmes octets.
- Les jetons de couleur, de texte et d'espacement, repris de `svg`, avec leurs contrastes vérifiés dans les deux thèmes.
- Les garde-fous de `svg` : couches, pureté du cœur, cliquet de rigueur, tests de navigateur avec `axe-core`.
