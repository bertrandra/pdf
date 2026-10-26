# CLAUDE.md — pdf

Consignes pour travailler dans ce dépôt. Le contexte est dans `README.md` et `docs/adr/`. Le dépôt suit
l'architecture de `svg` (mêmes couches, mêmes conventions, mêmes garde-fous).

## Le projet en une phrase

Une page autonome pour fusionner, découper, scinder, numéroter des PDF et les convertir en PowerPoint, en Word, en PDF
cherchable ou en images, avec une grille de vignettes zoomable et un aperçu en grand. **Un PDF écrit aujourd'hui doit l'être à l'identique demain** : mêmes sources et même montage,
mêmes octets. Un changement qui déplace un octet écrit est un événement de version majeure, jamais une
correction discrète.

## Vérifier avant de pousser

Ce que lance la CI (`.github/workflows/ci.yml`, job `verifier`) — tout doit passer en local d'abord :

```bash
npm run verifier     # typecheck && lint && cliquet && test
npm run construire   # dist/pdf.html, dist/pdfjs/ et dist/ocr/ (modèles OCR vérifiés, mis en cache)
npm run e2e          # la page dans un vrai navigateur (après construire)
```

- Dans le conteneur du cloud, le Chromium préinstallé n'est pas celui du paquet : lancer les tests de navigateur
  avec `CHEMIN_NAVIGATEUR=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome npm run e2e`.
- `tests/unit/architecture.test.ts` impose les couches : `util/shell` → `geometry` → `model/plateforme` →
  `engine/styles` → `core/io/render/export/interaction` → `ui` → `app/zones`. Une couche n'importe jamais une
  couche plus haute ; un dossier nouveau se classe dans `NIVEAU` avant d'exister.
- Le cœur pur (`util`, `model`, `engine`) ne touche ni au DOM, ni à l'horloge, ni au hasard, ni au réseau.
  pdf-lib vit dans `export` (écrire) et `io` (lire) ; pdf.js seulement dans `io/apercu.ts`, Tesseract dans `io/ocr.ts`.
- Pour voir la page : `npm run construire && npm run servir`, puis `http://localhost:5299/pdf.html`. Elle ne
  marche pas depuis `file://` : pdf.js se charge en module.

## Circuit d'une modification

1. Branche `claude/<sujet>` depuis `origin/main`. **Jamais de push direct sur `main`.**
2. `npm run verifier`, puis `npm run construire && npm run e2e` si l'interface a bougé.
3. Entrée dans `CHANGELOG.md`, sous `## [Non publié]` (Ajouté / Modifié / Corrigé), en français.
4. PR vers `main`, CI `verifier` et `navigateur` vertes, merge (commit de merge, pas de squash).
5. Un agent travaille dans un worktree sous `.claude/worktrees/` (ignoré par git) ; on le supprime, avec sa
   branche, dès que son travail est fusionné.

## Conventions

- Code et commentaires en français ; commentaires **sans accents** dans le code source, qui expliquent pourquoi.
  Textes de l'interface en français, avec accents, au vouvoiement.
- Messages de commit en français : un titre court, puis le pourquoi.
- Les tests vivent dans `tests/unit/<couche>/`, miroir de `src/` ; ceux du navigateur dans `tests/e2e/`. Les PDF
  témoins se fabriquent par `tests/aide/pdfs.ts`, jamais commis.
- Un index qu'on sait valide se lit par `au` (`util/tableaux.ts`), jamais par `!`.

## Décisions déjà prises

- **Un montage de références, pas des pages copiées** (ADR-0001) : `model/montage.ts` est une suite de
  `{ source, index, rotation }` vers des PDF qu'on ne modifie jamais. Fusionner, découper, scinder, pivoter,
  ranger sont des opérations pures (`engine/montage.ts`) qui rendent un nouveau montage ; l'historique
  (`util/historique.ts`) est une pile de montages. Les identifiants viennent d'un compteur, jamais d'un tirage.
- **pdf-lib écrit, pdf.js montre** (ADR-0002) : l'écriture (`export/assemblage.ts`) passe par pdf-lib, épinglé
  exactement, sans date ni producteur (`updateMetadata: false`) ; pdf.js, épinglé exactement, ne sert qu'aux
  aperçus, chargé à la demande depuis `dist/pdfjs/`, jamais empaqueté. Rien de ce qu'il dessine n'entre dans un
  fichier écrit.
