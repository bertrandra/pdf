# Un modèle de langue sur place : résumer, interroger, traduire

## Le problème

Les services en ligne résument un contrat, répondent à « quelle est la durée du préavis ? » ou traduisent un rapport
en gardant sa mise en page. Tous envoient le fichier. Les personnes que vise la page (avocats, santé, RH,
administrations) n'en ont pas le droit. Depuis que les navigateurs ont WebGPU, un modèle de quelques centaines de
mégaoctets tourne **dans la page** : on peut offrir ces trois gestes sans qu'un octet parte.

Trois fonctions, dans l'ordre où elles se livrent :

1. **Interroger** un document ou un dossier, et voir **la page qui répond** (citations vérifiées).
2. **Résumer** un document, chaque phrase du résumé renvoyant à ses pages.
3. **Traduire** en gardant la mise en page (français ↔ anglais d'abord), dans le prolongement de l'ADR-0006.

## Ce que la personne fait

- *En tant que* juriste, *je veux* demander « quelles sont les conditions de résiliation ? » à un contrat de 80 pages
  et voir les passages, *pour* répondre vite sans craindre une invention.
- *En tant que* personne pressée, *je veux* un résumé d'une page d'un rapport de 300 pages, *pour* savoir où lire.
- *En tant que* personne qui reçoit un document en anglais, *je veux* le même document en français, aux mêmes
  places, *pour* le lire et le corriger dans Word ou PowerPoint.

### Le parcours

- Un bouton « Assistant » ouvre un **panneau latéral** (`zones/Assistant.tsx`), à côté de la grille. La première fois,
  il dit ce qui va se charger (« Le modèle pèse 450 Mo, il reste sur cet ordinateur ; rien n'est envoyé ») et
  l'action primaire « Charger l'assistant ». Une barre de progression suit le chargement.
- **Interroger** : un champ de question et « Demander » (action primaire du panneau). La réponse s'écrit sous la
  question ; chaque affirmation porte ses renvois, des boutons « p. 12 » qui ouvrent l'aperçu à la page, le passage
  surligné. Sous la réponse, les passages trouvés, dépliables. Si aucun passage n'est assez proche : « Le document ne
  semble pas le dire » — sans génération, donc sans invention.
- **Résumer** : « Résumer le document » ou « Résumer les pages choisies ». La roue d'attente dit l'avancée
  (« Lecture : passage 12 sur 40 »), « Annuler » l'arrête (horizon 0, n° 4).
- **Traduire** : dans la boîte « Convertir », un choix « Traduire en : français / anglais ». La traduction se fait,
  puis une **relecture** (`zones/Traduire.tsx`) montre, page par page, chaque bloc source à gauche et sa traduction
  modifiable à droite. Action primaire : « Enregistrer la traduction » (PowerPoint ou Word, comme aujourd'hui).
- **Exporter** une réponse ou un résumé : « Copier » et « Enregistrer en Word (texte au fil) ». Ce qui part est le
  texte affiché, tel que la personne l'a éventuellement corrigé.

## La règle de l'ADR-0010 : une proposition n'écrit rien tant qu'elle n'est pas figée

Un modèle ne rend pas les mêmes mots d'une carte graphique à l'autre, ni d'une version du pilote à l'autre, même en
décodage glouton (les sommes en virgule flottante ne s'additionnent pas dans le même ordre). On ne promettra donc
**jamais** qu'un résumé ou une traduction se refait à l'identique. On promet autre chose :

- La sortie du modèle est une **proposition** (`model/ia.ts`), affichée et modifiable, jamais écrite directement.
- « Enregistrer la traduction » **fige** la proposition relue en une donnée (`TraductionFigee` : un texte par bloc).
  L'écriture (`export/pptx.ts`, `export/docx.ts`) ne lit que cette donnée : même traduction figée, même fichier.
- Une traduction figée peut s'enregistrer à part (`rapport.traduction.json`, JSON canonique) et se recharger : c'est
  ce qu'une preuve ou une recette référencerait, jamais le modèle.
- Rien de ce qu'un modèle produit n'entre dans un **PDF** écrit par `assembler` : le PDF reste fait de pages
  sources, intactes.

Paramètres de génération fixés et épinglés avec le modèle (décodage glouton, température 0, longueur maximale) : ils
réduisent la variance sans rien garantir, et ils figurent dans `data/modeles-ia.json`.

## Les modèles

### Le moteur

**Transformers.js** (`@huggingface/transformers`, Apache 2.0), épinglé exactement, servi depuis `dist/ia/` comme
pdf.js et Tesseract : un seul moteur pour les trois familles de modèles (plongements, traduction, génération), avec
**WebGPU** et un **repli WebAssembly** sur le processeur. WebLLM (Apache 2.0) est plus rapide en génération mais
WebGPU seulement et limité aux modèles de langue : un second moteur ne se justifierait que si la mesure le dit.

Configuration imposée : `env.allowRemoteModels = false`, `env.localModelPath` vers `dist/ia/modeles/`, cache du
navigateur désactivé tant que l'ADR-0009 n'a pas tranché (voir *Cache*). Le moteur ne s'importe que dans `io/ia.ts`.

### Les candidats (à mesurer)

| Rôle | Candidat | Taille estimée (quantifiée) | Licence | Statut |
|---|---|---|---|---|
| Plongements (recherche) | `multilingual-e5-small` (384 dimensions, préfixes `query:` / `passage:`) | ≈ 120 Mo en q8 | MIT | version ONNX publiée pour Transformers.js ; justesse en français à mesurer |
| Traduction fr↔en | Opus-MT (Marian) `fr-en` et `en-fr` | ≈ 75 Mo chacun en q8 | CC-BY 4.0 (attribution) | à vérifier : version ONNX, qualité sur nos témoins |
| Génération, petit | Qwen3-0.6B, instruct | ≈ 400 Mo en q4 | Apache 2.0 (à vérifier sur la fiche officielle) | à mesurer |
| Génération, moyen | Qwen3-1.7B, instruct | ≈ 1,1 Go en q4 | Apache 2.0 (à vérifier) | à mesurer |
| Génération, grand | Phi-4-mini (3,8 B) | ≈ 2,3 Go en q4 | MIT | à mesurer ; probablement trop lourd pour la plupart des postes |

Écartés d'emblée : les modèles sous conditions propres (Gemma, Llama) pour l'offre Organisation, qui **redistribue**
les modèles dans son paquet ; leurs conditions d'usage ou leur seuil d'utilisateurs demandent une revue juridique que
des licences Apache et MIT n'exigent pas. Ils peuvent revenir si la mesure les place très au-dessus.

### La mesure (comme l'ADR-0007)

Un corpus témoin commis en texte (`tests/ia/corpus/`), des PDF fabriqués par `tests/aide/pdfs.ts` :

- **Questions** : 60 questions sur 6 documents (contrat, rapport, facture, bail, notice, compte rendu ; français et
  anglais), chacune avec sa réponse et ses pages. Métriques : *citation juste* (la page citée contient la réponse),
  *réponse sans appui* (une affirmation sans citation valide), *abstention juste* (« ne semble pas le dire » quand
  c'est vrai).
- **Résumés** : couverture des points clés listés à la main ; aucune affirmation sans page.
- **Traduction** : chrF contre une traduction de référence, plus une relecture humaine de 20 pages.
- **Machines** : un portable à processeur graphique intégré (Intel), un Mac M1, un poste sans WebGPU. Temps de
  chargement, jetons par seconde, mémoire au pic.
- **Règle de choix** : le plus petit modèle qui atteint 90 % de citations justes et moins de 5 % de réponses sans
  appui sur le corpus ; sinon, la fonction ne sort pas.

## Les algorithmes

### Passages (pur, `engine/passages.ts`)

Un document se coupe en **passages** de 150 à 300 mots, en suivant les paragraphes déjà recollés par
`engine/texte.ts` (`paragraphes`) ou reconnus par l'OCR (`engine/ocr.ts`, `paragraphesOcr`) ; un passage ne déborde
jamais d'une page, pour que la citation soit une page. Chaque passage garde son identifiant de page montée.

```ts
// model/ia.ts
export interface Passage { readonly id: string; readonly page: string /* id de PageMontee */; readonly texte: string }
export interface Citation { readonly passage: string; readonly page: string }
export interface Affirmation { readonly texte: string; readonly citations: readonly Citation[] }
export interface Reponse { readonly question: string; readonly affirmations: readonly Affirmation[]; readonly sansAppui: boolean }
export interface TraductionFigee { readonly langue: 'fr' | 'en'; readonly blocs: readonly { readonly page: string; readonly bloc: number; readonly texte: string }[] }
```

### Recherche (pur, `engine/recherche.ts`)

Les plongements sont calculés dans `io/ia.ts` ; le cœur reçoit des vecteurs normalisés et rend les `k` passages les
plus proches (produit scalaire), à égalité départagés par l'ordre du document — pur et déterministe pour des vecteurs
donnés. Un seuil (à mesurer) sépare « trouvé » de « ne semble pas le dire ». Un dossier de 300 pages fait environ
1 500 passages : la recherche exhaustive suffit, sans index approché.

### Réponse et citations (`engine/citations.ts`)

- L'invite donne les passages numérotés `[1]` à `[k]` et exige une citation par phrase.
- La sortie est découpée en phrases ; chaque `[n]` est vérifié en pur : il existe, et le passage cité partage assez
  de mots pleins avec la phrase (seuil à mesurer). Une citation invalide est retirée ; une phrase sans citation valide
  est **marquée** (« non appuyé par le document », en italique et annoncé), jamais présentée comme sûre.

### Résumé (`engine/resume.ts`)

Carte puis réduction : un résumé par groupe de passages tenant dans la fenêtre du modèle (avec leurs pages), puis un
résumé des résumés. Chaque phrase finale garde l'union des pages des résumés dont elle vient. Le découpage en groupes,
la fusion des pages et la vérification sont purs ; seuls les appels au modèle sont dans `io`.

### Traduire en gardant la mise en page (`engine/traduction.ts`, ADR-0011)

Traduire ligne par ligne casse le sens ; traduire la page entière perd les places. Entre les deux :

1. Partir des lignes posées de l'ADR-0006 (`lignesPosees`, ou `lignesOcrPosees` pour un scan).
2. Les regrouper en **blocs** (lignes de même colonne, interligne régulier, même taille) — pur, testé sur les
   témoins de l'ADR-0006. Une cellule de tableau est un bloc.
3. Traduire chaque bloc entier (Opus-MT), avec le bloc précédent en contexte si le modèle le permet.
4. **Reverser** la traduction dans les lignes du bloc : couper aux espaces pour que chaque ligne tienne sa largeur
   (largeur estimée par des métriques de police figées, celles d'Arial, Times New Roman et Courier New, embarquées en
   table pure) ; si le texte déborde (le français est 15 à 20 % plus long que l'anglais), réduire la taille du bloc
   par pas de 0,5 pt jusqu'à 80 %, puis ajouter des lignes sous le bloc s'il le faut, en le signalant dans la relecture.
5. Écrire par les rédacteurs existants (`pptx.ts`, `docx.ts`), sur le fond sans texte.

La sortie PDF traduite n'est pas dans cette spécification : écrire du texte dans un PDF demande d'embarquer des polices,
un chantier à part.

## Les modules

| Module | Couche | Rôle |
|---|---|---|
| `model/ia.ts` | 2 | Les types ci-dessus |
| `engine/passages.ts`, `recherche.ts`, `citations.ts`, `resume.ts`, `traduction.ts` | 3 | Le calcul pur |
| `io/modeles.ts` | 4 | Lire un modèle servi avec la page, vérifié par sha256 ; repris d'`io/ocr.ts`, seul `fetch` de `src/` |
| `io/ia.ts` | 4 | Le seul import de Transformers.js : `ouvrirAssistant(): Promise<Assistant>` |
| `zones/Assistant.tsx`, `zones/Traduire.tsx` | 6 | Le panneau et la relecture |

```ts
// io/ia.ts
export type Capacite = 'webgpu' | 'wasm' | 'aucune';
export function capacite(): Promise<Capacite>;
export interface Assistant {
  plonger(textes: readonly string[], role: 'question' | 'passage', signal: AbortSignal): Promise<Float32Array[]>;
  generer(invite: string, signal: AbortSignal, surJeton?: (texte: string) => void): Promise<string>;
  traduire(blocs: readonly string[], vers: 'fr' | 'en', signal: AbortSignal): Promise<string[]>;
  fermer(): Promise<void>;
}
export function ouvrirAssistant(progression: (charge: number, total: number) => void): Promise<Assistant>;
```

Comme pour l'OCR, les modèles se chargent à la demande et se ferment à la fin, même sur une erreur.

## Construction et épinglage

- `data/modeles-ia.json` : pour chaque modèle, le dépôt, **la révision exacte (empreinte du commit)**, chaque fichier
  avec sa taille et son sha256, la licence, les paramètres de génération.
- `scripts/modeles-ia.mjs`, calqué sur `scripts/modeles-ocr.mjs` : cache `.cache/ia/` (ignoré par git, mis en cache par
  la CI), vérification, copie dans `dist/ia/modeles/`. Un fichier non conforme fait échouer la construction.
- Les modèles **ne sont pas dans la page gratuite** : `npm run construire -- --ia` ou la construction premium
  (l'ADR de l'offre). La page gratuite ne grossit pas d'un octet.
- **Pas dans l'artefact claude.ai** : ses limites (15 Mo par fichier, 256 Mo par version) ne tiennent pas un modèle de
  génération. Le bouton « Assistant » n'y apparaît pas.

### Cache

Recharger 500 Mo à chaque ouverture serait inutilisable sur un réseau lent. Proposition pour l'ADR-0009 : garder les
fichiers de modèles (et eux seuls) dans le **stockage privé d'origine** (OPFS), **re-vérifiés par sha256 à chaque
ouverture** ; « Oublier l'assistant » les efface. Cela assouplit la règle actuelle de l'OCR (« rien n'est gardé dans
le navigateur ») pour des fichiers publics et vérifiés, jamais pour un document de la personne. Dans l'offre
Organisation, servis par l'intranet, le cache est un confort.

## Sans WebGPU

- **Recherche** (plongements, ≈ 120 Mo) : en WebAssembly, quelques secondes pour 1 500 passages (à mesurer). Elle
  reste offerte partout : « Rechercher dans le document » rend les passages et leurs pages, sans réponse rédigée.
- **Traduction** (Opus-MT) : en WebAssembly, lente mais utilisable page par page (à mesurer) ; proposée avec une
  estimation du temps.
- **Génération** : désactivée sans WebGPU, et la page le dit (« Votre navigateur n'a pas WebGPU : l'assistant peut
  chercher des passages, pas rédiger de réponse »). Le modèle de 0,6 B en WebAssembly sera mesuré ; s'il tient moins
  de 5 jetons par seconde, il n'est pas proposé.

## Budgets

| | Plongements | Traduction (une paire) | Génération 0,6 B | Génération 1,7 B |
|---|---|---|---|---|
| Téléchargement | ≈ 120 Mo | ≈ 75 Mo | ≈ 400 Mo | ≈ 1,1 Go |
| Mémoire au pic | < 500 Mo | < 500 Mo | < 1,5 Go | < 3 Go |

Toutes ces valeurs sont « à mesurer ». La page vérifie `navigator.deviceMemory` et les limites de l'adaptateur WebGPU
avant de charger, et refuse en le disant plutôt que de faire tomber l'onglet.

## Accessibilité

- Le panneau est une région nommée (`<aside aria-label="Assistant">`) ; la question est un champ étiqueté.
- La réponse **ne s'annonce pas jeton par jeton** : la région `polite` unique dit « Réponse prête, appuyée sur 3
  pages » à la fin. La réponse elle-même est un texte ordinaire, lisible au lecteur d'écran.
- Les renvois sont des boutons (« Ouvrir la page 12 ») ; « non appuyé par le document » est écrit, pas seulement en
  italique.
- La relecture de traduction est un tableau à deux colonnes d'en-têtes « Original » et « Traduction ».
- Une action primaire par écran : « Charger l'assistant », puis « Demander » ; « Enregistrer la traduction ».

## Offre

Pro : interroger et résumer un document, traduire. Organisation : interroger **un dossier** (plusieurs sources), et
modèles livrés dans le paquet intranet. La recherche extractive seule pourrait rester gratuite pour faire goûter la
fonction : question ouverte.

## Tests

- **Unitaires** (sans modèle) : passages (pas de débordement de page, tailles), recherche (vecteurs fixés,
  égalités), citations (citations inventées retirées, phrases sans appui marquées), résumé (groupes, union des
  pages), traduction (blocs, reversement, réduction de taille, débordement signalé). Les sorties de modèle sont des
  **fichiers témoins** commis (`tests/unit/engine/ia/*.json` : invite, sortie brute), et l'on teste ce que le cœur en
  fait.
- **Bout en bout** : un **assistant factice** remplace `io/ia.ts` (même interface, réponses déterminées par la
  question) : parcours complet, ouverture de la page citée, abstention, relecture et écriture d'une traduction figée
  (mêmes octets à deux écritures), `axe-core`, **aucune requête extérieure pendant le chargement**.
- **Mesure** (hors de `npm run verifier`, job manuel ou hebdomadaire) : le corpus témoin avec les vrais modèles, sur
  le Chromium du conteneur ; les chiffres sont écrits dans l'ADR et un recul de plus de 2 points fait échouer le job.

## Risques et questions ouvertes

- **Inventions** : même avec citations, un petit modèle peut citer une page juste pour une phrase fausse. Le contrôle
  par mots partagés attrape le grossier, pas le subtil ; la page doit dire clairement « vérifiez les pages citées ».
- **WebGPU** inégal selon les postes d'entreprise (pilotes bloqués, navigateurs gérés) : la recherche sans génération
  doit suffire à justifier l'achat seule.
- **Licences** des modèles à vérifier sur les fiches officielles avant tout épinglage ; l'attribution d'Opus-MT (CC-BY)
  doit apparaître dans la page.
- **Poids** du paquet Organisation (plusieurs Go) et mise à jour des modèles : un changement de modèle se mesure
  d'abord, comme pour l'OCR.
- Faut-il garder les plongements d'un document entre deux séances ? Ils sont dérivés du document, donc privés : non par
  défaut.

## Livraison

1. `io/modeles.ts` (repris de l'OCR), `data/modeles-ia.json`, `scripts/modeles-ia.mjs`, le corpus témoin.
2. Recherche extractive (plongements), avec et sans WebGPU.
3. Questions avec citations (génération), derrière la mesure.
4. Résumé.
5. Traduction fr↔en avec relecture, écrite en PowerPoint et Word.
6. Questions sur un dossier (Organisation).

## ADR

- **ADR-0009 — L'intelligence sur place** : Transformers.js épinglé, modèles servis et épinglés par révision et
  sha256, cache OPFS vérifié, absent de la page gratuite et de l'artefact, critères de choix des modèles.
- **ADR-0010 — Une proposition n'écrit rien tant qu'elle n'est pas figée** : relecture, données figées, rien du modèle
  dans un PDF assemblé.
- **ADR-0011 — Traduire en gardant la mise en page** : blocs, reversement, réduction de taille, métriques figées.
