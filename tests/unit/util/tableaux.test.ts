import { describe, it, expect } from 'vitest';
import { au } from '../../../src/util/tableaux.js';

describe('au', () => {
  it('rend l element quand l index existe', () => {
    expect(au(['a', 'b'], 1)).toBe('b');
  });

  it('leve une RangeError nommee hors du tableau', () => {
    expect(() => au(['a'], 1)).toThrow(RangeError);
    expect(() => au(['a'], -1)).toThrow('hors de [0, 1)');
    expect(() => au(['a'], 0.5)).toThrow(RangeError);
  });
});
