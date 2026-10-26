# Classer et nommer un lot de scans

## Le problème

Un scanner de bureau rend un seul PDF de 60 pages : trois factures, deux relevés, un avis d'imposition, un courrier,
mis bout à bout, nommés `SCAN_0042.pdf`. Les trier à la main prend vingt minutes : trouver où chaque document commence,
le découper, lire la date et l'émetteur, renommer, ranger. Tout ce qu'il faut est déjà dans la page (OCR, découpe,
scission) ou dans l'horizon 3 (plongements, modèle local, recettes, dossiers) : il reste à l'assembler.

## Ce que la personne fait

- *En tant que* indépendant, *je veux* déposer mon scan du mois et obtenir un fichier par document, nommé
  « 2026-10 Facture EDF.pdf », *pour* les ranger sans les ouvrir.
- *En tant que* secrétariat, *je veux* traiter tout un dossier de scans et retrouver les documents rangés par type,
  *pour* les verser dans la GED.
- *En tant que* personne prudente, *je veux* tout relire et corriger avant que rien ne s'écrive.

### Le parcours

1. Ouvrir un ou plusieurs scans (ou choisir un dossier, `recettes.md`, *Lire et écrire un dossier*), puis
   « Classer et nommer… ».
2. La page reconnaît le texte des pages qui n'en ont pas (OCR, ADR-0007), propose des **coupures** et, pour chaque
   document, un **type**, une **date**, un **émetteur** et un **nom**. La roue d'attente dit l'étape et la page.
3. La **relecture** (`zones/Classer.tsx`) : la grille montre des séparateurs entre documents ; on en ajoute ou en
   retire au clavier (`/` sur la page choisie) ou à la souris. À côté, un tableau, un document par ligne : vignette de
   la première page, pages, type (liste), date, émetteur, nom final, tous modifiables. Une proposition peu sûre est
   marquée « à vérifier » et vient en tête.
4. Action primaire : « Enregistrer les 7 documents » — dans un dossier de sortie (sous-dossiers par type, si on le
   choisit), ou dans une archive ZIP. Rien n'est écrasé.
5. Facultatif : « Enregistrer comme recette » garde le **modèle de nom** et les **règles de rangement** (pas les
   coupures, propres à chaque scan) pour le prochain lot.

## Ce qui est figé, ce qui est proposé (ADR-0010)

Les coupures, types, dates, émetteurs et noms sont des **propositions** tant que la relecture est ouverte. À
« Enregistrer », ils deviennent un `Classement` figé ; l'écriture ne lit que lui :

```ts
// model/ia.ts (suite)
export type TypeDocument =
  | 'facture' | 'releve' | 'courrier' | 'contrat' | 'avis-imposition' | 'bulletin-paie' | 'attestation' | 'autre';

export interface DocumentClasse {
  readonly pages: readonly string[];          // ids de PageMontee, dans l'ordre
  readonly type: TypeDocument;
  readonly date: string | null;               // AAAA-MM-JJ, AAAA-MM ou null
  readonly emetteur: string | null;
  readonly nom: string;                       // nom final, nettoye, unique dans le lot
}
export interface Classement { readonly documents: readonly DocumentClasse[] }

export interface Proposition<T> { readonly valeur: T; readonly sure: boolean; readonly origine: 'regle' | 'modele' }
```

Chaque document s'écrit par `assembler` sur le montage réduit à ses pages : un PDF classé est fait des pages du scan,
intactes, et sa preuve de fabrication (`preuve-de-fabrication.md`) s'écrit comme pour une scission. **L'OCR ne change
pas le PDF écrit** : il sert à lire, pas à écrire (le PDF cherchable est une autre fonction, horizon 1).

## Les algorithmes

Le principe : **les règles d'abord, le modèle ensuite**. Ce qu'une règle pure sait trouver (une date, un numéro de
page, une page blanche) ne passe pas par un modèle : c'est plus juste, plus rapide, testable et identique partout.

### 1. Le texte de chaque page

Texte de la page s'il en a (`texteDePage`), sinon OCR (`pageScannee`, sans écrire le fond). Une page blanche (aucune
ligne sûre, et l'image presque uniforme : test de pixels pur) est notée `blanche`.

### 2. Les coupures (`engine/classement.ts`, pur sauf les vecteurs reçus)

Pour chaque frontière entre la page *i* et *i+1*, un score qui additionne des indices :

