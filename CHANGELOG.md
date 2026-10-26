# Journal des modifications

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et le projet le versionnage
sémantique : un changement des octets écrits pour les mêmes entrées est une version majeure.

## [Non publié]

Version majeure (ADR-0008) : pour les mêmes sources et le même montage, un PDF à signets, liens ou annotations
s'écrit autrement. Un PDF sans rien de cela garde ses octets.

### Modifié

- Les signets, les liens internes et les champs de formulaire suivent les pages dans la fusion, le découpage et la
  scission : un signet dont la page est coupée part (ou mène à la première page gardée sous lui), un lien vers une
  page absente est retiré, deux champs de même nom venus de deux fichiers ne partagent plus leur valeur (`nom_2`).
- Un lien vers une autre page n'entraîne plus dans le fichier une copie orpheline de la page visée.
- Scinder lit chaque fichier une seule fois pour toutes les parties, au lieu d'une fois par partie.
- La boîte « Convertir » propose aussi le PDF cherchable et les images.

### Ajouté

- Arrêter une scission ou une conversion en cours (« Arrêter » sur la roue d'attente, ou Échap) ; rien n'est
  enregistré, et la page le dit.
- Le navigateur demande confirmation avant de fermer ou de recharger une page qui a du travail.
- PDF cherchable : les pages scannées reçoivent une couche de texte invisible, posée sur leurs lignes ; les autres
  pages ne changent pas. Le fichier s'appelle `<nom>-cherchable.pdf`.
- Export en images : une image PNG par page, à 150 dpi, en ZIP s'il y en a plusieurs.
- Numéroter les pages : position, format (« 3 », « 3 / 12 », « Page 3 sur 12 »), premier numéro, couverture sans
  numéro ; à l'endroit sur une page tournée, et annulable.
- Dupliquer les pages choisies (bouton ou Ctrl+D), insérer une page blanche de la taille de sa voisine.

### Corrigé

- Un PDF protégé dit s'il demande un mot de passe pour s'ouvrir, ou si son auteur en interdit seulement la
  modification (le cas des relevés et factures protégés).

- La page se charge chez un hébergeur qui ne donne pas de type aux fichiers `.mjs` (SiteGround) : pdf.js est livré en
  `.js`, et la construction refuse tout fichier `.mjs` dans `dist/`. Une source que pdf.js n'a pas pu ouvrir est
  rouverte au besoin, et c'est la vraie raison qui s'affiche, plus « Source inconnue ».

### Ajouté

- Une roue d’attente au milieu de l’écran pendant un travail long (lecture, écriture, conversion, OCR) : elle dit
  ce qui se fait, page par page, et la page ne se modifie pas pendant ce temps. Immobile avec « réduire les animations ».

- La page se publie comme artefact claude.ai (`npm run artefact`) : l’enregistrement passe alors par l’hôte, qui
  demande confirmation, et « Enregistrement annulé. » le dit si la personne refuse.

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
- Les modèles OCR sont servis compressés (gzip) : un cinquième de moins à charger.
- La reconnaissance de caractères (OCR) des pages scannées, dans les trois conversions : Tesseract avec les modèles
  `tessdata_best` les plus justes (français, anglais), sans rien envoyer ; le texte reconnu est effacé du scan et posé
  à sa place, modifiable, les colonnes d'un tableau gardées.
- Le choix de pages par plages écrites (`1-3, 7, 10-`).
- L'écriture reproductible par pdf-lib : mêmes sources et même montage, mêmes octets.
- Les jetons de couleur, de texte et d'espacement, repris de `svg`, avec leurs contrastes vérifiés dans les deux thèmes.
- Les garde-fous de `svg` : couches, pureté du cœur, cliquet de rigueur, tests de navigateur avec `axe-core`.
