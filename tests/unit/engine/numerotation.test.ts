import { describe, it, expect } from 'vitest';
import { NUMEROTATION_DEFAUT, placeDuNumero, texteDuNumero } from '../../../src/engine/numerotation.js';

describe('la numerotation', () => {
  it('ecrit le numero dans le format choisi, a partir du debut choisi', () => {
    expect(texteDuNumero(NUMEROTATION_DEFAUT, 0, 12)).toBe('1');
    expect(texteDuNumero({ ...NUMEROTATION_DEFAUT, format: 'n-sur-total' }, 2, 12)).toBe('3 / 12');
    expect(texteDuNumero({ ...NUMEROTATION_DEFAUT, format: 'page-n-sur-total', debut: 5 }, 0, 3)).toBe('Page 5 sur 7');
  });

  it('saute la couverture, qui compte pourtant', () => {
    const n = { ...NUMEROTATION_DEFAUT, sauterPremiere: true };
    expect(texteDuNumero(n, 0, 3)).toBeNull();
    expect(texteDuNumero(n, 1, 3)).toBe('2');
  });

  it('pose le numero a une marge du bord vu', () => {
    expect(placeDuNumero('bas-centre', 600, 800, 20)).toEqual({ u: 290, v: 772 });
    expect(placeDuNumero('haut-droite', 600, 800, 20).u).toBe(552);
    expect(placeDuNumero('bas-gauche', 40, 40, 5)).toEqual({ u: 10, v: 30 });
  });
});
