import { describe, it, expect } from 'vitest';
import { estPdf, fichierPdf, lirePdf } from '../../../src/io/lecture.js';
import { pdfTemoin } from '../../aide/pdfs.js';

describe('lirePdf', () => {
  it('lit taille et rotation propre de chaque page', async () => {
    const octets = await pdfTemoin('A', [{ largeur: 595, hauteur: 842 }, { largeur: 300, hauteur: 200, rotation: 270 }]);
    expect(await lirePdf(octets)).toEqual({ pages: [{ largeur: 595, hauteur: 842, rotation: 0 }, { largeur: 300, hauteur: 200, rotation: 270 }] });
  });

  it('refuse sans lever ce qui n est pas un PDF lisible', async () => {
    expect(await lirePdf(new TextEncoder().encode('bonjour'))).toEqual({ erreur: 'Ce fichier n’est pas un PDF.' });
    const tronque = (await pdfTemoin('A', [{ largeur: 10, hauteur: 10 }])).subarray(0, 40);
    expect(await lirePdf(tronque)).toHaveProperty('erreur');
  });

  it('reconnait un PDF par ses octets et un fichier par son type ou son nom', () => {
    expect(estPdf(new TextEncoder().encode('\n\n%PDF-1.7'))).toBe(true);
    expect(fichierPdf({ name: 'x.PDF', type: '' })).toBe(true);
    expect(fichierPdf({ name: 'x.png', type: 'image/png' })).toBe(false);
  });
});
