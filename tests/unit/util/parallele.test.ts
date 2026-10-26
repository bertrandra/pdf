import { describe, it, expect } from 'vitest';
import { enParallele } from '../../../src/util/parallele.js';

describe('enParallele', () => {
  it('rend les resultats dans l ordre, sans depasser n travaux a la fois', async () => {
    let enCours = 0, plus = 0;
    const attentes = [30, 5, 20, 1, 10];
    const r = await enParallele(attentes, 2, async (ms, i) => {
      enCours++; plus = Math.max(plus, enCours);
      await new Promise(ok => setTimeout(ok, ms));
      enCours--;
      return i * 10;
    });
    expect(r).toEqual([0, 10, 20, 30, 40]);
    expect(plus).toBe(2);
  });

  it('arrete de lancer apres une erreur, et la fait remonter', async () => {
    const lances: number[] = [];
    await expect(enParallele([1, 2, 3, 4], 1, async x => { lances.push(x); if (x === 2) throw new Error('non'); return x; })).rejects.toThrow('non');
    expect(lances).toEqual([1, 2]);
    expect(await enParallele([], 3, async () => 1)).toEqual([]);
  });
});
