// Ce qu'on fait du resultat de la reconnaissance de caracteres (ADR-0007), en calcul pur. Tesseract (io/ocr.ts) rend
// des paragraphes de lignes de mots, en pixels de l'image reconnue ; on en tire :
// - les lignes posees d'une page scannee (le meme modele que le texte d'un PDF, engine/miseEnPage.ts), pour qu'elle
//   devienne du texte modifiable a sa place ;
// - les paragraphes au fil, pour « Word, texte au fil » ;
// - le fond sans le texte : chaque ligne reconnue est effacee de l'image, couverte par la couleur du papier autour
//   d'elle, et sa couleur d'encre est lue avant l'effacement.
// Une ligne trop incertaine (confiance moyenne sous le seuil, ou sans lettre ni chiffre) n'est ni posee ni effacee :
// les taches, les photos et les tampons restent dans l'image, au lieu de devenir du texte faux.

import type { LignePosee } from './miseEnPage.js';

export interface BoiteOcr { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
export interface MotOcr { readonly texte: string; readonly confiance: number; readonly boite: BoiteOcr }
export interface LigneOcr { readonly mots: readonly MotOcr[]; readonly boite: BoiteOcr; readonly ligneDeBase: BoiteOcr; readonly hauteur: number }
export interface ParagrapheOcr { readonly lignes: readonly LigneOcr[] }

/** La confiance moyenne (0 a 100) sous laquelle une ligne reconnue est tenue pour du bruit. */
export const SEUIL_CONFIANCE = 55;

/** La part de la taille au-dessus de la ligne de base pour la police de remplacement (Arial : 0,905). */
const ASCENDANTE = 0.9;
/**
 * La hauteur d'une rangee mesuree par Tesseract va du bas des jambages au haut des hampes ; dans Arial, la police de
 * remplacement, cet ecart vaut 0,93 de la taille. Diviser par lui donne a Arial la hauteur de la ligne scannee.
 */
const ETENDUE_ARIAL = 0.93;
/**
 * Un blanc de plus d'une fois et demie la hauteur de la rangee entre deux mots n'est pas une espace : c'est un
 * changement de colonne (une facture, un tableau). La ligne s'y coupe en cellules, chacune a sa place.
 */
const BLANC_DE_COLONNE = 1.5;

const TEXTE_UTILE = /[\p{L}\p{N}]/u;

/** Vrai si la ligne est assez sure pour devenir du texte. */
export function ligneSure(l: LigneOcr, seuil = SEUIL_CONFIANCE): boolean {
  const mots = l.mots.filter(m => m.texte.trim() !== '');
  if (mots.length === 0 || !mots.some(m => TEXTE_UTILE.test(m.texte))) return false;
  return mots.reduce((s, m) => s + m.confiance, 0) / mots.length >= seuil;
}

/** Les mots d'une ligne, groupes en cellules : une nouvelle cellule a chaque blanc de colonne. */
function cellules(l: LigneOcr): MotOcr[][] {
  const hauteur = l.hauteur > 0 ? l.hauteur : l.boite.y1 - l.boite.y0;
  const groupes: MotOcr[][] = [];
  for (const m of l.mots.filter(x => x.texte.trim() !== '')) {
    const groupe = groupes[groupes.length - 1];
    const dernier = groupe?.[groupe.length - 1];
    if (groupe === undefined || dernier === undefined || m.boite.x0 - dernier.boite.x1 > hauteur * BLANC_DE_COLONNE) groupes.push([m]);
    else groupe.push(m);
  }
  return groupes;
}

const texteDeMots = (mots: readonly MotOcr[]): string => mots.map(m => m.texte.trim()).join(' ');

/** Le texte d'une ligne au fil : les cellules separees par une tabulation, pour que les colonnes restent lisibles. */
const texteDe = (l: LigneOcr): string => cellules(l).map(texteDeMots).join('\t');

/**
 * Les lignes sures, posees en points (`pointsParPixel` : 72 / la resolution de l'image). La taille est la hauteur de
 * la rangee mesuree par Tesseract ; le haut de la boite se deduit de la ligne de base, pour que le texte de
 * remplacement tombe sur elle ; l'angle suit la pente de la ligne de base (un scan un peu de travers).
 */
export function lignesOcrPosees(paragraphes: readonly ParagrapheOcr[], pointsParPixel: number, seuil = SEUIL_CONFIANCE): LignePosee[] {
  return paragraphes.flatMap(p => p.lignes).filter(l => ligneSure(l, seuil)).flatMap(l => {
    const taille = (Math.max(1, l.hauteur > 0 ? l.hauteur : l.boite.y1 - l.boite.y0) / ETENDUE_ARIAL) * pointsParPixel;
    const b = l.ligneDeBase;
    const pente = b.x1 !== b.x0 ? (b.y1 - b.y0) / (b.x1 - b.x0) : 0;
    const angle = (Math.atan(pente) * 180) / Math.PI;
    // Une zone par cellule : les colonnes d'un tableau gardent leur place, chacune sur la ligne de base de la rangee.
    return cellules(l).flatMap(mots => {
      const premier = mots[0], dernier = mots[mots.length - 1];
      if (premier === undefined || dernier === undefined) return [];
      const base = (b.y0 + pente * (premier.boite.x0 - b.x0)) * pointsParPixel;
      return [{
        x: premier.boite.x0 * pointsParPixel, haut: base - ASCENDANTE * taille,
        largeur: (dernier.boite.x1 - premier.boite.x0) * pointsParPixel, taille, angle: Math.abs(angle) < 0.3 ? 0 : angle,
        segments: [{ texte: texteDeMots(mots), police: 'Arial', gras: false, italique: false }]
      }];
    });
  });
}

/** Les boites a effacer de l'image, dans l'ordre de `lignesOcrPosees` : une par cellule des lignes sures. */
export function boitesOcr(paragraphes: readonly ParagrapheOcr[], seuil = SEUIL_CONFIANCE): BoiteOcr[] {
  return paragraphes.flatMap(p => p.lignes).filter(l => ligneSure(l, seuil)).flatMap(l => cellules(l).flatMap(mots => {
    if (mots.length === 0) return [];
    return [{ x0: Math.min(...mots.map(m => m.boite.x0)), y0: Math.min(...mots.map(m => m.boite.y0)), x1: Math.max(...mots.map(m => m.boite.x1)), y1: Math.max(...mots.map(m => m.boite.y1)) }];
  }));
}

/**
 * Les paragraphes reconnus, au fil : les lignes sures d'un paragraphe se suivent, un mot coupe en fin de ligne
 * (« trans- » puis « port ») se recolle. Une ligne a plusieurs colonnes (une rangee de tableau) reste seule, ses
 * cellules separees par des tabulations : la recoller a la suivante melangerait les rangees.
 */
export function paragraphesOcr(paragraphes: readonly ParagrapheOcr[], seuil = SEUIL_CONFIANCE): string[] {
  return paragraphes.flatMap(p => {
    const sortie: string[] = [];
    let texte = '';
    for (const l of p.lignes.filter(x => ligneSure(x, seuil))) {
      const t = texteDe(l);
      if (t.includes('\t')) {
        if (texte !== '') sortie.push(texte);
        sortie.push(t);
        texte = '';
      } else if (texte === '') texte = t;
      else if (/\p{L}-$/u.test(texte) && /^\p{Ll}/u.test(t)) texte = texte.slice(0, -1) + t;
      else texte += ' ' + t;
    }
    if (texte !== '') sortie.push(texte);
    return sortie;
  });
}

/** Une image RGBA modifiable : les pixels d'une toile, sa largeur et sa hauteur. */
export interface PixelsModifiables { readonly donnees: Uint8ClampedArray | number[]; readonly largeur: number; readonly hauteur: number }

const hex = (r: number, g: number, b: number): string => [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

/** La mediane d'une liste de nombres (0 pour une liste vide). */
function mediane(v: number[]): number {
  if (v.length === 0) return 0;
  const t = [...v].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)] ?? 0;
}

