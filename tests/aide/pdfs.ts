// Des PDF temoins, fabriques par pdf-lib : chaque page porte son numero et sa taille, pour qu'un test sache
// quelle page il lit apres une fusion ou une scission sans comparer des images.

import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';

export interface PageTemoin { largeur: number; hauteur: number; rotation?: number }

/** Un PDF de pages temoins ; `titre` s'ecrit sur chacune, suivi de son numero. Les metadonnees sont fixes. */
export async function pdfTemoin(titre: string, pages: readonly PageTemoin[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const police = await doc.embedFont(StandardFonts.Helvetica);
  pages.forEach((p, i) => {
    const page = doc.addPage([p.largeur, p.hauteur]);
    page.drawText(titre + ' ' + (i + 1), { x: 20, y: p.hauteur / 2, size: 24, font: police });
    if (p.rotation !== undefined) page.setRotation(degrees(p.rotation));
  });
  return doc.save();
}

/** Les tailles (et rotations) des pages d'un PDF, pour comparer un resultat a ce qu'on attend. */
export async function pagesDe(octets: Uint8Array): Promise<{ largeur: number; hauteur: number; rotation: number }[]> {
  const doc = await PDFDocument.load(octets, { updateMetadata: false });
  return doc.getPages().map(p => ({ largeur: p.getWidth(), hauteur: p.getHeight(), rotation: p.getRotation().angle }));
}

/** Des pages A4 portrait, autant qu'il en faut. */
export const a4 = (n: number): PageTemoin[] => Array.from({ length: n }, () => ({ largeur: 595, hauteur: 842 }));
