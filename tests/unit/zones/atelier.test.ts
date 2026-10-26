import { describe, it, expect } from 'vitest';
import { ajouterSource, idsAuxPositions, pivoterPages } from '../../../src/engine/montage.js';
import { MONTAGE_VIDE } from '../../../src/model/montage.js';
import { historique, avancer } from '../../../src/util/historique.js';
import { nomDeSortie, placeDePageBlanche, refusProtege, sourcesUtiles } from '../../../src/zones/atelier.js';

const page = (largeur: number, hauteur: number) => ({ largeur, hauteur, rotation: 0 as const });

describe('nomDeSortie', () => {
  it('reprend le nom du premier PDF ouvert, ou « document.pdf », sans compter une page blanche', () => {
    expect(nomDeSortie(MONTAGE_VIDE)).toBe('document.pdf');
    expect(nomDeSortie(ajouterSource(MONTAGE_VIDE, 'Contrat signé.PDF', []))).toBe('Contrat signé.pdf');
    expect(nomDeSortie(ajouterSource(MONTAGE_VIDE, '.pdf', []))).toBe('document.pdf');
    const blanche = ajouterSource(MONTAGE_VIDE, 'Page blanche', [page(1, 1)], 0, true);
    expect(nomDeSortie(ajouterSource(blanche, 'rapport.pdf', []))).toBe('rapport.pdf');
  });
});

describe('placeDePageBlanche', () => {
  it('se pose apres la derniere page choisie, a la taille vue de sa voisine', () => {
    let m = ajouterSource(MONTAGE_VIDE, 'a.pdf', [page(595, 842), page(842, 595), page(595, 842)]);
    expect(placeDePageBlanche(m, idsAuxPositions(m, [0, 1]))).toEqual({ position: 2, t: { largeur: 842, hauteur: 595 } });
    m = pivoterPages(m, idsAuxPositions(m, [2]), 1);
    expect(placeDePageBlanche(m, new Set())).toEqual({ position: 3, t: { largeur: 842, hauteur: 595 } });
    expect(placeDePageBlanche(MONTAGE_VIDE, new Set()).position).toBe(0);
  });
});

describe('sourcesUtiles et refusProtege', () => {
  it('garde les sources que l historique peut encore remonter', () => {
    const a = ajouterSource(MONTAGE_VIDE, 'a.pdf', [page(1, 1)]);
    const h = avancer(avancer(historique(MONTAGE_VIDE), a), MONTAGE_VIDE);
    expect([...sourcesUtiles(h)]).toEqual(['s1']);
    expect([...sourcesUtiles(historique(MONTAGE_VIDE))]).toEqual([]);
  });

  it('distingue une protection du proprietaire d un mot de passe', () => {
    expect(refusProtege('proprietaire')).toMatch(/interdit la modification/);
    expect(refusProtege('mot-de-passe')).toMatch(/mot de passe/);
  });
});
