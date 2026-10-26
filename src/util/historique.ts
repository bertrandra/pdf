// L'historique d'une edition : annuler, retablir. Chaque etat est une valeur immuable ; un geste
// continu (un glisser, un curseur) se fond en une seule entree par sa cle, pour qu'« annuler »
// defasse le geste entier et pas chaque pixel.

export interface Historique<T> { passe: readonly T[]; present: T; futur: readonly T[]; cle: string | null }

export const LIMITE_HISTORIQUE = 200;

/**
 * Ce que l'historique peut garder, en « elements par etat x etats ». Chaque etat est un dessin entier,
 * mais les formes qu'une operation n'a pas touchees sont partagees d'un etat a l'autre : seules les
 * formes deplacees coutent. Tout deplacer, deux cents fois, sur un dessin de cinq mille formes tient
 * pourtant deux gigaoctets (mesure : 2 Ko par forme) ; 200 000 en tient quatre cents mille.
 */
export const BUDGET_HISTORIQUE = 200_000;

/**
 * Combien d'etats garder pour un dessin de `taille` elements : deux cents jusqu'a mille elements (rien
 * ne change pour un dessin ordinaire), puis de moins en moins, jamais moins de dix.
 */
export const limitePourTaille = (taille: number, budget = BUDGET_HISTORIQUE, plancher = 10): number =>
  Math.max(plancher, Math.min(LIMITE_HISTORIQUE, Math.floor(budget / Math.max(1, taille))));

export const historique = <T>(present: T): Historique<T> => ({ passe: [], present, futur: [], cle: null });

/**
 * Le nouvel etat. Avec la meme cle que le geste precedent, il remplace le present sans nouvelle
 * entree ; sans cle, ou avec une autre, il s'empile. Un etat identique n'empile rien.
 */
export function avancer<T>(h: Historique<T>, etat: T, cle: string | null = null, limite = LIMITE_HISTORIQUE): Historique<T> {
  if (etat === h.present) return h;
  if (cle !== null && cle === h.cle) return { ...h, present: etat, futur: [] };
  const passe = [...h.passe, h.present];
  return { passe: passe.length > limite ? passe.slice(passe.length - limite) : passe, present: etat, futur: [], cle };
}

export function annuler<T>(h: Historique<T>): Historique<T> {
  const precedent = h.passe[h.passe.length - 1];
  if (h.passe.length === 0 || precedent === undefined) return h;
  return { passe: h.passe.slice(0, -1), present: precedent, futur: [h.present, ...h.futur], cle: null };
}

export function retablir<T>(h: Historique<T>): Historique<T> {
  const suivant = h.futur[0];
  if (h.futur.length === 0 || suivant === undefined) return h;
  return { passe: [...h.passe, h.present], present: suivant, futur: h.futur.slice(1), cle: null };
}

/** Clot le geste en cours : le prochain etat s'empilera, meme avec la meme cle. */
export const clore = <T>(h: Historique<T>): Historique<T> => (h.cle === null ? h : { ...h, cle: null });
