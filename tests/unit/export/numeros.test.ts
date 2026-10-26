import { describe, it, expect } from 'vitest';
import { ajouterSource, idsAuxPositions, numeroter, pivoterPages } from '../../../src/engine/montage.js';
import { assembler } from '../../../src/export/assemblage.js';
import { pdfBlanc } from '../../../src/export/pageBlanche.js';
import { lirePdf } from '../../../src/io/lecture.js';
import { MONTAGE_VIDE, type Montage } from '../../../src/model/montage.js';
import { pagesDe, pdfTemoin } from '../../aide/pdfs.js';
import { texteVu } from '../../aide/texte.js';

async function ouvrir(octets: Uint8Array): Promise<{ m: Montage; sources: Map<string, Uint8Array> }> {
  const lu = await lirePdf(octets);
  if ('erreur' in lu) throw new Error(lu.erreur);
  return { m: ajouterSource(MONTAGE_VIDE, 'a.pdf', lu.pages), sources: new Map([['s1', octets]]) };
}

describe('les numeros de page', () => {
  it('se posent en bas au centre de la page vue, a l endroit meme sur une page tournee', async () => {
    const { m, sources } = await ouvrir(await pdfTemoin('A', [{ largeur: 600, hauteur: 800 }, { largeur: 600, hauteur: 800 }, { largeur: 600, hauteur: 800, rotation: 90 }]));
    const n = numeroter(pivoterPages(m, idsAuxPositions(m, [1]), 1), { position: 'bas-centre', format: 'n-sur-total', debut: 1, sauterPremiere: false });
    const pages = await texteVu(await assembler(n, sources));
    const numeros = pages.map(p => p.find(t => / \/ /.test(t.str)));
    expect(numeros.map(t => t?.str)).toEqual(['1 / 3', '2 / 3', '3 / 3']);
    // Page droite : 600 de large, numero centre, ligne de base a 28 points du bas.
    expect(numeros[0]?.v).toBe(772);
    expect(Math.abs((numeros[0]?.u ?? 0) + 11 - 300)).toBeLessThan(4);
    // Pages tournees (par le montage, puis par la source) : 800 de large a l'ecran, 600 de haut.
    for (const t of [numeros[1], numeros[2]]) {
      expect(t?.v).toBe(572);
      expect(Math.abs((t?.u ?? 0) + 11 - 400)).toBeLessThan(4);
    }
  });

  it('ecrit les memes octets pour les memes entrees, et rien quand on retire la numerotation', async () => {
    const { m, sources } = await ouvrir(await pdfTemoin('A', [{ largeur: 300, hauteur: 300 }]));
    const n = numeroter(m, { position: 'haut-droite', format: 'page-n-sur-total', debut: 3, sauterPremiere: false });
    const [un, deux] = [await assembler(n, sources), await assembler(n, sources)];
    expect(Buffer.from(un).equals(Buffer.from(deux))).toBe(true);
    expect((await texteVu(un))[0]?.some(t => t.str === 'Page 3 sur 3')).toBe(true);
    expect(Buffer.from(await assembler(numeroter(n, null), sources)).equals(Buffer.from(await assembler(m, sources)))).toBe(true);
  });
});

describe('pdfBlanc', () => {
  it('ecrit une page blanche de la taille demandee, toujours aux memes octets', async () => {
    const [un, deux] = [await pdfBlanc(420, 595), await pdfBlanc(420, 595)];
    expect(Buffer.from(un).equals(Buffer.from(deux))).toBe(true);
    expect(await pagesDe(un)).toEqual([{ largeur: 420, hauteur: 595, rotation: 0 }]);
  });
});
