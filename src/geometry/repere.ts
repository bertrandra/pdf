// Le passage du repere vu au repere de la page. On place ce qu'on ajoute a une page (un numero, une couche de texte
// reconnu) la ou on le voit : origine en haut a gauche, y vers le bas, en points, la page tournee comme a l'ecran. Le
// PDF, lui, dessine dans le repere de la page avant sa rotation (/Rotate), origine en bas a gauche de sa boite de
// recadrage. Ce module fait la conversion, pour les quatre quarts de tour.

/** La boite de recadrage d'une page, dans son repere : coin bas gauche, largeur, hauteur, avant toute rotation. */
export interface BoitePage { readonly x: number; readonly y: number; readonly largeur: number; readonly hauteur: number }

/** Un quart de tour, dans le sens des aiguilles d'une montre (le sens de /Rotate). */
export type QuartDeTour = 0 | 90 | 180 | 270;

/** Une matrice de texte (Tm) : [a b c d e f]. */
export type Matrice = readonly [number, number, number, number, number, number];

/** La taille vue d'une page : un quart de tour echange largeur et hauteur. */
export const tailleVue = (b: BoitePage, r: QuartDeTour): { largeur: number; hauteur: number } =>
  (r === 90 || r === 270 ? { largeur: b.hauteur, hauteur: b.largeur } : { largeur: b.largeur, hauteur: b.hauteur });

/** Un vecteur du repere vu dans le repere de la page (la partie lineaire du passage, sans l'origine). */
export function vecteurVersPage(r: QuartDeTour, du: number, dv: number): { x: number; y: number } {
  switch (r) {
    case 90: return { x: dv, y: du };
    case 180: return { x: -du, y: dv };
    case 270: return { x: -dv, y: -du };
    default: return { x: du, y: -dv };
  }
}

/** Un point vu (u vers la droite, v vers le bas, en points depuis le coin haut gauche de la page vue) dans le repere de la page. */
export function pointVersPage(b: BoitePage, r: QuartDeTour, u: number, v: number): { x: number; y: number } {
  switch (r) {
    case 90: return { x: b.x + v, y: b.y + u };
    case 180: return { x: b.x + b.largeur - u, y: b.y + v };
    case 270: return { x: b.x + b.largeur - v, y: b.y + b.hauteur - u };
    default: return { x: b.x + u, y: b.y + b.hauteur - v };
  }
}

/**
 * La matrice d'une ligne de texte posee dans le repere vu : sa ligne de base part de (u, v) et file vers la droite,
 * penchee de `angle` degres (positif : elle descend vers la droite, comme une ligne de scan de travers).
 */
export function matriceDeLigne(b: BoitePage, r: QuartDeTour, u: number, v: number, angle = 0): Matrice {
  const rad = (angle * Math.PI) / 180;
  const sens = vecteurVersPage(r, Math.cos(rad), Math.sin(rad));
  const haut = vecteurVersPage(r, Math.sin(rad), -Math.cos(rad));
  const o = pointVersPage(b, r, u, v);
  // Sans zero negatif : les memes octets s'ecrivent quel que soit le signe d'un sinus nul.
  const net = (x: number) => (x === 0 ? 0 : x);
  return [net(sens.x), net(sens.y), net(haut.x), net(haut.y), o.x, o.y];
}
