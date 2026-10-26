# Horizon 3 — l'intelligence, sur place

Les spécifications de l'horizon 3 de la feuille de route (`docs/feuille-de-route.md`). Rien n'est décidé : chaque
spécification se termine par les ADR qu'il faudra écrire avant d'écrire du code. L'ADR-0008 (ce qui survit à
l'écriture) est pris par l'horizon 0 ; ceux-ci commencent à l'ADR-0009, et l'offre et la licence auront le leur.

| Spécification | Ce qu'elle apporte | Dépend de | Offre |
|---|---|---|---|
| [`recettes.md`](recettes.md) | Enregistrer un montage en recette, l'appliquer à un dossier entier | ADR-0001, horizon 0 (annulation) | Pro ; recettes partagées : Organisation |
| [`preuve-de-fabrication.md`](preuve-de-fabrication.md) | Avec chaque PDF écrit, de quoi le refaire à l'octet près | ADR-0002, recettes | Écrire : Organisation ; vérifier : gratuit |
| [`modele-local.md`](modele-local.md) | Résumer, interroger un dossier avec les pages citées, traduire en gardant la mise en page | ADR-0006, ADR-0007 | Pro ; sur les dossiers : Organisation |
| [`classer-nommer.md`](classer-nommer.md) | Découper un lot de scans par document, le nommer, le ranger | les trois précédentes | Pro ; par lots et recettes : Organisation |

## Les quatre règles qui ne bougent pas

1. **Rien ne quitte l'ordinateur.** Les modèles sont servis avec la page (`dist/ia/`), épinglés par révision et
   sha256 comme les modèles OCR (`data/modeles-ia.json`, `scripts/modeles-ia.mjs`, cache `.cache/ia/`). Le seul
   `fetch` de `src/` reste unique : il passe de `io/ocr.ts` à un lecteur commun, `io/modeles.ts`, qui ne lit que des
   fichiers servis avec la page. Le test de navigateur « aucune requête extérieure » couvre chaque fonction.
2. **Ce qu'un modèle propose n'écrit aucun octet tant que la personne ne l'a pas figé.** Un modèle de langue ne
   rend pas les mêmes mots sur deux cartes graphiques. Sa sortie est une **proposition** affichée, relue, modifiable ;
   une fois acceptée, elle devient une **donnée** (un texte, un découpage, un nom) et c'est cette donnée, pas le
   modèle, qui entre dans l'écriture. Mêmes données figées, mêmes octets.
3. **Le cœur reste pur.** Découper en passages, chercher les plus proches, valider une citation, appliquer une
   recette, sérialiser une preuve : tout cela vit dans `engine/` et se teste sans navigateur. Le modèle vit dans
   `io/ia.ts` et nulle part ailleurs, comme Tesseract dans `io/ocr.ts`.
4. **Mesurer avant de choisir.** Comme l'ADR-0007 pour l'OCR : un corpus témoin, une métrique, des machines de
   référence, et le plus petit modèle qui passe le seuil. Les tailles et vitesses de ces spécifications sont des
   estimations marquées « à mesurer » tant que la mesure n'est pas faite.

## Ce qui change dans l'architecture

Aucune couche nouvelle. Les modules prévus, par couche (`tests/unit/architecture.test.ts`, `NIVEAU` inchangé) :

| Couche | Modules nouveaux |
|---|---|
| `util` (0) | `json.ts` (JSON canonique) |
| `model` (2) | `recette.ts`, `preuve.ts`, `ia.ts` (types des passages, réponses, propositions) |
| `engine` (3) | `recette.ts`, `preuve.ts`, `passages.ts`, `recherche.ts`, `citations.ts`, `resume.ts`, `traduction.ts`, `classement.ts`, `nommage.ts` |
| `io` (4) | `modeles.ts` (lecture des modèles servis, commune à l'OCR et à l'IA), `ia.ts` (le seul import du moteur d'inférence), `empreinte.ts` (sha256 par WebCrypto), `dossier.ts` (accès aux dossiers) |
| `export` (4) | `preuve.ts` (le fichier `.preuve.json`), réutilise `docx.ts`, `pptx.ts`, `zip.ts` |
| `zones` (6) | `Assistant.tsx`, `Traduire.tsx`, `Classer.tsx`, `Recettes.tsx`, `Lots.tsx`, `Verifier.tsx` |

Trois règles de `architecture.test.ts` à ajouter : le moteur d'inférence ne s'importe que dans `io/ia.ts` ; `fetch`
n'apparaît que dans `io/modeles.ts` ; `showDirectoryPicker` n'apparaît que dans `io/dossier.ts`.

## Ordre de livraison proposé

1. **Recettes** (sans IA, pur, prolonge l'ADR-0001) : la valeur la plus sûre, et le format dont tout le reste dépend.
2. **Preuve de fabrication** : quelques jours une fois les recettes là ; c'est l'argument de l'offre Organisation.
3. **Recherche et questions** (plongements seuls, puis génération) : la recherche extractive marche même sans WebGPU.
4. **Résumé**, puis **traduction** (un modèle de traduction dédié, pas le modèle de langue).
5. **Classer et nommer** : assemble tout le reste (OCR, plongements, modèle, recettes, dossiers).

## Les ADR à écrire

- ADR-0009 — L'intelligence sur place : moteur, modèles, épinglage, cache (`modele-local.md`).
- ADR-0010 — Une proposition n'écrit rien tant qu'elle n'est pas figée (toutes).
- ADR-0011 — Traduire en gardant la mise en page (`modele-local.md`).
- ADR-0012 — Les recettes : un format canonique et versionné (`recettes.md`).
- ADR-0013 — Lire et écrire un dossier (`recettes.md`, `classer-nommer.md`).
- ADR-0014 — La preuve de fabrication (`preuve-de-fabrication.md`).
- ADR-0015 — Classer et nommer un lot de scans (`classer-nommer.md`).
