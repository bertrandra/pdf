// Les signets d'un document ecrit (ADR-0008), en calcul pur. Chaque source a son arbre de signets, chacun visant une
// page de cette source ; le montage n'en garde qu'une partie, dans un autre ordre, parfois en deux fichiers. On garde
// un signet si sa page est montee, ou si l'un de ses descendants est garde (il devient alors un titre qui mene a la
// premiere page gardee sous lui) ; les autres partent. L'ordre de l'arbre ne change pas : un signet est un sommaire,
// pas un index des pages.
//
// Les arbres des sources se mettent bout a bout, dans l'ordre ou chaque source apparait pour la premiere fois dans le
// montage. Les donnees propres au format (titre, couleur, style, reste de la destination) voyagent dans `donnees`,
// sans que ce module les lise.

/** Un signet d'une source : `page` est l'index (base 0) vise dans la source, null s'il ne vise aucune page de celle-ci. */
export interface Signet<T> {
  readonly donnees: T;
  readonly page: number | null;
  readonly ouvert: boolean;
  readonly enfants: readonly Signet<T>[];
}

/** Un signet garde : `position` est la place (base 0) de la page visee dans le document ecrit. */
export interface SignetPose<T> {
  readonly donnees: T;
  readonly position: number;
  /** Vrai si le signet vise sa propre page ; faux s'il mene a la premiere page gardee sous lui. */
  readonly propre: boolean;
  readonly ouvert: boolean;
  readonly enfants: readonly SignetPose<T>[];
}

/**
 * Les signets gardes d'une source. `position` dit ou se trouve la page `index` de la source dans le document ecrit
 * (sa premiere place si elle y est deux fois), ou undefined si elle n'y est pas.
 */
export function poserSignets<T>(arbre: readonly Signet<T>[], position: (index: number) => number | undefined): SignetPose<T>[] {
  return arbre.flatMap((s): SignetPose<T>[] => {
    const enfants = poserSignets(s.enfants, position);
    const propre = s.page === null ? undefined : position(s.page);
    if (propre !== undefined) return [{ donnees: s.donnees, position: propre, propre: true, ouvert: s.ouvert, enfants }];
    const premier = enfants[0];
    return premier === undefined ? [] : [{ donnees: s.donnees, position: premier.position, propre: false, ouvert: s.ouvert, enfants }];
  });
}

/** Les signets de plusieurs sources mis bout a bout, dans l'ordre de leur premiere page dans le document ecrit. */
export function fusionnerSignets<T>(parSource: readonly { readonly premiere: number; readonly signets: readonly SignetPose<T>[] }[]): SignetPose<T>[] {
  return [...parSource].sort((a, b) => a.premiere - b.premiere).flatMap(s => s.signets);
}

/** Le nombre de descendants visibles d'un signet ouvert (ceux sous un signet ferme ne se voient pas). */
export function descendantsVisibles(s: { readonly enfants: readonly { readonly ouvert: boolean; readonly enfants: readonly unknown[] }[] }): number {
  return s.enfants.reduce((n, e) => n + 1 + (e.ouvert ? descendantsVisibles(e as typeof s) : 0), 0);
}

/**
 * Le /Count d'un signet (PDF 32000, 12.3.3) : le nombre de descendants visibles s'il est ouvert, son oppose s'il
 * est ferme (ce qu'on verrait en l'ouvrant), et rien s'il n'a pas d'enfant.
 */
export function compteSignet(s: SignetPose<unknown>): number | null {
  if (s.enfants.length === 0) return null;
  const n = descendantsVisibles(s);
  return s.ouvert ? n : -n;
}
