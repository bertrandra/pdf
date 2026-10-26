# Feuille de route

Rien de ceci n'est décidé. Une ligne qui déplace un octet écrit passe d'abord par un ADR et une version majeure ; une
sortie nouvelle (un format, un outil) n'en déplace aucun.

## L'ambition

**Devenir l'atelier PDF de ceux qui n'ont pas le droit d'envoyer leurs fichiers** : cabinets d'avocats, notaires,
santé, ressources humaines, comptabilité, administrations. Aujourd'hui, ils ont le choix entre Acrobat (cher, lourd)
et des sites en ligne (interdits par le RGPD, le secret professionnel ou la politique de sécurité). La page a déjà ce
que ni l'un ni l'autre n'a ensemble : **tout se fait sur l'ordinateur, et le même travail rend les mêmes octets**.

Trois paris en découlent :

1. **Le local comme argument de vente, pas comme limite.** Tout ce que les services en ligne font sur leurs serveurs
   (OCR, conversion, compression, et maintenant l'IA), la page le fait dans le navigateur. Une page HTML statique se
   déploie sur un intranet en copiant un dossier : pas de serveur à homologuer, pas de contrat de sous-traitance RGPD.
2. **La reproductibilité comme preuve.** Un montage est une recette pure (ADR-0001) : il se rejoue, s'archive, se
   vérifie. Pour un juriste ou un archiviste, « ce PDF sort exactement de ces sources » vaut de l'or.
3. **Coller aux obligations françaises.** Facturation électronique (Factur-X), anonymisation (RGPD),
   accessibilité (RGAA), archivage (PDF/A) : des contraintes légales qui créent un besoin qu'on ne choisit pas.

## Horizon 0 — le socle (fait)

Ce qu'il fallait réparer avant de vendre quoi que ce soit. **Fait**, sauf mention contraire (ADR-0008, `CHANGELOG.md`) :

| N° | Quoi | Où |
|---|---|---|
| 1 | Signets, liens, champs suivent les pages ; plus de page orpheline | `export/structure.ts`, `engine/signets.ts` |
| 2 | Une scission lit ses sources une fois | `preparer` / `assemblerPrepare` |
| 3 | Confirmation avant de quitter ; **la reprise de séance reste à faire** (offre Pro) | `zones/Application.tsx` |
| 4 | « Arrêter » une scission ou une conversion (Échap) | `zones/atelier.ts`, `io/conversion.ts` |
| 5 | PDF protégé : mot de passe d'ouverture ou protection du propriétaire, dit tel quel ; **les rouvrir reste à faire** (déchiffrer demande RC4/AES dans `io`) | `io/apercu.ts`, `protectionDe` |
| 6 | PDF cherchable | `io/conversion.ts`, `export/surimpression.ts` |
| 7 | Dupliquer, page blanche, numéroter, images | `engine/montage.ts`, `engine/numerotation.ts`, `geometry/repere.ts` |
| 8 | État de la page testé en Node ; `io/conversion.ts` couvert dans le navigateur | `tests/unit/zones`, `tests/e2e` |
| 9 | Plus de bruit de pdf-lib sur stderr | `tests/unit/io/lecture.test.ts` |

Détails vérifiés : les octets d'une source sont gardés une fois sur le fil principal ; pdf.js en reçoit une copie
pour son fil de travail, qu'il détache — elle ne peut pas être partagée. La lecture partielle (un fichier refusé
n'empêche pas les autres) est testée (`integrerFichiers`).

Ce qui était relevé :

### Ce qui perd des données ou du temps

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

### Ce qui ferme la porte à des fichiers ou des usages

5. **Les PDF protégés par un mot de passe propriétaire sont refusés** (relevés bancaires, factures : ils s'ouvrent
   sans mot de passe mais interdisent la modification). Au moins dire lequel des deux cas c'est ; pdf.js sait les
   montrer, pdf-lib ne sait pas les réécrire.
6. **Pas de PDF cherchable.** L'OCR ne sert qu'à Word et PowerPoint. Écrire le scan avec une couche de texte
   invisible réutilise `engine/ocr.ts` presque tel quel ; une sortie nouvelle, aucun octet existant ne bouge.
7. **Outils de page absents** : dupliquer une page (`assembler` sait déjà poser deux fois la même), insérer une page
   blanche, numéroter les pages, exporter les pages en images.

### Tests

8. **L'état de la page est à peine testé** : `zones/atelier.ts` n'a qu'un test (`nomDeSortie`) ; l'ajout de
   fichiers, l'annulation et l'oubli des octets ne sont couverts que par le navigateur. `io/conversion.ts` et
   `io/apercu.ts` n'ont aucun test unitaire.
9. **`lecture.test.ts` écrit le bruit de pdf-lib sur stderr** (« Invalid object ref ») : le faire taire dans le test.

### Détails

- Les octets d'une source vivent deux fois (`octets.current` et pdf.js par `declarerSource`) : gênant près de
  `TAILLE_MAX`.
- `ajouterFichiers` garde les fichiers lus quand un autre échoue : sans doute voulu, mais aucun test ne le dit.


## Horizon 1 — l'atelier complet (3 à 6 mois)

Ce qui fait passer de « fusionner et convertir » à « je n'ouvre plus Acrobat ».

- **Remplir et signer.** Remplir les formulaires existants (les champs survivent déjà, n° 1), poser une signature
  dessinée ou importée, parapher toutes les pages. Puis la **signature électronique avancée (PAdES)** avec un
  certificat `.p12` importé, signée par WebCrypto, sans tiers : un contrat signé sans jamais quitter le poste.
- **Caviarder pour de vrai.** Un rectangle noir ne cache rien : le texte reste dessous. Retirer les opérations de
  texte et les pixels sous la zone (le filtre d'opérations de l'ADR-0006 sait déjà le faire), puis vérifier que rien
  ne se lit plus. Avec **l'anonymisation automatique** : noms, IBAN, numéro de sécurité sociale, téléphones, adresses,
  repérés en pur (`engine/`), validés page par page. C'est la fonction RGPD que les services en ligne ne peuvent pas
  vendre à un DPO.
- **Comparer deux versions.** Deux PDF d'un même contrat, et les différences surlignées, mot à mot (le texte se lit
  déjà ligne par ligne). Le besoin numéro un des juristes, cher chez les concurrents.
