import { describe, it, expect } from 'vitest';
import { tailleDuPool } from '../../../src/io/ocr.js';

describe('tailleDuPool', () => {
  it('prend un travailleur par paire de coeurs, trois au plus, un seul sur une petite machine', () => {
    expect(tailleDuPool(8, 16)).toBe(3);
    expect(tailleDuPool(4, undefined)).toBe(2);
    expect(tailleDuPool(1, 8)).toBe(1);
    expect(tailleDuPool(16, 4)).toBe(1);
    expect(tailleDuPool(undefined, undefined)).toBe(1);
  });
});
