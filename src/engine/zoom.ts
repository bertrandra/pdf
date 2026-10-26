// Le zoom, en calcul pur (ADR-0003) : deux echelles qui ne se confondent pas. La grille de vignettes se zoome par
// paliers de largeur (on y choisit, range, scinde : il faut voir beaucoup de pages a la fois, puis les lire) ;
// l'apercu d'une page se zoome en pourcentage, avec « page entiere » et « pleine largeur » calcules sur la place
// disponible. Les composants ne font que passer la place mesuree et le geste ; rien ici ne lit le DOM.

/** Les largeurs de vignette, en pixels CSS : de la vue d'ensemble d'un gros document a la lecture d'une page. */
export const PALIERS_VIGNETTE: readonly number[] = [72, 96, 128, 160, 200, 256, 320, 400, 520];
/** Le palier de depart : quatre a six vignettes par ligne sur un ecran ordinaire. */
export const PALIER_DEFAUT = 3;

/** Le palier voisin, borne aux extremes : `sens` +1 agrandit, -1 reduit. */
export const palierVoisin = (palier: number, sens: 1 | -1): number =>
  Math.max(0, Math.min(PALIERS_VIGNETTE.length - 1, Math.round(palier) + sens));

/** La largeur d'une vignette au palier donne (borne aux extremes). */
export const largeurVignette = (palier: number): number =>
  PALIERS_VIGNETTE[Math.max(0, Math.min(PALIERS_VIGNETTE.length - 1, Math.round(palier)))] ?? 160;

/**
 * La taille d'une vignette pour une page vue de `largeur` x `hauteur` (points) : elle tient dans un carre de cote
 * `cote`, pour que les pages d'une ligne s'alignent quelle que soit leur orientation.
 */
export function cadreVignette(largeur: number, hauteur: number, cote: number): { largeur: number; hauteur: number } {
  if (!(largeur > 0) || !(hauteur > 0)) return { largeur: cote, hauteur: cote };
  const k = cote / Math.max(largeur, hauteur);
  return { largeur: Math.round(largeur * k), hauteur: Math.round(hauteur * k) };
}

/**
 * La largeur en pixels de l'image a dessiner pour une vignette affichee a `largeur` px CSS sur un ecran de densite
 * `densite` : arrondie au palier superieur, pour qu'un petit zoom ne redessine rien et qu'un grand redessine une
 * fois. Bornee a 2 400 px : au-dela, une page de journal coute plus qu'elle ne montre.
 */
export function largeurDeRendu(largeur: number, densite: number): number {
  const voulu = Math.min(2400, Math.ceil(largeur * Math.max(1, densite)));
  return PALIERS_VIGNETTE.map(p => p * 2).concat([1280, 1600, 2400]).sort((a, b) => a - b).find(p => p >= voulu) ?? 2400;
}

/** Les echelles de l'apercu d'une page, en fraction de la taille reelle (1 = 100 %, un point PDF = un pixel CSS). */
export const ECHELLES_APERCU: readonly number[] = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
export const ECHELLE_MIN = 0.1;
export const ECHELLE_MAX = 8;

/** Le mode de zoom de l'apercu : ajuste a la place (il suit un redimensionnement), ou une echelle fixee. */
export type ZoomApercu = { readonly mode: 'page' } | { readonly mode: 'largeur' } | { readonly mode: 'libre'; readonly echelle: number };

/** L'echelle effective d'un zoom pour une page vue de `page` (points) dans une place de `place` (px CSS). */
export function echelleEffective(zoom: ZoomApercu, page: { largeur: number; hauteur: number }, place: { largeur: number; hauteur: number }): number {
  if (zoom.mode === 'libre') return borner(zoom.echelle);
  if (!(page.largeur > 0) || !(page.hauteur > 0) || !(place.largeur > 0) || !(place.hauteur > 0)) return 1;
  const k = zoom.mode === 'largeur' ? place.largeur / page.largeur : Math.min(place.largeur / page.largeur, place.hauteur / page.hauteur);
  return borner(k);
}

const borner = (k: number): number => Math.max(ECHELLE_MIN, Math.min(ECHELLE_MAX, k));

/** L'echelle voisine dans la liste, depuis une echelle quelconque (celle d'un ajustement compris). */
export function echelleVoisine(echelle: number, sens: 1 | -1): number {
  const tolerance = 1e-3;
  const suivante = sens > 0
    ? ECHELLES_APERCU.find(e => e > echelle + tolerance)
    : [...ECHELLES_APERCU].reverse().find(e => e < echelle - tolerance);
  return suivante ?? borner(echelle);
}

/**
 * Le facteur d'un cran de molette (Ctrl+molette, ou le pincement d'un pave tactile qui arrive en molette) : un
 * zoom continu, proportionnel au deplacement, le meme dans tous les navigateurs a `deltaY` egal.
 */
export const facteurMolette = (deltaY: number): number => Math.exp(-Math.max(-200, Math.min(200, deltaY)) * 0.0025);

/**
 * Le defilement qui garde sous le pointeur le point qu'il visait quand l'echelle passe de `avant` a `apres` :
 * `pointeur` est la position du pointeur dans la zone visible, `defilement` le defilement courant (px CSS).
 */
export function defilementAncre(defilement: number, pointeur: number, avant: number, apres: number): number {
  if (!(avant > 0)) return defilement;
  return Math.max(0, (defilement + pointeur) * (apres / avant) - pointeur);
}

/** Le texte d'une echelle : « 125 % ». */
export const pourcentage = (echelle: number): string => Math.round(echelle * 100) + ' %';
