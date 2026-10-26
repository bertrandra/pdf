// Lire un tableau a un index que l'on sait valide, sans assertion `!` (FF-15).
//
// Sous `noUncheckedIndexedAccess`, `t[i]` est `T | undefined`. Un `!` le ferait taire et laisserait
// passer `undefined` si l'on se trompe ; `au` le dit tout de suite, avec l'index et la longueur.

/** L'element `i` de `t`, ou une RangeError nommee s'il n'existe pas. */
export function au<T>(t: readonly T[], i: number): T {
  if (!Number.isInteger(i) || i < 0 || i >= t.length) {
    throw new RangeError('au : index ' + i + ' hors de [0, ' + t.length + ')');
  }
  return t[i] as T;
}
