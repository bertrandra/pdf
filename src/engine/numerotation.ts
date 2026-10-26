// La numerotation des pages, en calcul pur : quel texte, et ou le poser sur la page vue. L'ecriture (export/
// surimpression.ts) le dessine dans le repere de la page (geometry/repere.ts). Le numero suit la page telle qu'on la
// voit : une page tournee garde son numero en bas, a l'endroit.

import type { Numerotation, PositionNumero } from '../model/montage.js';

export const NUMEROTATION_DEFAUT: Numerotation = { position: 'bas-centre', format: 'n', debut: 1, sauterPremiere: false };

/** La taille du numero, en points, et sa distance au bord de la page vue. */
export const TAILLE_NUMERO = 10;
export const MARGE_NUMERO = 28;

/** Le texte du numero de la page `k` (base 0) d'un document de `total` pages, ou null si cette page n'en porte pas. */
export function texteDuNumero(n: Numerotation, k: number, total: number): string | null {
  if (n.sauterPremiere && k === 0) return null;
  const numero = n.debut + k, dernier = n.debut + total - 1;
  switch (n.format) {
    case 'n-sur-total': return numero + ' / ' + dernier;
    case 'page-n-sur-total': return 'Page ' + numero + ' sur ' + dernier;
    default: return String(numero);
  }
}

/**
 * Le depart de la ligne de base du numero, dans le repere vu (en points, origine en haut a gauche), pour une page vue
 * de `largeur` x `hauteur` et un texte de `largeurTexte` points. Une page plus petite que deux marges garde son
 * numero dedans.
 */
export function placeDuNumero(position: PositionNumero, largeur: number, hauteur: number, largeurTexte: number, taille = TAILLE_NUMERO): { u: number; v: number } {
  const marge = Math.min(MARGE_NUMERO, largeur / 4, hauteur / 4);
  const [vertical, horizontal] = position.split('-') as ['bas' | 'haut', 'centre' | 'droite' | 'gauche'];
  const u = horizontal === 'gauche' ? marge : horizontal === 'droite' ? largeur - marge - largeurTexte : (largeur - largeurTexte) / 2;
  // La ligne de base : a une marge du bas, ou une marge plus la hauteur des capitales sous le haut.
  const v = vertical === 'bas' ? hauteur - marge : marge + taille * 0.72;
  return { u, v };
}
