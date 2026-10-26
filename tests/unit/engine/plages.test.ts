import { describe, it, expect } from 'vitest';
import { ecrirePlages, lireGroupes, lirePlages } from '../../../src/engine/plages.js';

describe('lirePlages', () => {
  it('lit pages, plages, bouts ouverts et separateurs varies', () => {
    expect(lirePlages('1-3, 5', 10)).toEqual({ positions: [0, 1, 2, 4] });
    expect(lirePlages('8-', 10)).toEqual({ positions: [7, 8, 9] });
    expect(lirePlages('-2;4 6', 10)).toEqual({ positions: [0, 1, 3, 5] });
    expect(lirePlages(' 2 - 4 ', 10)).toEqual({ positions: [1, 2, 3] });
    expect(lirePlages('2–3', 10)).toEqual({ positions: [1, 2] });
  });

  it('garde l ordre ecrit : une plage decroissante inverse, un doublon reste', () => {
    expect(lirePlages('3-1', 5)).toEqual({ positions: [2, 1, 0] });
    expect(lirePlages('1, 1', 5)).toEqual({ positions: [0, 0] });
  });

  it('refuse en nommant ce qui ne va pas', () => {
    expect(lirePlages('', 5)).toHaveProperty('erreur');
    expect(lirePlages('7', 5)).toEqual({ erreur: 'La page 7 n’existe pas : le document en a 5.' });
    expect(lirePlages('0', 5)).toHaveProperty('erreur');
    expect(lirePlages('a-b', 5)).toEqual({ erreur: '« a-b » n’est pas une page ni une plage (écrivez 3, 2-5, 8- ou -4).' });
    expect(lirePlages('1', 0)).toHaveProperty('erreur');
  });

  it('ecrirePlages est l inverse de la lecture', () => {
    expect(ecrirePlages([0, 1, 2, 4])).toBe('1-3, 5');
    expect(ecrirePlages([])).toBe('');
    expect(ecrirePlages([3, 2])).toBe('4, 3');
    for (const t of ['1-3, 5', '2, 7-9, 12', '1']) {
      const lu = lirePlages(t, 12);
      expect('positions' in lu && ecrirePlages(lu.positions)).toBe(t);
    }
  });
});

describe('lireGroupes', () => {
  it('coupe aux barres obliques et aux retours a la ligne', () => {
    expect(lireGroupes('1-2 / 3\n4-', 5)).toEqual({ groupes: [[0, 1], [2], [3, 4]] });
  });

  it('nomme la partie fautive', () => {
    expect(lireGroupes('1-2 / 9', 5)).toEqual({ erreur: 'Partie 2 : La page 9 n’existe pas : le document en a 5.' });
    expect(lireGroupes(' / ', 5)).toHaveProperty('erreur');
  });
});
