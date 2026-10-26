# La preuve de fabrication : de quoi refaire un PDF à l'octet près

## Le problème

Un PDF assemblé (ADR-0002) est déjà reproductible : mêmes sources, même montage, même version de pdf-lib, mêmes
octets (`tests/unit/export/assemblage.test.ts`). Mais personne d'autre que la page ne le sait, et rien ne garde ce qu'il
faudrait pour le montrer. Un avocat qui produit une pièce, un archiviste qui verse un dossier, un auditeur qui
reçoit un extrait veulent pouvoir dire : **ce fichier sort exactement de ces sources, par ces gestes**, et le faire
vérifier par n'importe qui, sans tiers de confiance et sans réseau.

## Ce que la personne fait

- *En tant que* personne qui produit une pièce, *je veux* enregistrer avec mon PDF une preuve de sa fabrication,
  *pour* qu'on puisse vérifier qu'il n'a rien d'autre que les pages des sources annoncées.
- *En tant que* destinataire, *je veux* déposer la preuve, les sources et le PDF reçu, *pour* savoir s'ils
  correspondent, page à page.
- *En tant qu'* organisation, *je veux* que chaque fichier d'un lot ait sa preuve, *pour* tenir un journal d'audit.

### Le parcours

1. **Écrire.** Une case « Enregistrer aussi la preuve de fabrication », dans la boîte d'enregistrement (cochée par
   défaut dans l'offre Organisation). Le PDF part avec un second fichier, `contrat.pdf.preuve.json` ; une scission ou
   un lot partent dans l'archive avec une preuve par fichier.
2. **Vérifier.** « Vérifier une preuve… » (gratuit, pour tout le monde) : déposer la preuve, les sources, et
   facultativement le PDF à contrôler. Les sources se reconnaissent **par leur empreinte**, pas par leur nom. Action
   primaire : « Vérifier ». Le verdict est l'un de :
   - « Conforme : ce PDF est exactement celui que ces sources et ces gestes produisent. » ;
   - « Différent : refait, le PDF n'a pas les mêmes octets » (avec les pages qui diffèrent, par la taille et le
     contenu de chaque page refaite) ;
   - « Incomplet : il manque la source “annexe.pdf” (empreinte 3f2a…) » ;
   - « Version : cette preuve a été écrite par pdf 2.x ; ouvrez-la avec cette version » (voir *Versions*).

## Ce qu'une preuve couvre, et ce qu'elle ne couvre pas

- **Couvre** : les PDF écrits par `export/assemblage.ts`, c'est-à-dire fusionner, découper, scinder, pivoter, ranger,
  numéroter (ADR-0008), et les étapes futures qui restent dans pdf-lib (filigrane, une fois son ADR écrit).