/**
 * Efface les lignes de l'image, **en ecrivant dans `image`** (le seul calcul de ce module qui modifie ce qu'on lui
 * donne : une page a 300 dpi pese trente-cinq millions d'octets, on ne la copie pas). Pour chaque boite (en pixels,
 * elargie de `marge` pour prendre le bord adouci des lettres) :
 * - le papier est la mediane, par canal, d'un anneau de pixels autour de la boite ;
 * - l'encre est la moyenne des pixels les plus eloignes du papier (au-dela de 60 % de l'ecart le plus fort : le
 *   coeur des lettres, pas leur bord adouci par le flou du scan) ;
 * - la boite est repeinte de la couleur du papier.
 * Rend la couleur d'encre de chaque boite (hexadecimale, sans diese), ou null si rien ne s'y distingue du papier.
 */
export function effacerLignes(image: PixelsModifiables, boites: readonly BoiteOcr[], marge = 3): (string | null)[] {
  const { donnees: d, largeur: L, hauteur: H } = image;
  return boites.map(b => {
    const x0 = Math.max(0, Math.floor(b.x0 - marge)), y0 = Math.max(0, Math.floor(b.y0 - marge));
    const x1 = Math.min(L, Math.ceil(b.x1 + marge)), y1 = Math.min(H, Math.ceil(b.y1 + marge));
    if (x1 <= x0 || y1 <= y0) return null;
    // L'anneau : une bande de trois pixels juste autour de la boite elargie.
    const anneau: [number[], number[], number[]] = [[], [], []];
    for (let y = Math.max(0, y0 - 3); y < Math.min(H, y1 + 3); y++) {
      for (let x = Math.max(0, x0 - 3); x < Math.min(L, x1 + 3); x++) {
        if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
        const i = (y * L + x) * 4;
        anneau[0].push(d[i] ?? 255); anneau[1].push(d[i + 1] ?? 255); anneau[2].push(d[i + 2] ?? 255);
      }
    }
    const papier = anneau.map(mediane) as [number, number, number];
    const ecarts: [number, number, number, number][] = [];
    let plusFort = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * L + x) * 4;
        const r = d[i] ?? 0, g = d[i + 1] ?? 0, bl = d[i + 2] ?? 0;
        const e = Math.abs(r - papier[0]) + Math.abs(g - papier[1]) + Math.abs(bl - papier[2]);
        if (e > 30) { ecarts.push([e, r, g, bl]); plusFort = Math.max(plusFort, e); }
        d[i] = papier[0]; d[i + 1] = papier[1]; d[i + 2] = papier[2];
      }
    }
    const encre = ecarts.filter(e => e[0] >= plusFort * 0.6);
    if (encre.length === 0) return null;
    const moyenne = (k: 1 | 2 | 3) => encre.reduce((s, e) => s + e[k], 0) / encre.length;
    return hex(moyenne(1), moyenne(2), moyenne(3));
  });
}
