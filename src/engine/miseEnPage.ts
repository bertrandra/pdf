// Le texte d'une page pose a sa place, pour une conversion ou il reste modifiable sans bouger (ADR-0006) : chaque
// ligne devient une zone de texte a sa position, avec sa taille, sa police, son gras, son italique et sa couleur,
// au-dessus d'un fond qui est la page dessinee sans son texte. Le calcul est pur : io lit les fragments (pdf.js) et
// les pixels, ce module decide des lignes, des polices et des couleurs.
//
// Une ligne par zone, et pas un paragraphe : une police de remplacement un peu plus large reflowerait un paragraphe
// entier et le ferait deborder ; une ligne seule s'allonge un peu et reste a sa place.

import { au } from '../util/tableaux.js';

/** Un fragment de texte dans l'espace de la page vue (points, origine en haut a gauche, rotation comprise). */
export interface FragmentVu {
  readonly texte: string;
  /** Le debut de la ligne de base. */
  readonly x: number;
  readonly y: number;
  /** La longueur du fragment le long de sa ligne de base. */
  readonly largeur: number;
  readonly taille: number;
  /** La direction de la ligne de base, en degres dans le sens des aiguilles d'une montre (0 : horizontale). */
  readonly angle: number;
  /** La part de la taille au-dessus de la ligne de base (de 0 a 1). */
  readonly ascendante: number;
  readonly police: string;
  readonly gras: boolean;
  readonly italique: boolean;
  readonly fin: boolean;
}

/** Un morceau d'une ligne dans un meme style. */
export interface Segment { readonly texte: string; readonly police: string; readonly gras: boolean; readonly italique: boolean }

/** Une ligne posee : sa boite (le haut, pas la ligne de base), sa taille, sa direction et ses segments. */
export interface LignePosee {
  readonly x: number;
  readonly haut: number;
  readonly largeur: number;
  readonly taille: number;
  readonly angle: number;
  readonly segments: readonly Segment[];
}

/** Le texte entier d'une ligne. */
export const texteDeLigne = (l: LignePosee): string => l.segments.map(s => s.texte).join('');

const BLANC = /[\s\u00a0\u2000-\u200b\u202f]/;

interface Encours { x: number; y: number; finX: number; taille: number; angle: number; ascendante: number; segments: Segment[] }

function ajouterTexte(l: Encours, f: FragmentVu, espace: boolean): void {
  const texte = (espace ? ' ' : '') + f.texte;
  const dernier = l.segments[l.segments.length - 1];
  // Deux fragments du meme style se fondent : une zone n'a pas cent morceaux pour une phrase.
  if (dernier !== undefined && dernier.police === f.police && dernier.gras === f.gras && dernier.italique === f.italique) {
    l.segments[l.segments.length - 1] = { ...dernier, texte: dernier.texte + texte };
  } else {
    l.segments.push({ texte, police: f.police, gras: f.gras, italique: f.italique });
  }
}

/**
 * Les lignes posees d'une page. Une ligne finit sur une fin de ligne declaree, un changement de ligne de base ou de
 * direction, un retour en arriere, ou un blanc de plus de trois fois la taille : deux cellules d'un tableau, deux
 * colonnes, restent deux zones et gardent leur place.
 */
export function lignesPosees(fragments: readonly FragmentVu[]): LignePosee[] {
  const sortie: Encours[] = [];
  let l: Encours | null = null;
  const fermer = () => { if (l !== null) { sortie.push(l); l = null; } };
  for (const f of fragments) {
    if (f.texte === '') { if (f.fin) fermer(); continue; }
    const taille = f.taille > 0 ? f.taille : 10;
    if (l !== null) {
      const c: Encours = l;
      const ecart = f.x - c.finX;
      const memeLigne = Math.abs(f.y - c.y) <= taille / 2 && Math.abs(f.angle - c.angle) < 1 && Math.abs(f.angle) < 1;
      if (!memeLigne || ecart < -taille || ecart > taille * 3) fermer();
    }
    if (l === null) {
      l = { x: f.x, y: f.y, finX: f.x + f.largeur, taille, angle: f.angle, ascendante: f.ascendante, segments: [] };
      ajouterTexte(l, f, false);
    } else {
      const c: Encours = l;
      const avant = c.segments[c.segments.length - 1]?.texte.slice(-1) ?? ' ';
      ajouterTexte(c, f, f.x - c.finX > taille * 0.15 && !BLANC.test(avant) && !BLANC.test(f.texte.slice(0, 1)));
      c.finX = Math.max(c.finX, f.x + f.largeur);
      c.taille = Math.max(c.taille, taille);
      c.ascendante = Math.max(c.ascendante, f.ascendante);
    }
    if (f.fin) fermer();
  }
  fermer();
  return sortie.flatMap(c => {
    // Les blancs se resserrent, et ceux des bords de la ligne tombent.
    const segments = c.segments.map(s => ({ ...s, texte: s.texte.replace(/\s+/g, ' ') }));
    const n = segments.length;
    segments[0] = { ...au(segments, 0), texte: au(segments, 0).texte.trimStart() };
    segments[n - 1] = { ...au(segments, n - 1), texte: au(segments, n - 1).texte.trimEnd() };
    const utiles = segments.filter(s => s.texte !== '');
    if (utiles.length === 0) return [];
    const ascendante = c.ascendante > 0.2 && c.ascendante < 1.2 ? c.ascendante : 0.8;
    // Le haut de la boite : la ligne de base moins l'ascendante, mesure perpendiculairement a la ligne.
    const a = (c.angle * Math.PI) / 180;
    return [{
      x: c.x + Math.sin(a) * ascendante * c.taille, haut: c.y - Math.cos(a) * ascendante * c.taille,
      largeur: c.finX - c.x, taille: c.taille, angle: c.angle, segments: utiles
    }];
  });
}