| Indice | Effet |
|---|---|
| Page *i+1* blanche (feuille séparatrice) | coupure forte ; la page blanche est retirée |
| « Page 1/3 », « 1 sur 3 », « - 1 - » en haut ou en bas de *i+1* | coupure forte |
| « Page 2/3 » sur *i+1* | pas de coupure, forte |
| Un en-tête d'émetteur (bloc du haut) différent de celui de *i* | coupure moyenne |
| Une date de document différente | coupure faible |
| Similarité des plongements de *i* et *i+1* (`multilingual-e5-small`) sous un seuil | coupure faible |
| Un nouveau numéro de facture, de relevé ou de dossier | coupure moyenne |

Les poids et le seuil se règlent sur le corpus témoin (à mesurer). Le résultat est une liste de coupures, chacune
avec son score : sous un seuil haut, elle est marquée « à vérifier ».

### 3. Le type, la date, l'émetteur

- **Date** (`engine/classement.ts`, pur) : expressions françaises et anglaises (« 12 mars 2026 », « 12/03/2026 »,
  « 2026-03-12 », « March 12, 2026 », « mars 2026 »), avec priorité aux dates près de « Date », « Le », « Émis le »,
  « Période du », et rejet des dates d'échéance et de naissance par mots voisins. Plusieurs dates : la plus ancienne
  près d'un mot de date de document.
- **Type** : mots-clés pondérés d'abord (« FACTURE », « N° de facture », « TVA » ; « RELEVÉ DE COMPTE », « IBAN » ;
  « AVIS D'IMPÔT » ; « BULLETIN DE PAIE », « Net à payer »…). Si les mots-clés hésitent, le **modèle local**
  (`modele-local.md`) reçoit le texte de la première page et une liste fermée de types, et doit répondre par un seul
  mot de la liste ; toute autre réponse vaut `autre`, marqué « à vérifier ».
