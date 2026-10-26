// Une page blanche a inserer : un PDF d'une page vide, ecrit par pdf-lib sans date ni producteur. Elle devient une
// source comme une autre (ADR-0001) ; ses octets ne dependent que de sa taille.

import { PDFDocument } from 'pdf-lib';

/** Le PDF d'une page blanche de `largeur` x `hauteur` points. */
export async function pdfBlanc(largeur: number, hauteur: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.addPage([Math.max(1, largeur), Math.max(1, hauteur)]);
  return doc.save({ useObjectStreams: true });
}