- **Annoter** : surligner, commenter, tamponner (« Copie conforme », « Payé »), aplatir les annotations à l'écriture.
- **Compresser** : réencoder les images trop lourdes, retirer les polices dupliquées, avec la taille avant/après.
  Le geste le plus demandé de tous ; un réglage figé rend les mêmes octets.
- **Exporter en Excel** : les tableaux reconnus (l'OCR garde déjà les colonnes) deviennent des feuilles, à la main
  comme `pptx.ts` et `docx.ts`.
- **S'installer** (PWA) : la page marche hors ligne, s'ouvre depuis le bureau, et « Ouvrir avec » un PDF la lance.

## Horizon 2 — les obligations françaises (6 à 12 mois)

- **Factur-X.** Depuis septembre 2026 toute entreprise doit recevoir des factures électroniques, les PME devront en
  émettre en septembre 2027. Une facture PDF devient Factur-X (PDF/A-3 avec son XML CII embarqué) : montants, TVA,
  SIREN lus par le texte ou l'OCR, proposés en pur, corrigés par la personne, vérifiés contre le profil. Dans l'autre
  sens, lire le XML d'une Factur-X reçue et l'exporter en tableur. Des centaines de milliers de TPE et d'indépendants
  concernés, et pas d'outil local simple.
- **PDF/A pour l'archivage** : polices embarquées, couleurs déclarées, métadonnées XMP figées (sans date, comme le
  reste), vérification de conformité avant d'écrire.
- **PDF accessible (PDF/UA, RGAA)** : structure balisée (titres, listes, ordre de lecture, texte alternatif) déduite
  de la mise en page déjà calculée par `engine/miseEnPage.ts`. Obligatoire pour les documents publiés par les
  administrations ; presque personne ne sait le faire.

## Horizon 3 — l'intelligence, sur place (12 mois et plus)

Spécifié dans `docs/specs/horizon-3/` : recettes, preuve de fabrication, modèle local, classer et nommer.

- **Un modèle de langue local** (WebGPU, épinglé par sha256 comme les modèles OCR, servi depuis `dist/`) : résumer
  un document, poser une question à un dossier de 300 pages et voir la page qui répond, traduire en gardant la mise
  en page (le texte est déjà en lignes à leur place). La règle ne bouge pas : aucune requête hors de la page.
