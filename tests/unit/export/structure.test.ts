import { describe, it, expect } from 'vitest';
import { ajouterSource, idsAuxPositions, garderPages, inverserPages, scinder } from '../../../src/engine/montage.js';
import { assembler, assemblerPrepare, preparer } from '../../../src/export/assemblage.js';
import { lirePdf } from '../../../src/io/lecture.js';
import { MONTAGE_VIDE, type Montage } from '../../../src/model/montage.js';
import { a4, lireStructure, pdfStructure, pdfTemoin } from '../../aide/pdfs.js';

async function ouvrir(m: Montage, nom: string, octets: Uint8Array, sources: Map<string, Uint8Array>): Promise<Montage> {
  const lu = await lirePdf(octets);
  if ('erreur' in lu) throw new Error(lu.erreur);
  const suivant = ajouterSource(m, nom, lu.pages);
  sources.set(suivant.sources[suivant.sources.length - 1]?.id ?? '', octets);
  return suivant;
}

describe('ce qui survit a la fusion', () => {
  it('garde signets, liens et champs d un PDF reecrit tel quel', async () => {
    const sources = new Map<string, Uint8Array>();
    const m = await ouvrir(MONTAGE_VIDE, 's.pdf', await pdfStructure(), sources);
    const lu = await lireStructure(await assembler(m, sources));
    expect(lu.signets).toEqual([
      { titre: 'Chapitre 1', page: 0, compte: 1, enfants: [{ titre: 'Section 1.1', page: 1, compte: null, enfants: [] }] },
      { titre: 'Chapitre 2', page: 2, compte: -1, enfants: [{ titre: 'Annexe', page: 3, compte: null, enfants: [] }] }
    ]);
    expect(lu.liens).toEqual([[2], [3], [], []]);
    expect(lu.champs).toEqual([{ nom: 'nom', pages: [0] }, { nom: 'visa', pages: [1, 3] }]);
    expect(lu.objetsPage).toBe(4);
  });

  it('suit les pages rangees, et retire liens, signets et widgets des pages coupees', async () => {
    const sources = new Map<string, Uint8Array>();
    let m = await ouvrir(MONTAGE_VIDE, 's.pdf', await pdfStructure(), sources);
    m = garderPages(m, idsAuxPositions(m, [0, 1, 3]));
    m = inverserPages(m, idsAuxPositions(m, [0, 1, 2]));
    const lu = await lireStructure(await assembler(m, sources));
    // Pages ecrites : 4, 2, 1. La page 3 est coupee : son lien entrant part, « Chapitre 2 » mene a l'annexe.
    expect(lu.signets).toEqual([
      { titre: 'Chapitre 1', page: 2, compte: 1, enfants: [{ titre: 'Section 1.1', page: 1, compte: null, enfants: [] }] },
      { titre: 'Chapitre 2', page: 0, compte: -1, enfants: [{ titre: 'Annexe', page: 0, compte: null, enfants: [] }] }
    ]);
    expect(lu.liens).toEqual([[], [0], []]);
    expect(lu.champs).toEqual([{ nom: 'visa', pages: [1, 0] }, { nom: 'nom', pages: [2] }]);
    // Aucune page orpheline : un lien vers une page coupee n'entraine plus sa copie dans le fichier.
    expect(lu.objetsPage).toBe(3);
  });

  it('fusionne deux formulaires sans melanger leurs champs, et met les signets bout a bout', async () => {
    const sources = new Map<string, Uint8Array>();
    let m = await ouvrir(MONTAGE_VIDE, 'a.pdf', await pdfStructure('A'), sources);
    m = await ouvrir(m, 'b.pdf', await pdfStructure('B'), sources);
    const lu = await lireStructure(await assembler(m, sources));
    expect(lu.signets.map(s => [s.titre, s.page])).toEqual([['Chapitre 1', 0], ['Chapitre 2', 2], ['Chapitre 1', 4], ['Chapitre 2', 6]]);
    expect(lu.champs.map(c => c.nom)).toEqual(['nom', 'visa', 'nom_2', 'visa_2']);
    expect(lu.liens).toEqual([[2], [3], [], [], [6], [7], [], []]);
  });

  it('donne a chaque partie d une scission ses signets, ses liens et ses champs', async () => {
    const sources = new Map<string, Uint8Array>();
    const m = await ouvrir(MONTAGE_VIDE, 's.pdf', await pdfStructure(), sources);
    const preparees = await preparer(m, sources);
    const [un, deux] = await Promise.all(scinder(m, { type: 'chaque', n: 2 }).map(async p => lireStructure(await assemblerPrepare(p, preparees))));
    expect(un?.signets.map(s => s.titre)).toEqual(['Chapitre 1']);
    expect(un?.liens).toEqual([[], []]);
    expect(un?.champs).toEqual([{ nom: 'nom', pages: [0] }, { nom: 'visa', pages: [1] }]);
    expect(deux?.signets.map(s => [s.titre, s.page])).toEqual([['Chapitre 2', 0]]);
    expect(deux?.champs).toEqual([{ nom: 'visa', pages: [1] }]);
  });

  it('ecrit les memes octets pour les memes entrees, que les sources soient preparees une fois ou a chaque partie', async () => {
    const sources = new Map<string, Uint8Array>();
    const m = await ouvrir(MONTAGE_VIDE, 's.pdf', await pdfStructure(), sources);
    const parties = scinder(m, { type: 'chaque', n: 3 });
    const preparees = await preparer(m, sources);
    for (const p of parties) {
      const [une, chaque] = [await assemblerPrepare(p, preparees), await assembler(p, sources)];
      expect(Buffer.from(une).equals(Buffer.from(chaque))).toBe(true);
    }
  });

  it('n ajoute rien a un PDF sans structure', async () => {
    const sources = new Map<string, Uint8Array>();
    const m = await ouvrir(MONTAGE_VIDE, 'a.pdf', await pdfTemoin('A', a4(2)), sources);
    const ecrit = new TextDecoder('latin1').decode(await assembler(m, sources));
    expect(ecrit).not.toMatch(/Outlines|AcroForm/);
  });
});
