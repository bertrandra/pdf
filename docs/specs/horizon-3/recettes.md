# Les recettes : enregistrer un montage, l'appliquer à un dossier

## Le problème

Une assistante de cabinet reçoit chaque semaine quarante relevés bancaires : elle garde les deux premières pages,
retire la page de publicité, tourne l'annexe et numérote. Aujourd'hui, elle refait les mêmes gestes quarante fois.
Le montage (ADR-0001) est déjà une suite d'opérations pures sur des références de pages : il ne manque que de
**nommer cette suite, la garder et la rejouer** sur d'autres fichiers.

## Ce que la personne fait

- *En tant que* personne qui refait souvent les mêmes gestes, *je veux* enregistrer ce que je viens de faire en
  recette, *pour* l'appliquer à un autre fichier d'un clic.
- *En tant que* personne qui traite des lots, *je veux* appliquer une recette à tout un dossier et retrouver les
  résultats dans un autre, *pour* ne plus ouvrir les fichiers un à un.
- *En tant qu'* équipe (Organisation), *je veux* partager nos recettes en fichier, *pour* que tout le monde produise
  les mêmes documents.

### Le parcours

1. **Enregistrer.** Après quelques gestes sur un document, « Enregistrer comme recette… » ouvre une boîte : le nom de
   la recette, la liste lisible des étapes (« Garder les pages 1 à 2 », « Tourner la page 3 à droite »), chacune
   qu'on peut retirer, et le modèle de nom de sortie (`{nom}-extrait.pdf`). Action primaire : « Enregistrer la
   recette », qui télécharge `extrait-releves.recette.json` (et la garde dans la liste de la page, voir *Garder*).
2. **Appliquer à un fichier.** Le menu « Recettes » liste les recettes connues ; en choisir une sur le document
   ouvert l'applique comme un geste ordinaire : une seule entrée d'historique, qu'« Annuler » défait.
3. **Appliquer à un dossier.** « Appliquer à un dossier… » : choisir le dossier d'entrée, le dossier de sortie, voir
   l'aperçu du lot (« 40 fichiers, 2 refusés : chiffrés »), puis l'action primaire « Appliquer aux 38 fichiers ». La
   roue d'attente dit « Fichier 12 sur 38 », et « Annuler » arrête après le fichier en cours. À la fin, un tableau :
   un fichier par ligne, ce qui est sorti ou pourquoi rien n'est sorti. Rien n'est jamais écrasé.
4. **Importer.** Déposer un `.recette.json` sur la page l'ajoute à la liste, après validation (version, étapes
   connues) ; un fichier invalide est refusé en le nommant, sans lever.

## Le format

Une recette ne parle **jamais d'identifiants** (`p12`, `s3`) : ils n'existent que dans une séance. Elle parle de
**positions écrites comme une personne les écrit** (`"1-2, 5"`, base 1, lues par `engine/plages.ts`), évaluées sur le
montage tel qu'il est à cette étape.

```ts
// model/recette.ts
export const FORMAT_RECETTE = 'pdf/recette';
export const VERSION_RECETTE = 1;

/** Des pages, comme on les ecrit (« 1-3, 7, 10- »), lues sur le montage de l'etape. */
export type Plage = string;

export type Etape =
  | { readonly op: 'garder'; readonly pages: Plage }
  | { readonly op: 'retirer'; readonly pages: Plage }
  | { readonly op: 'pivoter'; readonly pages: Plage; readonly sens: 1 | -1 }
  | { readonly op: 'inverser'; readonly pages: Plage }
  | { readonly op: 'deplacer'; readonly pages: Plage; readonly avant: number }  // avant : position ecrite, base 1 ; total + 1 pour la fin
  | { readonly op: 'dupliquer'; readonly pages: Plage };                         // horizon 0, n° 7

/** Les fichiers d'entree : un a la fois, ou tous ceux du dossier mis bout a bout dans l'ordre des noms. */
export type Entrees = { readonly type: 'chacun' } | { readonly type: 'ensemble'; readonly tri: 'nom' };

export type Sortie =
  | { readonly type: 'pdf'; readonly nom: string }                                // modele de nom : voir « Noms de sortie »
  | { readonly type: 'scission'; readonly regle: RegleScission; readonly nom: string };

export interface Recette {
  readonly format: typeof FORMAT_RECETTE;
  readonly version: typeof VERSION_RECETTE;
  readonly nom: string;
  readonly entrees: Entrees;
  readonly etapes: readonly Etape[];
  readonly sortie: Sortie;
}
```

