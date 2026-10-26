// Le texte d'un PDF ecrit, tel que pdf.js le lit, place dans le repere vu de chaque page (origine en haut a gauche,
// rotation comprise) : de quoi verifier qu'un numero ou une couche de texte tombe la ou on l'a voulu.

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface TexteVu { str: string; u: number; v: number }

export async function texteVu(octets: Uint8Array): Promise<TexteVu[][]> {
  const doc = await getDocument({ data: octets.slice(), isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise;
  const pages: TexteVu[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vue = page.getViewport({ scale: 1 });
    const contenu = await page.getTextContent({ includeMarkedContent: false });
    pages.push(contenu.items.flatMap(item => {
      if (!('str' in item) || item.str.trim() === '') return [];
      const [u = 0, v = 0] = vue.convertToViewportPoint(item.transform[4] as number, item.transform[5] as number);
      return [{ str: item.str, u: Math.round(u), v: Math.round(v) }];
    }));
  }
  await doc.destroy();
  return pages;
}
