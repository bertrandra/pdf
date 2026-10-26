// Ce qu'est un document en cours (ADR-0001) : un montage, c'est-a-dire une suite de references de pages vers
// des PDF sources qu'on ne modifie jamais. Fusionner, decouper, scinder, pivoter ou reordonner ne touchent qu'a
// cette suite ; les octets ne s'ecrivent qu'a l'enregistrement (export/assemblage.ts). Un montage est une
// valeur immuable : chaque operation (engine/montage.ts) en rend un nouveau, ce qui donne l'historique pour rien.

/** Un quart de tour, en degres, dans le sens des aiguilles d'une montre (le sens de /Rotate). */
export type Quart = 0 | 90 | 180 | 270;

/** La taille d'une page source, en points PDF, avant toute rotation, et sa rotation propre (/Rotate). */
export interface PageSource {
  readonly largeur: number;
  readonly hauteur: number;
  readonly rotation: Quart;
}

/** Un PDF ouvert. Ses octets vivent hors du modele (io) : le montage ne garde que ce qu'il faut pour se dessiner. */
export interface Source {
  /** Un identifiant stable dans le montage : `s1`, `s2`… */
  readonly id: string;
  /** Le nom du fichier, tel qu'on l'a ouvert. */
  readonly nom: string;
  readonly pages: readonly PageSource[];
  /** Vrai pour une page blanche fabriquee par la page, et non ouverte : elle ne donne pas son nom au document. */
  readonly vierge?: boolean;
}

/** Ou poser le numero sur la page vue. */
export type PositionNumero = 'bas-centre' | 'bas-droite' | 'bas-gauche' | 'haut-centre' | 'haut-droite' | 'haut-gauche';
/** Comment l'ecrire : « 3 », « 3 / 12 », « Page 3 sur 12 ». */
export type FormatNumero = 'n' | 'n-sur-total' | 'page-n-sur-total';

/** La numerotation des pages du document ecrit (engine/numerotation.ts) ; chaque fichier d'une scission recommence. */
export interface Numerotation {
  readonly position: PositionNumero;
  readonly format: FormatNumero;
  /** Le numero de la premiere page du document ecrit. */
  readonly debut: number;
  /** Vrai pour ne rien ecrire sur la premiere page (une couverture), qui compte pourtant. */
  readonly sauterPremiere: boolean;
}

/** Une page du montage : la page `index` (base 0) de la source `source`, tournee de `rotation` en plus de la sienne. */
export interface PageMontee {
  /** Un identifiant stable dans le montage : `p1`, `p2`… Il suit la page quand on la deplace. */
  readonly id: string;
  readonly source: string;
  readonly index: number;
  readonly rotation: Quart;
}

export interface Montage {
  readonly sources: readonly Source[];
  readonly pages: readonly PageMontee[];
  /** Le prochain numero d'identifiant : un compteur plutot qu'un tirage, pour que tout se rejoue a l'identique. */
  readonly suivant: number;
  /** Les numeros a poser sur les pages ecrites ; absent, aucun. */
  readonly numerotation?: Numerotation;
}

export const MONTAGE_VIDE: Montage = { sources: [], pages: [], suivant: 1 };

/** La rotation totale affichee d'une page : la sienne, plus celle qu'on lui a donnee. */
export function rotationTotale(source: PageSource, page: PageMontee): Quart {
  return ((source.rotation + page.rotation) % 360) as Quart;
}

/** La taille vue d'une page (largeur, hauteur), rotation comprise : un quart de tour echange les cotes. */
export function tailleVue(source: PageSource, page: PageMontee): { largeur: number; hauteur: number } {
  const r = rotationTotale(source, page);
  return r === 90 || r === 270 ? { largeur: source.hauteur, hauteur: source.largeur } : { largeur: source.largeur, hauteur: source.hauteur };
}

/** La page source d'une page du montage, ou undefined si le montage est incoherent. */
export function pageSource(m: Montage, page: PageMontee): PageSource | undefined {
  return m.sources.find(s => s.id === page.source)?.pages[page.index];
}
