// La conversion d'un montage en PowerPoint ou en Word (ADR-0005) : io dessine chaque page (pdf.js) ou en lit le
// texte, l'ecriture pure (export/pptx.ts, export/docx.ts) en fait le fichier. Les pages se traitent une a une, dans
// l'ordre, et chacune est annoncee : une conversion de deux cents pages prend une minute, il faut voir qu'elle avance.

import { paragraphes } from '../engine/texte.js';
import { ecrireDocxFidele, ecrireDocxTexte } from '../export/docx.js';
import type { PageImage } from '../export/ooxml.js';
import { ecrirePptx } from '../export/pptx.js';
import { pageSource, tailleVue, type Montage, type PageMontee } from '../model/montage.js';
import { imageDePage, texteDePage } from './apercu.js';

export type FormatConversion = 'pptx' | 'docx-fidele' | 'docx-texte';

/** La resolution des images de page : de quoi lire et imprimer une page A4 sans peser plus de quelques centaines de Ko. */
export const DPI_CONVERSION = 150;
/** Le plus grand cote d'une image de page, en pixels : une affiche de deux metres ne doit pas faire une image de 12 000. */
const COTE_MAX = 4000;

export const EXTENSIONS: Record<FormatConversion, string> = { 'pptx': 'pptx', 'docx-fidele': 'docx', 'docx-texte': 'docx' };
export const TYPES_MIME: Record<FormatConversion, string> = {
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'docx-fidele': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'docx-texte': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

/** La largeur en pixels de l'image d'une page de `largeur` x `hauteur` points vus, a la resolution de conversion. */
export function largeurDImage(largeur: number, hauteur: number): number {
  const k = Math.min(DPI_CONVERSION / 72, COTE_MAX / Math.max(1, largeur, hauteur));
  return Math.max(1, Math.round(largeur * k));
}

function taille(m: Montage, p: PageMontee): { largeur: number; hauteur: number } {
  const source = pageSource(m, p);
  return source ? tailleVue(source, p) : { largeur: 595, hauteur: 842 };
}

/** Convertit les pages du montage ; `progression` recoit le numero de la page qui vient d'etre traitee. */
export async function convertir(m: Montage, format: FormatConversion, progression: (fait: number, total: number) => void): Promise<Uint8Array> {
  const total = m.pages.length;
  if (format === 'docx-texte') {
    const pages = [];
    for (const [i, p] of m.pages.entries()) {
      // Le texte se lit dans l'espace de la page source, avant toute rotation : l'ordre de lecture ne tourne pas.
      pages.push({ ...taille(m, p), paragraphes: paragraphes(await texteDePage(p.source, p.index)) });
      progression(i + 1, total);
    }
    return ecrireDocxTexte(pages);
  }
  const images: PageImage[] = [];
  for (const [i, p] of m.pages.entries()) {
    const t = taille(m, p);
    images.push({ ...t, format: 'jpeg', image: await imageDePage(p.source, p.index, p.rotation, largeurDImage(t.largeur, t.hauteur), 'jpeg') });
    progression(i + 1, total);
  }
  return format === 'pptx' ? ecrirePptx(images) : ecrireDocxFidele(images);
}
