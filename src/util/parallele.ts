// Mener des travaux a plusieurs a la fois, en gardant l'ordre des resultats : la reconnaissance de caracteres
// travaille sur plusieurs pages en meme temps, mais le document se compose dans l'ordre des pages.

/**
 * Applique `f` a chaque element, `n` au plus a la fois, et rend les resultats dans l'ordre des elements. La premiere
 * erreur arrete de lancer de nouveaux travaux et remonte, une fois ceux en cours finis (rien ne reste en l'air).
 */
export async function enParallele<T, R>(elements: readonly T[], n: number, f: (e: T, i: number) => Promise<R>): Promise<R[]> {
  const resultats: R[] = new Array<R>(elements.length);
  let suivant = 0;
  let echec: { erreur: unknown } | null = null;
  const fil = async () => {
    while (echec === null && suivant < elements.length) {
      const i = suivant++;
      try {
        resultats[i] = await f(elements[i] as T, i);
      } catch (erreur) {
        echec ??= { erreur };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, elements.length)) }, fil));
  if (echec !== null) throw (echec as { erreur: unknown }).erreur;
  return resultats;
}
