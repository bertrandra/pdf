# Les jetons de l’interface

Généré depuis `src/styles/` par `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/styles` : ne pas modifier à la main.

### Les fonds : la table de travail et les panneaux

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--table` | `#e9ecef` | `#121518` | Le fond de la page et de la grille de vignettes |
| `--panneau` | `#f7f8f9` | `#1a1e22` | Les barres, panneaux, cartes et boîtes : ce qui se pose sur la table |
| `--selection` | `#c6dde6` | `#2a4b5a` | Le fond d’une vignette choisie, et du texte sélectionné |
| `--survol` | `#dfe9ee` | `#20313a` | Le fond d’un bouton discret ou d’une vignette survolés : la couleur d’outil à peine posée |

### Les encres : le texte et ses nuances

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--encre` | `#15181d` | `#e6e9ec` | Le texte courant et les icônes |
| `--encre-douce` | `#555c66` | `#9aa3ad` | Le texte secondaire : aides, légendes, numéros de page |

### Les filets et séparations

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--filet` | `#cfd4da` | `#2f353c` | Les bordures et séparations ; décoratif, il ne porte jamais seul une information |
| `--filet-fort` | `#7d848d` | `#69717b` | Le bord qui doit se voir : contour d’une vignette, curseur du zoom |

### La couleur d’outil : une seule, pour l’action, la sélection et le focus

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--cyan` | `#00719c` | `#4fb3dc` | La couleur d’outil : action primaire, sélection, focus, repère d’insertion |
| `--cyan-fonce` | `#006186` | `#71c3e4` | L’action primaire survolée |
| `--sur-cyan` | `#ffffff` | `#08202b` | Le texte posé sur la couleur d’outil |

### Les messages : avertissement et échec, chacun avec son fond

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--alerte` | `#8a5a00` | `#e3b45a` | Avertissement : le texte |
| `--alerte-fond` | `#f8ecd2` | `#33280f` | Avertissement : le fond du message |
| `--echec` | `#a8322a` | `#f08b80` | Échec et geste destructif : le texte et le contour |
| `--echec-fond` | `#f7e0dd` | `#3a1c19` | Échec : le fond du message |

### Ce qui se voit derrière une page : le papier en attente de son aperçu

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--papier` | `#ffffff` | `#ffffff` | Le papier d’une page, avant et sous son aperçu : blanc dans les deux thèmes, comme une feuille |

### Les ombres et voiles, translucides

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--ombre` | `rgba(0, 0, 0, 0.18)` | `rgba(0, 0, 0, 0.5)` | L’ombre portée d’une page |
| `--voile` | `rgba(0, 0, 0, 0.45)` | `rgba(0, 0, 0, 0.6)` | Le voile derrière l’aperçu en grand et les boîtes |

### Contrastes exigés (WCAG 2.x AA, au moins 4.5:1)

| Paire | Clair | Sombre | Usage |
|---|---|---|---|
| `--encre` sur `--table` | 15.00 | 15.03 | texte sur la page |
| `--encre` sur `--panneau` | 16.73 | 13.76 | texte dans les panneaux |
| `--encre` sur `--selection` | 12.61 | 7.65 | numéro d’une vignette choisie |
| `--encre` sur `--survol` | 14.43 | 11.03 | bouton discret survolé |
| `--encre-douce` sur `--table` | 5.70 | 7.17 | numéros de page et aides sur la page |
| `--encre-douce` sur `--panneau` | 6.35 | 6.56 | aides dans les panneaux |
| `--cyan` sur `--panneau` | 5.14 | 7.04 | liens et état actif dans les panneaux |
| `--cyan` sur `--table` | 4.61 | 7.69 | liens sur la page |
| `--sur-cyan` sur `--cyan` | 5.47 | 7.04 | libellé de l’action primaire |
| `--sur-cyan` sur `--cyan-fonce` | 6.88 | 8.49 | libellé de l’action primaire survolée |
| `--alerte` sur `--alerte-fond` | 5.06 | 7.54 | message d’avertissement |
| `--echec` sur `--echec-fond` | 5.28 | 6.40 | message d’échec |
| `--echec` sur `--panneau` | 6.26 | 6.95 | geste destructif au repos |

### Contrastes exigés hors texte (WCAG 2.x 1.4.11, au moins 3:1)

| Paire | Clair | Sombre | Usage |
|---|---|---|---|
| `--filet-fort` sur `--panneau` | 3.55 | 3.39 | contour d’un champ, curseur du zoom |
| `--cyan` sur `--table` | 4.61 | 7.69 | contour d’une vignette choisie, repère d’insertion |
| `--cyan` sur `--selection` | 3.87 | 3.91 | contour d’une vignette choisie contre son propre fond |

### La typographie : cinq tailles nommées par leur rôle

| Jeton | Valeur | Rôle |
|---|---|---|
| `--texte-petit` | `0.75rem` | Aides, légendes, raccourcis, mesures et codes dans les panneaux, barre d’état (12 px) |
| `--texte-compact` | `0.8125rem` | Commandes denses : barre d’outils, numéros des vignettes, titres de section (13 px) |
| `--texte-corps` | `0.875rem` | Le texte courant, les boutons et les champs (14 px) |
| `--texte-titre` | `1rem` | Titres de panneau et de boîte (16 px) |
| `--texte-titre-page` | `1.5rem` | Le titre de la page, seul de son rang (24 px) |

### L’espacement : une base de 4, avec un pas de 6

| Jeton | Valeur | Rôle |
|---|---|---|
| `--esp-2xs` | `2px` | Entre deux éléments collés : onglets d’un groupe, icône et son repère |
| `--esp-xs` | `4px` | L’intérieur d’une barre, entre les outils |
| `--esp-s` | `6px` | Entre les lignes d’une liste, les boutons d’un groupe ; l’intérieur d’un bouton |
| `--esp-m` | `8px` | L’intérieur d’un champ ou d’un menu ; entre les éléments d’un panneau |
| `--esp-l` | `12px` | Entre deux cartes, l’intérieur d’un message, le côté d’un bouton |
| `--esp-xl` | `16px` | L’intérieur d’une carte ou d’une boîte, entre deux groupes |
| `--esp-2xl` | `24px` | Les marges de la page |
| `--esp-3xl` | `48px` | Le pied de la page, l’intérieur de la zone de dépôt vide |

### Les rayons : croissants avec la surface

| Jeton | Valeur | Rôle |
|---|---|---|
| `--rayon-pastille` | `4px` | Pastilles de couleur, vignettes, petites marques |
| `--rayon-champ` | `5px` | Champs, éléments de menu |
| `--rayon-bouton` | `6px` | Boutons, messages, onglets |
| `--rayon-menu` | `8px` | Menus déroulants, panneaux flottants |
| `--rayon-carte` | `10px` | Cartes, zones de dépôt, boîtes de dialogue |

### Les couches d’empilement

| Jeton | Valeur | Rôle |
|---|---|---|
| `--couche-glisser` | `5` | Le repère d’insertion pendant qu’on glisse des pages dans la grille |
| `--couche-barre` | `10` | La barre d’outils, collée en haut quand la grille défile |
| `--couche-apercu` | `1000` | L’aperçu d’une page en grand, au-dessus de la grille |
| `--couche-dialogue` | `1200` | Le voile et la boîte de scission |
| `--couche-attente` | `1300` | La roue d’attente au milieu de l’écran, au-dessus de tout pendant un travail |