- **Deux zooms qui ne se confondent pas** (ADR-0003) : la grille se zoome par paliers de largeur
  (`PALIERS_VIGNETTE`), l'aperçu en pourcentage avec « Page entière », « Pleine largeur » et « 100 % ». Le calcul
  est pur (`engine/zoom.ts`) ; un dessin ne se refait qu'en franchissant un palier de rendu (`largeurDeRendu`).
  Ctrl+molette zoome sans zoomer la page, et l'aperçu garde sous le pointeur le point visé.
- **Convertir, c'est choisir ce qu'on perd** (ADR-0005) : PowerPoint = une diapositive par page ; Word mise en
  page conservée = une page Word par page, une section par page ; Word texte au fil = des paragraphes recollés par
  `engine/texte.ts`, sans mise en page. Les fichiers s'écrivent à la main (`export/ooxml.ts`, `pptx.ts`, `docx.ts`),
  sans dépendance, sans date ni auteur ; la boîte dit ce que chaque choix perd.
- **Le texte converti reste modifiable, à sa place** (ADR-0006) : le fond est la page dessinée sans ses opérations
  de texte (`operationsFilter`) ; chaque ligne s'y pose en zone de texte (PowerPoint) ou en cadre (Word), avec
  police, taille, gras, italique et couleur (lue en comparant les rendus avec et sans texte), calculés en pur
  (`engine/miseEnPage.ts`). Une ligne par zone, jamais un paragraphe. Jamais de texte en image quand le PDF en a.
- **L'OCR, la plus juste, sans rien envoyer** (ADR-0007) : Tesseract en WebAssembly (`tesseract.js` épinglé), modèles
  `tessdata_best` en virgule flottante (fra, eng), cœur sans SIMD, 300 dpi, servis depuis `dist/ocr/` ; les modèles
  sont épinglés par étiquette et sha256 (`data/modeles-ocr.json`, `scripts/modeles-ocr.mjs`, cache `.cache/ocr/`).
  Seule une ligne sûre devient du texte et s'efface du scan (`engine/ocr.ts`) ; changer de modèle se mesure d'abord
  (taux d'erreur par caractère, voir l'ADR). Plusieurs travailleurs, gardés entre deux conversions, langues choisies ;
  une page mal lue s'essaie dans les quatre sens (`sensDeLecture`). Tesseract ne vit que dans `io/ocr.ts`.
- **Ce qui suit les pages, ce qui s'y ajoute** (ADR-0008) : signets, liens internes et champs suivent les pages posées
  (`export/structure.ts`, préparation d'une source avant toute copie, puis achèvement du document) ; une scission
  prépare ses sources une fois. Numéros et couche de texte d'un scan se posent dans le repère vu
  (`geometry/repere.ts`), en flux à part entouré de q/Q, police Helvetica à clé fixe : jamais `uniqueKey` de pdf-lib,
  qui tire au hasard.
- **Une couleur d'interface est un jeton** (ADR-0004) : `src/styles/jetons.ts` (couleurs, mêmes valeurs que
  `svg`), `typographie.ts` et `espaces.ts` sont la seule source ; le CSS des variables se génère au build ; la
  feuille `outils/pdf/page.css` n'écrit aucune couleur, taille de texte, rayon ni couche ; chaque texte tient
  4,5:1 sur son fond dans les deux thèmes. `docs/jetons.md` se régénère par
  `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/styles`. Pas de `color-mix()` : une teinte mélangée est un jeton.
- **Une action primaire par écran** : un bouton est secondaire par défaut, seul `.primaire` est plein
  (« Enregistrer le PDF », ou celle de la boîte ouverte). 40 px au doigt, `prefers-reduced-motion` respecté.
- **Rien ne quitte l'ordinateur** : les fichiers sont lus et écrits dans la page ; aucune requête hors des fichiers
  servis avec elle (un test de navigateur le vérifie). Le seul `fetch` de `src/` lit les modèles OCR (`io/ocr.ts`).
  Un PDF illisible, chiffré ou qui n'en est pas un est refusé en le nommant, sans lever (`io/lecture.ts`).
- **La page se pilote sans souris** : la grille est une `listbox` à une seule tabulation (flèches, Maj, Espace,
  Ctrl+A, Alt+flèches pour ranger, R pour tourner, Ctrl+D pour dupliquer, Suppr, Entrée pour l'aperçu, + et − pour zoomer) ; une seule
  région `polite` dit ce qui vient de se passer ; `axe-core` échoue sur toute violation grave en test de navigateur.
