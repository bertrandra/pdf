# ADR-0006 — Le texte converti reste modifiable, à sa place

## Contexte

ADR-0005 posait chaque page en image dans PowerPoint et dans Word « fidèle » : rien ne bougeait, mais rien ne se
modifiait. Ce qu'on attend d'une conversion, c'est de pouvoir corriger le texte sans perdre la page.

## Décision

Dans PowerPoint et dans Word « mise en page conservée », chaque page devient :

- un **fond** : la page dessinée par pdf.js **sans ses opérations de texte** (`showText` et ses variantes, sautées
  par `operationsFilter`) ; les images, aplats et traits restent, le texte n'y est plus ;
- une **zone de texte par ligne** posée à sa place (`engine/miseEnPage.ts`, `lignesPosees`), avec sa taille, sa
  direction, sa police, son gras et son italique (segments par style dans une même ligne) et sa couleur.

Choix précis :

- **Une ligne par zone, pas un paragraphe** : une police de remplacement un peu plus large reflowerait un
  paragraphe et le ferait déborder ; une ligne seule s'allonge un peu et reste à sa place. Un grand blanc (plus de
  trois fois la taille) coupe la ligne : deux cellules ou deux colonnes restent deux zones.
- **La police** se lit dans le nom de la fonte (`lirePolice` : préfixe de sous-ensemble retiré, mots séparés,
  polices standard ramenées à Arial, Times New Roman, Courier New) ; elle s'affiche si elle est installée chez
  celui qui ouvre le fichier, une police proche sinon. Les fontes ne sont pas embarquées.
- **La couleur** se lit en comparant la page dessinée avec et sans texte dans la boîte de la ligne
  (`couleurDuTexte`) : le PDF ne la donne pas avec le texte. Aucun pixel changé : le texte est invisible (la couche
  OCR d'un scan) ; PowerPoint le garde, transparent et modifiable ; Word ne sait pas le rendre transparent et ne le
  pose pas.
- **PowerPoint** : `p:sp` en zone de texte, sans marges, sans retour à la ligne ni ajustement, tournée si la ligne
  l'est. **Word** : un paragraphe encadré (`w:framePr`, ancré à la page) par ligne, avant le paragraphe du fond ;
  pas de rotation (Word ne tourne pas un cadre).
- « Word, texte au fil » (ADR-0005) reste pour qui veut réécrire plutôt que retoucher.

## Conséquences

- Deux rendus par page (avec et sans texte) : la conversion prend environ deux fois plus de temps.
- Une page scannée sans couche de texte reste une image : il n'y a pas de reconnaissance de caractères.
- Vérifié par python-pptx, python-docx et LibreOffice : chaque ligne est une zone de texte avec sa police, sa taille,
  son gras et sa couleur (un titre blanc sur un bandeau reste blanc), le fond ne porte plus de texte, rien n'est
  dédoublé ; une PDF à fontes en sous-ensemble (`BAAAAA+LiberationSans-Bold`) rend « Liberation Sans », gras.
