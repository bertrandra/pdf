# Feuille de route

Ce qui reste à faire, par ordre d'utilité, et ce qui pourrait passer dans une offre premium. Rien de ceci n'est
décidé : une ligne qui déplace un octet écrit passe d'abord par un ADR et une version majeure.

## Ce qui perd des données ou du temps

1. **Signets, formulaires et liens internes perdus à la fusion.** `export/assemblage.ts` copie les pages par
   `copyPages`, qui n'emporte ni `/Outlines` ni `/AcroForm` : un contrat fusionné perd sa table des matières et ses
   champs ne se remplissent plus. Reconstruire les signets des pages gardées, fusionner les champs. Change les
   octets écrits : ADR, version majeure.
2. **Scinder relit chaque source autant de fois qu'il y a de parties.** `enregistrerScission` appelle `assembler` par
   partie, et chaque appel refait `PDFDocument.load` de toutes les sources : 300 lectures complètes pour scinder
   300 pages une à une. Charger une fois, assembler toutes les parties. Mêmes octets.
3. **Rien ne survit à un rechargement, et rien ne prévient.** Pas de garde `beforeunload` quand le montage n'est pas
   vide. La garde d'abord ; la reprise de séance (IndexedDB) ensuite.
4. **Une conversion longue ne s'annule pas.** Deux cents pages d'OCR tiennent la page sous la roue d'attente. Un
   `AbortSignal` jusqu'à `convertir`, et « Annuler » sur la roue.

## Ce qui ferme la porte à des fichiers ou des usages

5. **Les PDF protégés par un mot de passe propriétaire sont refusés** (relevés bancaires, factures : ils s'ouvrent
   sans mot de passe mais interdisent la modification). Au moins dire lequel des deux cas c'est ; pdf.js sait les
   montrer, pdf-lib ne sait pas les réécrire.
6. **Pas de PDF cherchable.** L'OCR ne sert qu'à Word et PowerPoint. Écrire le scan avec une couche de texte
   invisible réutilise `engine/ocr.ts` presque tel quel ; une sortie nouvelle, aucun octet existant ne bouge.
7. **Outils de page absents** : dupliquer une page (`assembler` sait déjà poser deux fois la même), insérer une page
   blanche, numéroter les pages, exporter les pages en images.

## Tests

8. **L'état de la page est à peine testé** : `zones/atelier.ts` n'a qu'un test (`nomDeSortie`) ; l'ajout de
   fichiers, l'annulation et l'oubli des octets ne sont couverts que par le navigateur. `io/conversion.ts` et
   `io/apercu.ts` n'ont aucun test unitaire.
9. **`lecture.test.ts` écrit le bruit de pdf-lib sur stderr** (« Invalid object ref ») : le faire taire dans le test.

## Détails

- Les octets d'une source vivent deux fois (`octets.current` et pdf.js par `declarerSource`) : gênant près de
  `TAILLE_MAX`.
- `ajouterFichiers` garde les fichiers lus quand un autre échoue : sans doute voulu, mais aucun test ne le dit.

## Offre premium : ce qui passerait dedans

### Le principe

Gratuit, ce que tout le monde donne gratuitement ailleurs ; premium, ce qui coûte du calcul ou qu'on ne trouve pas
ailleurs sans envoyer ses fichiers. **Une correction ne devient jamais premium** : un PDF fusionné qui perd ses
signets est un défaut, pas une option.

| Gratuit | Premium |
|---|---|
| Fusionner, ranger, tourner, inverser, supprimer | **Conversion en Word et PowerPoint, texte modifiable à sa place** (ADR-0006) |
| Découper, extraire, scinder (ZIP compris) | **OCR des pages scannées** (ADR-0007), dans toutes les sorties |
| Grille zoomable, aperçu en grand | **PDF cherchable** (n° 6) |
| Signets et formulaires gardés (n° 1) | **Numéroter les pages, filigrane, exporter en images** (n° 7) |
| Annuler une conversion, garde avant de quitter (n° 3, 4) | **Reprise de séance** : le travail retrouvé après un rechargement (n° 3) |
| Conversion en Word texte au fil, sans OCR | Fichiers au-delà d'une taille ou d'un nombre de pages (à fixer) |

Pourquoi ces deux-là en tête : la conversion fidèle et l'OCR local sont ce qui distingue la page (les services en
ligne le font, mais en envoyant le fichier), et ce sont les travaux les plus lourds. Le « Word texte au fil » sans
OCR reste gratuit : il fait goûter la conversion sans la donner.

### Ce que la promesse « rien ne quitte l'ordinateur » impose

- **La licence se vérifie hors ligne** : une clé signée (Ed25519), vérifiée par WebCrypto avec une clé publique
  incluse dans la page. Pas d'appel à un serveur, sinon la règle du réseau tombe (un test de navigateur la vérifie).
  La vérification vit dans `io` ; le cœur pur n'en sait rien, il reçoit seulement « premium oui ou non ».
- **Elle dissuade, elle n'empêche pas** : la page est un fichier HTML autonome, n'importe qui peut en retirer le
  verrou. Si l'on veut une vraie barrière, il faut ne pas livrer le code premium dans la page gratuite (deux
  constructions : `pdf.html` et `pdf-premium.html`, et les modèles OCR seulement dans la seconde), ce qui allège aussi
  la page gratuite.
- **La licence du dépôt** (`UNLICENSED`, dépôt privé) est à trancher avant toute distribution payante.
- La décision mérite un ADR (ADR-0008) : la frontière gratuit/premium, la forme de la clé, les deux constructions.
