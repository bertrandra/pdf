# ADR-0001 — Un montage de références de pages, des opérations pures, un historique

## Contexte

Fusionner, découper et scinder un PDF reviennent tous à choisir des pages de documents existants, dans un ordre,
avec une rotation. Copier les pages à chaque geste (dans un `PDFDocument` vivant) rendrait l'annulation coûteuse,
lierait l'interface à une bibliothèque mutable et rendrait la reproductibilité difficile à prouver.

## Décision

- Le document en cours est un **montage** (`src/model/montage.ts`) : des sources (nom, taille et rotation propre
  de chaque page) et une suite de pages montées `{ id, source, index, rotation }`. Les octets des sources vivent
  hors du modèle, dans la page (`zones/atelier.ts`), et ne sont jamais modifiés.
- Chaque opération (`src/engine/montage.ts`) est **pure** et rend un nouveau montage ; une opération sans effet
  rend le montage reçu. Fusionner = `ajouterSource` ; découper = `garderPages` ; scinder = `scinder`, qui rend
  plusieurs montages partageant les mêmes sources.
- Les identifiants viennent d'un **compteur** (`suivant`), jamais d'un tirage : un montage se rejoue à l'identique.
- L'historique est une pile de montages immuables (`util/historique.ts`, repris de `svg`).
- Les octets ne s'écrivent qu'à l'enregistrement (`export/assemblage.ts`).

## Conséquences

- Annuler et rétablir sont gratuits ; une source n'est oubliée (octets, aperçus) que quand plus aucun état de
  l'historique ne la monte.
- Une même page peut être montée deux fois ; l'écriture en fait deux copies.
- Ce qui n'est pas une page (signets, formulaires, liens internes entre documents) n'est pas repris par le
  montage ; un chantier futur le dira à l'ouverture plutôt que de le perdre en silence.
