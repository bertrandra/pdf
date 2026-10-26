import { describe, it, expect } from 'vitest';
import { compteSignet, fusionnerSignets, poserSignets, type Signet, type SignetPose } from '../../../src/engine/signets.js';

const s = (donnees: string, page: number | null, enfants: Signet<string>[] = [], ouvert = true): Signet<string> => ({ donnees, page, ouvert, enfants });
const arbre = [s('A', 0, [s('A1', 1), s('A2', 2)]), s('B', 3, [s('B1', 4)], false), s('C', null, [s('C1', 5)])];
const resume = (l: readonly SignetPose<string>[]): unknown[] => l.map(x => [x.donnees, x.position, x.propre, resume(x.enfants)]);

describe('poserSignets', () => {
  it('garde l arbre tel quel quand toutes les pages sont posees, a leur nouvelle place', () => {
    expect(resume(poserSignets(arbre, i => 5 - i))).toEqual([
      ['A', 5, true, [['A1', 4, true, []], ['A2', 3, true, []]]], ['B', 2, true, [['B1', 1, true, []]]], ['C', 0, false, [['C1', 0, true, []]]]
    ]);
  });

  it('retire un signet dont la page manque, sauf s il garde des enfants : il mene alors au premier', () => {
    const posees = new Map([[2, 0], [4, 1]]);
    expect(resume(poserSignets(arbre, i => posees.get(i)))).toEqual([['A', 0, false, [['A2', 0, true, []]]], ['B', 1, false, [['B1', 1, true, []]]]]);
  });

  it('ne garde rien quand aucune page n est posee', () => {
    expect(poserSignets(arbre, () => undefined)).toEqual([]);
  });
});

describe('fusionnerSignets et compteSignet', () => {
  it('met les sources bout a bout dans l ordre de leur premiere page', () => {
    const un = poserSignets([s('X', 0)], () => 4), deux = poserSignets([s('Y', 0)], () => 0);
    expect(fusionnerSignets([{ premiere: 4, signets: un }, { premiere: 0, signets: deux }]).map(x => x.donnees)).toEqual(['Y', 'X']);
  });

  it('compte les descendants visibles, en negatif pour un signet ferme', () => {
    const [a, b] = poserSignets([s('A', 0, [s('A1', 1, [s('A11', 2)], false), s('A2', 3)]), s('B', 4, [s('B1', 5, [s('B11', 6)])], false)], i => i);
    expect(a && compteSignet(a)).toBe(2);
    expect(b && compteSignet(b)).toBe(-2);
    expect(compteSignet({ donnees: '', position: 0, propre: true, ouvert: true, enfants: [] })).toBeNull();
  });
});
