import { describe, it, expect } from 'vitest';
import { deplacementClavier, restreindre, SELECTION_VIDE, toucher, toutOuRien } from '../../../src/engine/selection.js';

const ordre = ['a', 'b', 'c', 'd', 'e'];
const simple = { etendre: false, basculer: false };
const ids = (s: { ids: ReadonlySet<string> }) => [...s.ids].sort();

describe('selection', () => {
  it('un clic choisit une page seule et pose l ancre', () => {
    expect(toucher({ ids: new Set(['a', 'b']), ancre: 'a' }, ordre, 'c', simple)).toEqual({ ids: new Set(['c']), ancre: 'c' });
  });

  it('Ctrl bascule une page, Maj etend depuis l ancre dans les deux sens', () => {
    const s = toucher(toucher(SELECTION_VIDE, ordre, 'b', simple), ordre, 'd', { etendre: false, basculer: true });
    expect(ids(s)).toEqual(['b', 'd']);
    expect(ids(toucher(s, ordre, 'b', { etendre: false, basculer: true }))).toEqual(['d']);
    expect(ids(toucher({ ids: new Set(['d']), ancre: 'd' }, ordre, 'b', { etendre: true, basculer: false }))).toEqual(['b', 'c', 'd']);
    expect(ids(toucher({ ids: new Set(['a']), ancre: 'a' }, ordre, 'c', { etendre: true, basculer: false }))).toEqual(['a', 'b', 'c']);
    expect(ids(toucher({ ids: new Set(['e']), ancre: 'a' }, ordre, 'b', { etendre: true, basculer: true }))).toEqual(['a', 'b', 'e']);
  });

  it('Ctrl+A choisit tout, puis rien', () => {
    const tout = toutOuRien(SELECTION_VIDE, ordre);
    expect(ids(tout)).toEqual(ordre);
    expect(toutOuRien(tout, ordre)).toBe(SELECTION_VIDE);
  });

  it('oublie les pages retirees, et rend la meme selection si rien ne change', () => {
    const s = { ids: new Set(['a', 'z']), ancre: 'z' };
    expect(restreindre(s, ordre)).toEqual({ ids: new Set(['a']), ancre: null });
    const t = { ids: new Set(['a']), ancre: 'a' };
    expect(restreindre(t, ordre)).toBe(t);
  });

  it('les fleches se deplacent dans la grille sans en sortir', () => {
    expect(deplacementClavier(0, 10, 4, 'ArrowRight')).toBe(1);
    expect(deplacementClavier(0, 10, 4, 'ArrowLeft')).toBe(0);
    expect(deplacementClavier(1, 10, 4, 'ArrowDown')).toBe(5);
    expect(deplacementClavier(8, 10, 4, 'ArrowDown')).toBe(9);
    expect(deplacementClavier(5, 10, 4, 'Home')).toBe(0);
    expect(deplacementClavier(5, 10, 4, 'End')).toBe(9);
    expect(deplacementClavier(5, 10, 4, 'x')).toBeNull();
    expect(deplacementClavier(0, 0, 4, 'End')).toBeNull();
  });
});