`RegleScission` est celle d'`engine/montage.ts`, dont les positions passent en base 1 dans le fichier (une personne
peut lire et corriger la recette à la main) et en base 0 en mémoire.

Exemple, tel qu'il s'écrit sur le disque :

```json
{"entrees":{"type":"chacun"},"etapes":[{"op":"garder","pages":"1-2, 4"},{"op":"pivoter","pages":"3","sens":1}],"format":"pdf/recette","nom":"Extrait des relevés","sortie":{"nom":"{nom}-extrait.pdf","type":"pdf"},"version":1}
```

### Canonique

Une recette a **une seule** écriture en octets (`util/json.ts`, `canonique(valeur): string`), pour qu'elle se compare,
se hache (la preuve en dépend) et se diffuse sans bruit :

- clés triées par points de code UTF-16 (le sous-ensemble de RFC 8785 qui nous concerne), aucun espace ;
- chaînes en NFC, échappements minimaux de JSON ;
- **entiers seulement** : aucun nombre à virgule n'est admis dans le format, ce qui évite toute question de
  sérialisation des flottants ;
- fin sans saut de ligne ; UTF-8 sans BOM.

Lire tolère l'indentation et l'ordre des clés ; écrire rend toujours la forme canonique. Une clé inconnue est un
refus (« Cette recette vient d'une version plus récente de la page »), jamais ignorée en silence.

### Versions

`version` monte à chaque changement de sens d'une étape existante ou d'ajout d'étape. La page lit toutes les versions
antérieures (une table de migrations pures `v1 → v2`, testées), et refuse une version plus récente en le disant.

### Noms de sortie

Le modèle de nom n'admet que des variables pures : `{nom}` (le nom d'entrée sans `.pdf`), `{n}` (le rang dans une
scission, sur autant de chiffres qu'il faut, comme `nomsDesParties`), `{pages}` (le nombre de pages). Pas de date du
jour : elle rendrait le lot non rejouable. Le nom est nettoyé en pur (`engine/nommage.ts`, partagé avec
`classer-nommer.md`) : caractères interdits sous Windows, noms réservés (`CON`, `NUL`…), longueur, et collisions
résolues par ` (2)`, ` (3)` dans l'ordre du lot.

## Le calcul

```ts
// engine/recette.ts — pur
export type LectureRecette = { readonly recette: Recette } | { readonly erreur: string };
export function lireRecette(texte: string): LectureRecette;
export function ecrireRecette(r: Recette): string;                      // canonique(r)

/** Applique les etapes une a une. Une plage hors du document refuse le fichier, en nommant l'etape. */
export function appliquer(r: Recette, m: Montage): { readonly montages: readonly Montage[] } | { readonly erreur: string };

/** La description lisible d'une etape, pour la boite et le tableau du lot. */
export function decrire(e: Etape): string;
```

`appliquer` traduit chaque étape en ids par `lirePlages` puis `idsAuxPositions`, et appelle les opérations existantes
(`garderPages`, `pivoterPages`…). Elle ne connaît ni fichier ni octet : le lot vit dans `zones/Lots.tsx`, qui lit,
appelle `appliquer`, puis `assembler`.

### Enregistrer ce qu'on vient de faire

Les verbes de `zones/atelier.ts` agissent sur des ids. Pour qu'une séance devienne une recette, chaque verbe ajoute
son étape **en positions** à un journal, et l'historique empile des paires `{ montage, journal }` au lieu de montages
seuls : annuler retire aussi l'étape. Les gestes qui n'ont pas d'étape (ajouter un fichier au milieu, glisser une page
venue d'un autre fichier) coupent le journal : la boîte dit « Seuls les gestes faits après l'ouverture du dernier
fichier sont enregistrés ».

Un glisser continu (même `cle` d'historique) donne **une** étape `deplacer`, pas une par pixel.

## Lire et écrire un dossier

`io/dossier.ts` est le seul module qui touche au système de fichiers :

```ts
export interface Dossier {
  lister(): Promise<readonly { nom: string; taille: number }[]>;     // les .pdf, tries par nom (Intl.Collator 'fr', numeric)
  lire(nom: string): Promise<Uint8Array>;
  ecrire(nom: string, octets: Uint8Array): Promise<'ecrit' | 'existe'>; // jamais d'ecrasement
}
export function dossierDisponible(): boolean;                          // showDirectoryPicker existe
export function choisirDossier(mode: 'read' | 'readwrite'): Promise<Dossier | 'annule'>;
```

- **Avec l'API d'accès aux fichiers** (Chromium, Edge) : `showDirectoryPicker`, lecture fichier par fichier, écriture
  dans le dossier de sortie choisi. Un seul fichier en mémoire à la fois : un lot de 2 Go passe.
- **Sans elle** (Firefox, Safari) : `<input type="file" webkitdirectory>` pour lire (tout le dossier arrive en
  `File`, lus un à un), et la sortie part en **une archive ZIP** (`export/zip.ts`), avec un plafond annoncé
  (« au-delà de 2 Go, découpez le lot ») parce que l'archive se fait en mémoire.
- **Dans un artefact claude.ai** : sortie par l'hôte, comme aujourd'hui ; un fichier, ou une archive.

## Garder les recettes

Une recette est **un fichier** : c'est la forme qui se partage, se versionne dans un dépôt d'équipe, se relit. La page
garde aussi la liste des recettes importées dans le stockage du navigateur (une commodité, perdue sans dommage),
et l'offre Organisation peut livrer un dossier `recettes/` servi avec la page, lu par `io/modeles.ts`, que personne
ne peut modifier depuis la page.

## Accessibilité

- La liste des étapes est une liste ordinaire, chaque étape avec son bouton « Retirer l'étape 2 ».
- Le tableau du lot est un `<table>` avec en-têtes ; la région `polite` annonce seulement le début, chaque dixième
  fichier et la fin (« 38 fichiers écrits, 2 refusés »), comme la conversion.
- Une action primaire par écran : « Enregistrer la recette », puis « Appliquer aux 38 fichiers ».

## Offre

Pro : enregistrer, appliquer à un fichier, appliquer à un dossier. Organisation : recettes servies avec la page,
imposées ou proposées, et journal du lot exporté avec les preuves (`preuve-de-fabrication.md`). Lire une recette pour
voir ce qu'elle fait est gratuit.

## Tests

- **Unitaires** (`tests/unit/engine/recette.test.ts`) : chaque étape contre l'opération qu'elle appelle ;
  `lireRecette(ecrireRecette(r))` rend `r` ; `ecrireRecette` est stable quel que soit l'ordre des clés reçu ; refus
  nommés (version future, clé inconnue, plage hors document, nombre à virgule) ; migrations.
- **`util/json.ts`** : vecteurs de RFC 8785 restreints aux entiers et chaînes, NFC, caractères hors BMP.
- **Fichiers témoins** (`tests/unit/engine/recettes/*.recette.json`, commis : ce sont des textes, pas des PDF) : la
  forme canonique de chaque exemple de la documentation ; un changement de forme fait échouer le test.
- **Bout en bout** : un lot de trois PDF témoins (`tests/aide/pdfs.ts`), dont un chiffré ; sortie ZIP (Playwright n'a
  pas de sélecteur de dossier) ; les octets de chaque PDF sorti égaux à ceux du même montage fait à la main ;
  `axe-core` sur la boîte et le tableau.
- **Journal** : faire, annuler, refaire, puis enregistrer rend les étapes attendues.

## Risques et questions ouvertes

- **Positions ou contenu ?** « Garder les pages 1-2 » casse si un relevé a une page de garde de plus. Des étapes par
  contenu (« la page qui contient “Annexe” ») demandent le texte de la page, donc pdf.js dans le lot : à garder pour
  une version 2, et seulement en pur sur le texte extrait.
- **Fichiers chiffrés ou abîmés dans le lot** : refusés un par un, jamais l'arrêt du lot.
- Faut-il des recettes **à plusieurs entrées nommées** (« la lettre, puis l'annexe ») ? Utile pour fusionner des paires
  de fichiers ; complique les entrées. Reporté.
- Les étapes de l'horizon 1 (numéroter, filigrane, compresser) entreront dans le format en version 2 ; elles changent
  les octets écrits, donc chacune vient avec son ADR.

## Livraison

1. `util/json.ts`, `model/recette.ts`, `engine/recette.ts` et leurs tests ; importer et appliquer à un fichier.
2. Le journal dans l'historique ; « Enregistrer comme recette… ».
3. `io/dossier.ts` ; lots avec sortie ZIP, puis dossier de sortie.
4. Recettes servies avec la page (Organisation).

## ADR

- **ADR-0012 — Les recettes : un format canonique et versionné** (positions écrites plutôt qu'identifiants, JSON
  canonique sans flottants, refus des versions futures, journal dans l'historique).
- **ADR-0013 — Lire et écrire un dossier** (API d'accès aux fichiers, repli ZIP, jamais d'écrasement).
