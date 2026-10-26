import { describe, it, expect } from 'vitest';
import { ajouterSource, idsAuxPositions, pivoterPages, scinder, deplacerPages } from '../../../src/engine/montage.js';
import { assembler, ErreurAssemblage } from '../../../src/export/assemblage.js';
import { lirePdf } from '../../../src/io/lecture.js';
import { MONTAGE_VIDE, type Montage } from '../../../src/model/montage.js';
import { a4, pagesDe, pdfTemoin } from '../../aide/pdfs.js';

async function ouvrir(m: Montage, nom: string, octets: Uint8Array, sources: Map<string, Uint8Array>): Promise<Montage> {
  const lu = await lirePdf(octets);
  if ('erreur' in lu) throw new Error(lu.erreur);
  const suivant = ajouterSource(m, nom, lu.pages);
  sources.set(suivant.sources[suivant.sources.length - 1]?.id ?? '', octets);
  return suivant;
}

describe('assembler', () => {
  it('fusionne deux PDF dans l ordre du montage, rotations comprises', async () => {
    const sources = new Map<string, Uint8Array>();
    let m = await ouvrir(MONTAGE_VIDE, 'a.pdf', await pdfTemoin('A', a4(2)), sources);
    m = await ouvrir(m, 'b.pdf', await pdfTemoin('B', [{ largeur: 300, hauteur: 200, rotation: 90 }]), sources);
    m = deplacerPages(m, idsAuxPositions(m, [2]), 0);
    m = pivoterPages(m, idsAuxPositions(m, [0, 1]), 1);
    expect(await pagesDe(await assembler(m, sources))).toEqual([
      { largeur: 300, hauteur: 200, rotation: 180 },
      { largeur: 595, hauteur: 842, rotation: 90 },
      { largeur: 595, hauteur: 842, rotation: 0 }
    ]);
  });

  it('ecrit les memes octets pour les memes entrees', async () => {
    const sources = new Map<string, Uint8Array>();
    const m = await ouvrir(MONTAGE_VIDE, 'a.pdf', await pdfTemoin('A', a4(3)), sources);
    const [un, deux] = [await assembler(m, sources), await assembler(m, sources)];
    expect(Buffer.from(un).equals(Buffer.from(deux))).toBe(true);
    expect(new TextDecoder('latin1').decode(un)).not.toMatch(/CreationDate|ModDate|Producer/);
  });

  it('pose deux fois une page montee deux fois', async () => {
    const sources = new Map<string, Uint8Array>();
    const m = await ouvrir(MONTAGE_VIDE, 'a.pdf', await pdfTemoin('A', a4(2)), sources);
    const double: Montage = { ...m, pages: [...m.pages, { ...m.pages[0] ?? m.pages[1] ?? { id: '', source: '', index: 0, rotation: 0 }, id: 'p99', rotation: 90 }] };
    expect((await pagesDe(await assembler(double, sources))).map(p => p.rotation)).toEqual([0, 0, 90]);
  });

  it('scinde en documents qui ne portent que leurs pages', async () => {
    const sources = new Map<string, Uint8Array>();
    const m = await ouvrir(MONTAGE_VIDE, 'a.pdf', await pdfTemoin('A', a4(5)), sources);
    const parties = await Promise.all(scinder(m, { type: 'chaque', n: 2 }).map(p => assembler(p, sources)));
    expect(await Promise.all(parties.map(async o => (await pagesDe(o)).length))).toEqual([2, 2, 1]);
  });

  it('refuse un montage vide ou une source perdue, en le nommant', async () => {
    await expect(assembler(MONTAGE_VIDE, new Map())).rejects.toBeInstanceOf(ErreurAssemblage);
    const m = ajouterSource(MONTAGE_VIDE, 'perdu.pdf', [{ largeur: 1, hauteur: 1, rotation: 0 }]);
    await expect(assembler(m, new Map())).rejects.toThrow('« perdu.pdf »');
  });
});
