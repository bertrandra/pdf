# ADR-0003 — Une grille de vignettes zoomable, et un aperçu en grand

## Contexte

Pour fusionner, découper ou scinder, on doit voir beaucoup de pages à la fois (où couper ?), puis en lire une
(est-ce la bonne ?). Un seul zoom ne sert pas les deux : une vue de lecteur continue cache la structure, une
grille fixe ne laisse pas lire.

## Décision

- **La grille** est le lieu du travail : choisir, ranger, couper. Elle se zoome par **paliers de largeur**
  (`PALIERS_VIGNETTE`, de 72 à 520 px) : curseur et boutons de la barre, + et − au clavier, Ctrl+molette (et le
  pincement d'un pavé tactile, qui arrive en molette). Une page tient dans un carré du palier, pour que portrait
  et paysage s'alignent.
- **L'aperçu** ouvre une page en grand (double clic, Entrée). Il se zoome en pourcentage (`ECHELLES_APERCU`), ou
  s'ajuste à la page entière ou à la pleine largeur, qui suivent la taille de la fenêtre ; Ctrl+molette zoome en
  continu et garde sous le pointeur le point visé (`defilementAncre`).
- Tout le calcul est pur (`engine/zoom.ts`) ; les composants ne passent que la place mesurée et le geste.
- Un dessin ne se refait qu'en franchissant un palier de rendu (`largeurDeRendu`), densité de l'écran comprise ;
  les vignettes ne se dessinent qu'à l'approche de la vue (`IntersectionObserver`).

## Conséquences

- Un document de plusieurs centaines de pages reste fluide : seules les vignettes proches de la vue coûtent.
- Au-delà de 4 096 px, l'aperçu s'agrandit sans plus de détail ; le dire serait un chantier si le besoin vient.