- **Classer et nommer** : un lot de scans (factures, relevés, courriers) découpé par document, renommé
  (« 2026-10 Facture EDF.pdf ») et rangé, d'après ce qu'il dit.
- **Les recettes** : un montage est déjà une suite d'opérations pures ; l'enregistrer (« garder les pages 1-2,
  numéroter, filigrane Confidentiel, PDF/A ») et l'appliquer à un dossier entier (API d'accès aux fichiers). Le
  travail par lots, rejouable à l'octet près.
- **La preuve de fabrication** : avec chaque PDF écrit, sa recette et les empreintes sha256 des sources ; n'importe
  qui rejoue et retrouve les mêmes octets. Une piste d'audit sans tiers de confiance.

## L'offre

Gratuit ce que tout le monde donne ailleurs ; payant ce qui coûte du calcul, ce qu'on ne trouve pas sans envoyer ses
fichiers, et ce qu'une obligation légale rend nécessaire. **Une correction n'est jamais payante** : un PDF fusionné
qui perd ses signets est un défaut, pas une option.

| Gratuit | Pro (une personne) | Organisation (déployée chez soi) |
|---|---|---|
| Fusionner, ranger, tourner, découper, scinder | Tout le gratuit | Tout le Pro |
| Signets et formulaires gardés, annuler, garde avant de quitter | Word et PowerPoint modifiables, Excel | Déploiement intranet : un dossier statique, sans serveur ni appel sortant |
| Grille zoomable, aperçu | OCR, PDF cherchable | Licence de site, réglages imposés (OCR seul en français, IA coupée…) |
| Word texte au fil sans OCR | Remplir, signer, signature PAdES | Recettes partagées par l'équipe, modèles de caviardage maison |
| Compresser (un réglage) | Caviarder, anonymiser, comparer, annoter | Preuve de fabrication et journal d'audit |
| | Compression fine, numéroter, filigrane, images | Factur-X par lots, PDF/A, PDF/UA |
| | Factur-X à l'unité, PDF/A | IA locale sur les dossiers |
| | Recettes, lots, reprise de séance, IA locale | Support, version maintenue (LTS) |

L'offre **Organisation** est le vrai marché : une administration, un hôpital ou un cabinet ne peut pas acheter un
service en ligne, mais peut copier un dossier sur son intranet. Aucun concurrent n'est bâti pour ça.

### Ce que la promesse « rien ne quitte l'ordinateur » impose

- **La licence se vérifie hors ligne** : une clé signée (Ed25519), vérifiée par WebCrypto avec une clé publique
  incluse dans la page. Pas d'appel à un serveur, sinon la règle du réseau tombe (un test de navigateur la vérifie).
  La vérification vit dans `io` ; le cœur pur n'en sait rien, il reçoit seulement « premium oui ou non ».
- **Elle dissuade, elle n'empêche pas** : la page est un fichier HTML autonome, n'importe qui peut en retirer le
  verrou. Si l'on veut une vraie barrière, il faut ne pas livrer le code premium dans la page gratuite (deux
  constructions : `pdf.html` et `pdf-premium.html`, et les modèles OCR seulement dans la seconde), ce qui allège aussi
  la page gratuite.
- **La licence du dépôt** (`UNLICENSED`, dépôt privé) est à trancher avant toute distribution payante.
- La frontière entre les offres, la forme de la clé et les constructions séparées méritent un ADR (à numéroter :
  l'ADR-0008 est pris par ce qui survit à l'écriture) ; chaque
  horizon aussi, au moment de s'y engager (signature, Factur-X, IA locale : un ADR chacun, mesuré comme l'ADR-0007).

## Ce qui peut faire échouer le plan

- **La taille de la page.** Modèles OCR, IA, polices pour PDF/A : la page gratuite doit rester légère. Tout ce qui est
  lourd se charge à la demande, et seulement dans la construction qui l'utilise.
- **La justesse avant les fonctions.** Un caviardage qui laisse le texte, une Factur-X refusée par la plateforme, une
  signature invalide : chacune coûte plus de confiance que dix fonctions n'en rapportent. Chacune se livre avec ses
  témoins et un validateur externe en CI (veraPDF pour PDF/A et PDF/UA, le validateur Factur-X, la vérification
  PAdES).
- **Le navigateur a des limites** : mémoire (un PDF de 500 Mo), WebGPU absent sur certains postes. Dire ce qui ne
  marche pas plutôt que tomber.
