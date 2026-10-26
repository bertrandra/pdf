import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { estPdf, fichierPdf, lirePdf } from '../../../src/io/lecture.js';
import { pdfChiffre } from '../../aide/chiffre.js';
import { pdfTemoin } from '../../aide/pdfs.js';

// pdf-lib dit sur la console ce qu'il n'arrive pas a lire ; un refus nomme suffit ici.
beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { vi.restoreAllMocks(); });

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

  it('dit qu un PDF est chiffre, avec ou sans mot de passe d ouverture', async () => {
    for (const mot of ['', 'secret']) expect(await lirePdf(pdfChiffre(mot))).toMatchObject({ chiffre: true });
  });

  it('reconnait un PDF par ses octets et un fichier par son type ou son nom', () => {
    expect(estPdf(new TextEncoder().encode('\n\n%PDF-1.7'))).toBe(true);
    expect(fichierPdf({ name: 'x.PDF', type: '' })).toBe(true);
    expect(fichierPdf({ name: 'x.png', type: 'image/png' })).toBe(false);
  });
});
