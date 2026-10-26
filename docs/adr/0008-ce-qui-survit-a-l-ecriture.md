# ADR-0008 — Ce qui survit à l'écriture, et ce qu'on y ajoute

## Contexte

`assembler` (ADR-0002) copiait les pages par `copyPages` de pdf-lib, qui ne copie que les pages. Mesuré sur un PDF
témoin à signets, liens et formulaire (`tests/aide/pdfs.ts`, `pdfStructure`) dont on garde deux pages :

| | Avant | Après |
|---|---|---|
| Signets | aucun | ceux des pages gardées |
| Liens internes | vers des copies orphelines des pages visées | vers la page posée, ou retirés |
| Champs de formulaire | aucun formulaire (`/AcroForm` absent) | les champs des widgets posés |
| Objets `/Page` dans le fichier | 6 pour 2 pages | 2 |

Un lien vers une autre page, et le `/P` de chaque annotation, entraînaient dans le fichier une copie de la page
visée (et, pour un lien, tout ce qu'elle dessine), hors de l'arbre des pages. L'étape 0 de la feuille de route
ajoute en outre ce qui s'écrit **par-dessus** une page : des numéros, et la couche de texte invisible d'un scan.

## Décision

**Ce qui suit les pages** (`export/structure.ts`, `engine/signets.ts`) :

- Chaque source chargée est **préparée une fois, avant toute copie** : chaque annotation perd son `/P`, chaque lien
  interne (`/Dest`, ou action `GoTo`, destination nommée comprise) voit sa page remplacée par son index. La copie ne
  suit donc plus aucune page. Seule la lecture en mémoire change : les octets d'une source, jamais.
- **Après avoir posé les pages**, chaque annotation retrouve sa page, chaque lien la page posée qu'il visait (sa
  première place si elle est posée deux fois), et un lien vers une page absente de ce document est retiré.
- **Signets** : un signet est gardé si sa page est posée, ou s'il a un descendant gardé (il mène alors à la première
  page gardée sous lui). L'ordre de l'arbre ne change pas, ses états ouvert/fermé (`/Count`) non plus ; les arbres
  des sources se suivent dans l'ordre de leur première page. Une source qui s'ouvre sur ses signets
  (`/PageMode /UseOutlines`) fait de même pour le document écrit.
- **Formulaire** : les champs racines des widgets posés, élagués des widgets restés sur des pages non posées. Deux
  champs différents de même nom (deux sources, une page posée deux fois) partageraient leur valeur : le second
  devient `nom_2`. `/DA`, `/Q`, `/NeedAppearances` viennent de la première source qui en a, les polices de `/DR` de
  toutes. Les signatures, le XFA et la structure balisée ne suivent pas : une signature ne survit de toute façon à
  aucune réécriture.
- **Les objets orphelins** (que rien n'atteint depuis la racine) sont retirés avant l'écriture.

**Une scission** charge et prépare ses sources une fois pour toutes ses parties (`preparer`, puis `assemblerPrepare`
par partie) : scinder 300 pages une à une lisait le fichier 300 fois. Mêmes octets dans les deux cas (testé).

**Ce qu'on ajoute par-dessus** (`export/surimpression.ts`, `geometry/repere.ts`, `engine/numerotation.ts`) :

- Le texte se place dans le **repère vu** (origine en haut à gauche, page tournée comme à l'écran) et se convertit
  dans le repère de la page pour les quatre quarts de tour : un numéro reste en bas et à l'endroit sur une page tournée.
- Il s'écrit dans un flux à part, **après** celui de la page, qui est entouré de `q`/`Q` : un état graphique laissé
  ouvert par la page ne le déplace pas.
- La police est l'Helvetica standard, jamais embarquée, et sa clé de ressource est fixe (`/PdfF1`…). pdf-lib en
  **tire une au hasard** (`uniqueKey`, `Math.random`) : l'utiliser rendrait deux écritures différentes.
- Un caractère hors de WinAnsi devient « ? » ; les nombres s'écrivent à quatre décimales, sans zéro négatif.
- **La numérotation** est une propriété du montage (`Montage.numerotation`) : elle s'annule comme un geste, et chaque
  fichier d'une scission recommence à son premier numéro.
- **Le PDF cherchable** recopie les pages telles quelles ; seule une page sans aucun texte (un scan) reçoit une
  couche de texte invisible (mode de rendu 3), une ligne par cellule reconnue (`engine/ocr.ts`, `lignesDeCouche`),
  étirée (`Tz`) pour couvrir la largeur lue, sur sa ligne de base.

## Conséquences

- **Version majeure** : pour les mêmes sources et le même montage, un PDF qui a des signets, des liens ou des
  annotations s'écrit autrement qu'avant. Un PDF sans rien de tout cela garde ses octets (testé : ni `/Outlines` ni
  `/AcroForm` n'apparaissent).
- Le PDF cherchable, comme les conversions (ADR-0005), dépend du rendu de pdf.js et de Tesseract sur la machine :
  ses pages sont celles des sources, à l'octet près, mais sa couche de texte peut différer d'un navigateur à l'autre.
- Hors de portée : les calques (`/OCProperties`), les pièces jointes, la structure balisée (PDF/UA, horizon 2).
- Vérifié par `tests/unit/export/structure.test.ts` (signets, liens, champs, scission, orphelins), `numeros.test.ts`
  (position lue par pdf.js sur des pages tournées), et dans le navigateur (`tests/e2e/page.e2e.ts`).