- **Émetteur** : le SIREN ou SIRET s'il y en a un (sa clé de Luhn vérifiée en pur), la raison sociale qui l'entoure ;
  sinon le premier bloc du haut de la page ; sinon le modèle, en extraction (« donnez le nom de l'organisme
  émetteur tel qu'il est écrit »), et la réponse n'est gardée **que si elle figure mot pour mot dans le texte de la
  page**. Un émetteur inventé ne passe pas.

### 4. Le nom (`engine/nommage.ts`, partagé avec `recettes.md`)

Un modèle de nom à variables : `{date:AAAA-MM} {type} {emetteur}` par défaut, réglable. Variables : `{date}`,
`{date:AAAA}`, `{date:AAAA-MM}`, `{type}` (libellé français : « Facture », « Relevé »…), `{emetteur}`, `{pages}`,
`{n}` (rang dans le lot). Une variable vide disparaît avec l'espace qui la précède. Puis le nettoyage commun :
caractères interdits, noms réservés de Windows, 120 caractères au plus, collisions en ` (2)`. Rangement facultatif en
sous-dossiers `{type}` ou `{date:AAAA}`.

## Les modules

| Module | Couche | Rôle |
|---|---|---|
| `engine/classement.ts` | 3 | Indices, scores de coupure, dates, mots-clés de types, SIREN |
| `engine/nommage.ts` | 3 | Modèle de nom, nettoyage, collisions, sous-dossiers |
| `io/ia.ts` | 4 | Plongements et questions fermées au modèle (`modele-local.md`) |
| `io/dossier.ts` | 4 | Lire un dossier, écrire dans des sous-dossiers (`recettes.md`) |
| `zones/Classer.tsx` | 6 | La relecture : séparateurs sur la grille, tableau des documents |

```ts
// engine/classement.ts
export interface PageLue { readonly page: string; readonly texte: string; readonly blanche: boolean; readonly vecteur?: Float32Array }
export function coupures(pages: readonly PageLue[], poids?: Poids): readonly { apres: number; score: number; sure: boolean }[];
export function dateDuDocument(texte: string): Proposition<string | null>;
export function typeParMotsCles(texte: string): Proposition<TypeDocument> | null;   // null : le modele tranche
export function emetteur(texte: string): Proposition<string | null>;
export function classementPropose(pages: readonly PageLue[], decisions: Decisions): readonly PropositionDocument[];

// engine/nommage.ts
export function nommer(modele: string, d: Omit<DocumentClasse, 'nom' | 'pages'> & { pages: number; n: number }): string;
export function nettoyer(nom: string): string;
export function departager(noms: readonly string[]): string[];
```

## Sans WebGPU, sans modèle

Tout marche **sans le modèle de langue** : coupures par règles et plongements (en WebAssembly), date et émetteur par
règles, type par mots-clés ; ce que les règles ne savent pas trancher reste `autre`, « à vérifier ». Le modèle
n'améliore que les cas difficiles. Sans plongements non plus (poste très faible), les coupures se font par règles
seules. La page dit lequel des trois niveaux est actif.

## Budgets

L'OCR domine : environ deux secondes par page (ADR-0007), soit deux minutes pour un scan de 60 pages ; les
plongements ajoutent quelques secondes (à mesurer), le modèle quelques secondes par document hésitant. La roue
d'attente le dit, et « Annuler » garde ce qui est déjà lu pour reprendre. Un seul scan en mémoire à la fois dans un
lot de dossier.

## Accessibilité

- Les séparateurs sont des éléments de la grille annoncés (« Début du document 3 : Facture ») ; `/` coupe ou recolle
  avant la page choisie, comme les autres touches de la `listbox`.
- Le tableau des documents est un `<table>` avec des champs étiquetés par ligne (« Nom du document 3 ») ; « à
  vérifier » est un texte, pas une couleur.
- La région `polite` annonce : « 7 documents proposés, 2 à vérifier » ; puis « 7 documents enregistrés ».
- Une action primaire : « Enregistrer les 7 documents ».

## Offre

Pro : classer et nommer un ou plusieurs scans ouverts. Organisation : un dossier entier en lot, rangement en
sous-dossiers, modèles de nom et listes de types propres à l'organisation (livrés avec la page), preuves du lot.

## Tests

- **Unitaires** : dates (une centaine de formes françaises et anglaises, pièges : échéance, naissance, « 31/02 »),
  SIREN et SIRET (clé), mots-clés de types, coupures sur des suites de pages décrites en texte, nommage (variables
  vides, caractères interdits, collisions, ordre stable), et la règle « émetteur présent mot pour mot ».
- **Corpus témoin** (`tests/ia/corpus/scans/`) : 50 documents synthétiques fabriqués par `tests/aide/pdfs.ts`
  (factures, relevés, courriers d'émetteurs fictifs), mis bout à bout dans 8 scans, avec et sans séparateurs, en
  texte et en image. Métriques : coupures justes (précision et rappel), types justes, dates justes, noms exacts.
  Objectif à fixer après une première mesure ; le corpus mesure aussi chaque changement de poids.
- **Bout en bout** : un scan de 3 documents, relecture, une coupure corrigée au clavier, enregistrement en ZIP ; les
  PDF sortis ont exactement les octets d'une scission faite à la main aux mêmes coupures ; `axe-core` ; aucune requête
  extérieure. Le modèle est l'assistant factice de `modele-local.md`.

## Risques et questions ouvertes

- **Données personnelles dans les noms** : « 2026-10 Bulletin de paie Martin Dupont.pdf » finit dans un dossier
  partagé. Le modèle de nom par défaut n'inclut pas de nom de personne ; l'émetteur est une organisation.
- **Documents mêlés** : un recto-verso scanné à l'envers, une page d'un document glissée dans un autre. Hors de portée
  d'une coupure ; la relecture permet de déplacer une page d'un document à l'autre (glisser, comme dans la grille).
- **Liste des types** : figée pour le français ; l'offre Organisation voudra la sienne (« Ordonnance », « Compte
  rendu opératoire »…), ce qui suppose des mots-clés fournis par l'organisation. Format à définir.
- **Pont avec Factur-X** (horizon 2) : une facture classée est la bonne entrée pour proposer sa Factur-X.

## Livraison

1. `engine/nommage.ts` et `engine/classement.ts` (règles seules) ; relecture et écriture en ZIP. Utile sans aucun
   modèle.
2. Coupures par plongements.
3. Type et émetteur par le modèle, en question fermée et extraction vérifiée.
4. Lots de dossiers, sous-dossiers, recettes de nommage (Organisation).

## ADR

- **ADR-0015 — Classer et nommer un lot de scans** : règles d'abord, modèle en question fermée ou en extraction vérifiée
  mot pour mot, coupures relues avant toute écriture, PDF faits des pages intactes, noms sans donnée personnelle par
  défaut.
- S'appuie sur ADR-0009 et ADR-0010 (`modele-local.md`) et ADR-0013 (`recettes.md`).
