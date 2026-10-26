import { describe, it, expect } from 'vitest';
import { ajouterSource } from '../../../src/engine/montage.js';
import { MONTAGE_VIDE } from '../../../src/model/montage.js';
import { nomDeSortie } from '../../../src/zones/atelier.js';

describe('nomDeSortie', () => {
  it('reprend le nom du premier PDF ouvert, ou « document.pdf »', () => {
    expect(nomDeSortie(MONTAGE_VIDE)).toBe('document.pdf');
    expect(nomDeSortie(ajouterSource(MONTAGE_VIDE, 'Contrat signé.PDF', []))).toBe('Contrat signé.pdf');
    expect(nomDeSortie(ajouterSource(MONTAGE_VIDE, '.pdf', []))).toBe('document.pdf');
  });
});
