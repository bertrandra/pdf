import { describe, it, expect } from 'vitest';
import {
  ajouterSource, deplacerPages, dupliquerPages, garderPages, idsAuxPositions, inverserPages, nomsDesParties, partiesDeScission,
  numeroter, pivoterPages, retirerPages, scinder
} from '../../../src/engine/montage.js';
import { MONTAGE_VIDE, tailleVue, type Montage, type PageSource } from '../../../src/model/montage.js';

const page = (largeur = 595, hauteur = 842): PageSource => ({ largeur, hauteur, rotation: 0 });
const pages = (n: number): PageSource[] => Array.from({ length: n }, () => page());
const ordre = (m: Montage) => m.pages.map(p => p.source + ':' + p.index);

describe('fusion', () => {
  it('ajoute les sources a la suite, avec des identifiants de compteur', () => {
    const m = ajouterSource(ajouterSource(MONTAGE_VIDE, 'a.pdf', pages(2)), 'b.pdf', pages(1));
    expect(m.sources.map(s => s.id + '=' + s.nom)).toEqual(['s1=a.pdf', 's4=b.pdf']);
    expect(m.pages.map(p => p.id)).toEqual(['p2', 'p3', 'p5']);
    expect(ordre(m)).toEqual(['s1:0', 's1:1', 's4:0']);
  });

  it('insere avant une position', () => {
    const m = ajouterSource(ajouterSource(MONTAGE_VIDE, 'a.pdf', pages(2)), 'b.pdf', pages(1), 1);
    expect(ordre(m)).toEqual(['s1:0', 's4:0', 's1:1']);
  });

  it('se rejoue a l identique', () => {
    const f = () => ajouterSource(ajouterSource(MONTAGE_VIDE, 'a.pdf', pages(3)), 'b.pdf', pages(2));
    expect(f()).toEqual(f());
  });
});

describe('operations sur les pages', () => {
  const m = ajouterSource(ajouterSource(MONTAGE_VIDE, 'a.pdf', pages(3)), 'b.pdf', pages(2));
  const ids = (...positions: number[]) => idsAuxPositions(m, positions);

  it('retire, et oublie la source qui n a plus de page', () => {
    const r = retirerPages(m, ids(3, 4));
    expect(ordre(r)).toEqual(['s1:0', 's1:1', 's1:2']);
    expect(r.sources.map(s => s.nom)).toEqual(['a.pdf']);
    expect(retirerPages(m, new Set(['inconnu']))).toBe(m);
  });

  it('decoupe : ne garde que la selection, dans l ordre du montage', () => {
    expect(ordre(garderPages(m, ids(4, 0)))).toEqual(['s1:0', 's5:1']);
    expect(garderPages(m, ids(0, 1, 2, 3, 4))).toBe(m);
  });

  it('deplace un groupe devant une position, ou au bout', () => {
    expect(ordre(deplacerPages(m, ids(3, 4), 0))).toEqual(['s5:0', 's5:1', 's1:0', 's1:1', 's1:2']);
    expect(ordre(deplacerPages(m, ids(0), 5))).toEqual(['s1:1', 's1:2', 's5:0', 's5:1', 's1:0']);
    expect(ordre(deplacerPages(m, ids(0, 2), 4))).toEqual(['s1:1', 's5:0', 's1:0', 's1:2', 's5:1']);
    expect(deplacerPages(m, ids(1), 1)).toBe(m);
    expect(deplacerPages(m, ids(1), 2)).toBe(m);
  });

  it('pivote d un quart de tour dans les deux sens, et la taille vue suit', () => {
    const r = pivoterPages(m, ids(0), 1);
    expect(r.pages[0]?.rotation).toBe(90);
    expect(pivoterPages(r, ids(0), -1).pages[0]?.rotation).toBe(0);
    expect(pivoterPages(m, ids(0), -1).pages[0]?.rotation).toBe(270);
    const p = r.pages[0];
    if (p) expect(tailleVue(page(), p)).toEqual({ largeur: 842, hauteur: 595 });
  });

  it('inverse l ordre de la selection, sur place', () => {
    expect(ordre(inverserPages(m, ids(0, 2, 4)))).toEqual(['s5:1', 's1:1', 's1:2', 's5:0', 's1:0']);
    expect(inverserPages(m, ids(1))).toBe(m);
  });
});

describe('scission', () => {
  it('toutes les n pages, sans partie vide', () => {
    expect(partiesDeScission(5, { type: 'chaque', n: 2 })).toEqual([[0, 1], [2, 3], [4]]);
    expect(partiesDeScission(4, { type: 'chaque', n: 1 })).toEqual([[0], [1], [2], [3]]);
    expect(partiesDeScission(3, { type: 'chaque', n: 0 })).toEqual([[0], [1], [2]]);
    expect(partiesDeScission(0, { type: 'chaque', n: 2 })).toEqual([]);
  });

  it('avant des positions, dans n importe quel ordre, doublons et hors bornes ignores', () => {
    expect(partiesDeScission(6, { type: 'avant', positions: [4, 2, 2, 0, 9] })).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it('en groupes ecrits', () => {
    expect(partiesDeScission(6, { type: 'groupes', groupes: [[0, 0], [], [5, 4]] })).toEqual([[0, 0], [5, 4]]);
  });

  it('chaque partie ne garde que ses sources', () => {
    const m = ajouterSource(ajouterSource(MONTAGE_VIDE, 'a.pdf', pages(2)), 'b.pdf', pages(2));
    const parts = scinder(m, { type: 'chaque', n: 2 });
    expect(parts.map(p => p.sources.map(s => s.nom))).toEqual([['a.pdf'], ['b.pdf']]);
    expect(parts.map(ordre)).toEqual([['s1:0', 's1:1'], ['s4:0', 's4:1']]);
  });

  it('nomme les parties pour que l ordre alphabetique soit le bon', () => {
    expect(nomsDesParties('rapport.PDF', 3)).toEqual(['rapport-1.pdf', 'rapport-2.pdf', 'rapport-3.pdf']);
    expect(nomsDesParties('x.pdf', 12)[0]).toBe('x-01.pdf');
    expect(nomsDesParties('.pdf', 1)).toEqual(['document-1.pdf']);
  });
});

describe('dupliquerPages et numeroter', () => {
  it('pose les copies apres chaque groupe de pages choisies qui se suivent, avec leurs propres ids', () => {
    const m = ajouterSource(MONTAGE_VIDE, 'a.pdf', Array.from({ length: 4 }, () => ({ largeur: 1, hauteur: 1, rotation: 0 as const })));
    const d = dupliquerPages(m, idsAuxPositions(m, [1, 2, 3]));
    expect(d.pages.map(p => p.index)).toEqual([0, 1, 2, 3, 1, 2, 3]);
    expect(new Set(d.pages.map(p => p.id)).size).toBe(7);
    expect(dupliquerPages(m, new Set())).toBe(m);
  });

  it('pose et retire la numerotation, sans rien empiler quand rien ne change', () => {
    const n = { position: 'bas-centre', format: 'n', debut: 1, sauterPremiere: false } as const;
    const m = numeroter(MONTAGE_VIDE, n);
    expect(m.numerotation).toEqual(n);
    expect(numeroter(m, { ...n })).toBe(m);
    expect(numeroter(m, null)).toEqual(MONTAGE_VIDE);
    expect(numeroter(MONTAGE_VIDE, null)).toBe(MONTAGE_VIDE);
  });
});