/** Les polices standard du PDF et les noms PostScript courants, vers le nom qu'un traitement de texte connait. */
const POLICES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(helvetica|arialmt|arial)$/i, 'Arial'],
  [/^(times|timesroman|timesnewroman|timesnewromanpsmt|timesnewromanps)$/i, 'Times New Roman'],
  [/^(courier|couriernew|couriernewpsmt)$/i, 'Courier New'],
  [/^(symbol|symbolmt)$/i, 'Symbol'],
  [/^zapfdingbats$/i, 'Wingdings']
];

/**
 * Le nom de police a ecrire, et le gras et l'italique que dit son nom : « ABCDEF+Calibri-BoldItalic » donne Calibri,
 * gras, italique. Sans nom lisible, la famille generique de pdf.js choisit Arial, Times New Roman ou Courier New.
 */
export function lirePolice(brut: string, famille: string): { police: string; gras: boolean; italique: boolean } {
  const sansSousEnsemble = brut.replace(/^[A-Z]{6}\+/, '');
  const [base = '', ...suffixes] = sansSousEnsemble.split(/[-,]/);
  const style = suffixes.join('-') + ' ' + base;
  const gras = /bold|black|heavy|semibold|demi/i.test(style);
  const italique = /italic|oblique|kursiv/i.test(style);
  const nom = base.replace(/(PSMT|PS|MT)$/, '').replace(/(Bold|Italic|Oblique)+$/i, '');
  const connue = POLICES.find(([motif]) => motif.test(nom) || motif.test(base))?.[1];
  if (connue !== undefined) return { police: connue, gras, italique };
  // Un nom PostScript colle ses mots (« OpenSans », « SegoeUI ») : la famille installee les separe.
  if (/^[A-Za-z][A-Za-z0-9 ]{1,40}$/.test(nom)) return { police: nom.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2'), gras, italique };
  const generique = /mono|courier/i.test(famille) ? 'Courier New' : /serif/i.test(famille) && !/sans/i.test(famille) ? 'Times New Roman' : 'Arial';
  return { police: generique, gras, italique };
}

/** Une image RGBA (celle d'une toile), sa largeur et sa hauteur en pixels. */
export interface Pixels { readonly donnees: ArrayLike<number>; readonly largeur: number; readonly hauteur: number }

/**
 * La couleur d'un texte, lue en comparant la page dessinee avec son texte (`avec`) et sans (`sans`) dans la boite
 * de la ligne (en pixels) : les pixels qui changent sont l'encre. On garde le quart le plus change (le coeur des
 * lettres, pas leur bord adouci) et on en fait la moyenne. Aucun pixel change : le texte est invisible (la couche
 * de texte d'un document scanne), et on rend null.
 */
export function couleurDuTexte(avec: Pixels, sans: Pixels, boite: { x: number; y: number; largeur: number; hauteur: number }): string | null {
  const x0 = Math.max(0, Math.floor(boite.x)), y0 = Math.max(0, Math.floor(boite.y));
  const x1 = Math.min(avec.largeur, Math.ceil(boite.x + boite.largeur)), y1 = Math.min(avec.hauteur, Math.ceil(boite.y + boite.hauteur));
  const changes: [number, number, number, number][] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * avec.largeur + x) * 4;
      const r = avec.donnees[i] ?? 0, g = avec.donnees[i + 1] ?? 0, b = avec.donnees[i + 2] ?? 0;
      const ecart = Math.abs(r - (sans.donnees[i] ?? 0)) + Math.abs(g - (sans.donnees[i + 1] ?? 0)) + Math.abs(b - (sans.donnees[i + 2] ?? 0));
      if (ecart > 48) changes.push([ecart, r, g, b]);
    }
  }
  if (changes.length === 0) return null;
  changes.sort((p, q) => q[0] - p[0]);
  const coeur = changes.slice(0, Math.max(1, Math.ceil(changes.length / 4)));
  const moyenne = (k: 1 | 2 | 3) => Math.round(coeur.reduce((s, c) => s + c[k], 0) / coeur.length);
  return [moyenne(1), moyenne(2), moyenne(3)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