- **Ne couvre pas** les conversions en PowerPoint ou en Word : leurs images de page sont dessinées par pdf.js dans un
  canevas, dont les pixels changent d'un navigateur, d'une carte graphique ou d'un pilote à l'autre (ADR-0002 : rien de
  ce que pdf.js dessine n'est reproductible). La case ne s'offre pas pour une conversion, et la boîte dit pourquoi.
- **Ne couvre pas** le PDF cherchable (ADR-0008) : ses pages sont celles des sources, mais sa couche de texte vient de
  Tesseract sur un rendu de pdf.js, pour la même raison.
- **Ne couvre pas** ce qu'un modèle a proposé (`modele-local.md`, `classer-nommer.md`) : seule la **décision figée**
  (un découpage, une page gardée) entre dans la recette, donc dans la preuve. Le modèle n'y figure pas.
- **N'est pas une signature** : n'importe qui peut écrire une preuve. Elle prouve la **reproductibilité**, pas
  l'origine ni la date. L'origine viendra de la signature PAdES (horizon 1), qui pourra signer la preuve elle-même.

## Le format

```ts
// model/preuve.ts
export const FORMAT_PREUVE = 'pdf/preuve';
export const VERSION_PREUVE = 1;

export interface Empreinte { readonly octets: number; readonly sha256: string }   // sha256 en hexadecimal minuscule

export interface Preuve {
  readonly format: typeof FORMAT_PREUVE;
  readonly version: typeof VERSION_PREUVE;
  /** Ce qui a ecrit : la page, et la bibliotheque dont les octets dependent. */
  readonly outil: { readonly nom: 'pdf'; readonly version: string; readonly pdfLib: string };
  /** Les sources, dans l'ordre de leur premiere apparition dans le montage. Le nom est indicatif. */
  readonly sources: readonly (Empreinte & { readonly nom: string })[];
  /** Le montage reduit a ce qu'assembler lit : des pages par rang de source, sans identifiant de seance. */
  readonly pages: readonly { readonly source: number; readonly index: number; readonly rotation: Quart }[];
  /** La numerotation du montage (ADR-0008), si elle y est : elle change les octets ecrits. */
  readonly numerotation?: Numerotation;
  /** La recette, si le fichier vient d'une recette (recettes.md) : dit le pourquoi, pas le comment. */
  readonly recette?: Recette;
  readonly sortie: Empreinte & { readonly nom: string };
}
```

Exemple :

```json
{"format":"pdf/preuve","outil":{"nom":"pdf","pdfLib":"1.17.1","version":"2.0.0"},"pages":[{"index":0,"rotation":0,"source":0},{"index":2,"rotation":90,"source":1}],"sortie":{"nom":"dossier.pdf","octets":48213,"sha256":"…"},"sources":[{"nom":"lettre.pdf","octets":12034,"sha256":"…"},{"nom":"annexe.pdf","octets":40211,"sha256":"…"}],"version":1}
```

- Écrite en **JSON canonique** (`util/json.ts`, voir `recettes.md`) : clés triées, entiers seulement, NFC, sans espace.
  Une preuve a donc une seule forme en octets, et peut elle-même être hachée, signée ou citée.
- `pages` suffit pour refaire : c'est l'entrée exacte d'`assembler`. `recette` est une explication, pas une entrée :
  si elle est présente, la vérification contrôle aussi qu'appliquée aux sources elle rend bien ces `pages`.
- Les identifiants de séance (`s1`, `p12`) n'y sont pas : ils dépendent de l'ordre des gestes, pas du résultat.
- **Aucune date.** Une preuve horodatée ne se referait pas à l'identique ; l'horodatage, s'il en faut un, est une
  couche à part (voir *Questions ouvertes*).

### Pourquoi à côté du PDF, et pas dedans

Mettre la preuve dans le PDF (fichier joint, métadonnées XMP) change ses octets, donc son empreinte, donc la preuve :
le serpent se mord la queue. Et le PDF écrit doit rester celui qu'écrivait la version sans preuve. La preuve est un
**fichier voisin**, `<nom>.preuve.json` ; une scission ou un lot en ont une par fichier, plus un `lot.preuves.json`
qui les liste (canonique, trié par nom de sortie).

## Le calcul

```ts
// engine/preuve.ts — pur (l'empreinte est donnee, pas calculee ici)
export function preuveDe(m: Montage, empreintes: ReadonlyMap<string, Empreinte>, sortie: Empreinte & { nom: string },
                         outil: Preuve['outil'], recette?: Recette): Preuve;
export function lirePreuve(texte: string): { readonly preuve: Preuve } | { readonly erreur: string };
export function ecrirePreuve(p: Preuve): string;                         // canonique
/** Le montage a refaire, a partir des sources deposees, reconnues par empreinte. */
export function montageDe(p: Preuve, deposees: ReadonlyMap<string /* sha256 */, PageSource[]>):
  { readonly montage: Montage; readonly manquantes: readonly string[] };
export type Verdict =
  | { readonly type: 'conforme' }
  | { readonly type: 'different'; readonly pages: readonly number[] }
  | { readonly type: 'incomplet'; readonly manquantes: readonly { nom: string; sha256: string }[] }
  | { readonly type: 'version'; readonly attendue: string };
```

```ts
// io/empreinte.ts — WebCrypto (crypto.subtle.digest('SHA-256')), present aussi dans Node pour les tests
export async function empreinte(octets: Uint8Array): Promise<Empreinte>;
```

`crypto.subtle` est une API du navigateur : elle vit dans `io`, et le cœur reçoit des empreintes déjà calculées. Les
sources ouvertes ont leur empreinte calculée à la lecture (`zones/atelier.ts`, une fois par source, en tâche de fond),
pour qu'écrire une preuve ne relise rien.

### Vérifier

1. Lire et valider la preuve (format, version, champs).
2. Comparer `outil.version` (majeure) et `outil.pdfLib` à ceux de la page. Différents : verdict `version`, sans
   refaire — refaire avec un autre pdf-lib rendrait « différent » à tort.
3. Hacher les sources déposées, les reconnaître par sha256 ; manquantes : verdict `incomplet`.
4. Refaire le montage (`montageDe`), assembler, hacher. Égal à `sortie.sha256` : la fabrication est reproductible.
5. Si un PDF est déposé, comparer son empreinte à `sortie` ; différent : refaire page à page (taille, rotation,
   empreinte du flux de contenu de chaque page copiée) pour dire **quelles** pages diffèrent.

## Versions

La reproductibilité est promise **à version majeure égale** (CLAUDE.md : un changement d'octet écrit est une version
majeure). Pour que toute preuve reste vérifiable des années après, chaque version majeure publiée reste en ligne, à
une adresse stable (`/v2/pdf.html`), avec son sha256 dans le `CHANGELOG.md` ; l'offre Organisation la reçoit dans son
paquet. Le verdict `version` donne l'adresse de la bonne page.

## Accessibilité

La boîte de vérification est un formulaire ordinaire : trois zones de dépôt qui sont aussi des boutons de fichier, la
liste des sources reconnues (« lettre.pdf : reconnue », « annexe.pdf : manquante »), et un verdict écrit en clair, que
la région `polite` annonce. Le verdict ne repose jamais sur la couleur seule.

## Offre

Vérifier est **gratuit**, partout : une preuve que seuls les clients peuvent vérifier ne vaut rien. Écrire une preuve
est dans l'offre Organisation (avec le journal d'un lot), comme le prévoit la feuille de route ; la question de
l'ouvrir aux Pro reste ouverte.

## Tests

- **Unitaires** : `preuveDe` puis `montageDe` rend un montage qui assemble les mêmes octets ; JSON canonique stable ;
  refus nommés ; une source déposée deux fois sous deux noms est reconnue une fois ; une page montée deux fois.
- **Fichiers témoins** : une preuve commise (`tests/unit/engine/preuves/fusion.preuve.json`) pour deux PDF témoins
  fabriqués par `tests/aide/pdfs.ts`. Le sha256 de la sortie y est écrit en dur : **c'est un cliquet de la promesse
  de l'ADR-0002**. Le jour où une mise à jour de pdf-lib ou d'`assembler` le fait échouer, c'est une version majeure,
  et le test le dit avant la release.
- **Bout en bout** : enregistrer avec preuve, puis vérifier dans une seconde page : « Conforme » ; modifier un octet du
  PDF : « Différent » avec la bonne page ; retirer une source : « Incomplet ».

## Risques et questions ouvertes

- **pdf-lib n'est plus maintenu activement** : la promesse lie la preuve à une version figée de pdf-lib. Un jour, il
  faudra peut-être en changer ; les anciennes pages publiées garderont les anciennes preuves vérifiables.
- **Horodatage** : une date fiable demande un tiers (RFC 3161), donc le réseau. Hors de la page gratuite ; l'offre
  Organisation pourrait viser une autorité d'horodatage interne. À trancher.
- **Signer la preuve** (PAdES ou une signature détachée de la preuve canonique) : dépend de l'horizon 1.
- **Sources volumineuses** : hacher 500 Mo prend quelques secondes (à mesurer) ; le faire à l'ouverture, en tâche de
  fond, pour ne jamais retarder l'enregistrement.

## Livraison

1. `io/empreinte.ts`, `model/preuve.ts`, `engine/preuve.ts`, le fichier témoin et son cliquet.
2. La case dans l'enregistrement et la scission ; la preuve dans l'archive.
3. La boîte « Vérifier une preuve… ».
4. Le journal d'un lot (`lot.preuves.json`) et les pages des versions majeures publiées.

## ADR

- **ADR-0014 — La preuve de fabrication** : un fichier voisin en JSON canonique, sans date ; les PDF assemblés
  seulement, jamais les conversions ; reproductibilité promise à version majeure égale, anciennes versions servies ;
  vérifier est gratuit.
