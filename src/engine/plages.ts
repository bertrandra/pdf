// Les plages de pages qu'une personne ecrit (« 1-3, 5, 8- ») : lues en positions, ou refusees en disant pourquoi.
// Les numeros ecrits commencent a 1, comme dans tout lecteur de PDF ; les positions rendues commencent a 0.
// Une plage decroissante (« 5-3 ») se lit dans son ordre : c'est une facon d'inverser des pages. Un doublon est
// garde : extraire deux fois la meme page est un souhait legitime (une page de garde repetee).

export type LecturePlages = { readonly positions: readonly number[] } | { readonly erreur: string };

/** Les separateurs admis entre deux morceaux : virgule, point-virgule ou espace. */
const SEPARATEURS = /[,;\s]+/;
const MORCEAU = /^(\d+)?\s*[-–]\s*(\d+)?$|^(\d+)$/;

/** Lit `texte` pour un document de `total` pages. Un texte vide est un refus : il ne designe aucune page. */
export function lirePlages(texte: string, total: number): LecturePlages {
  // Les tirets s'entourent volontiers d'espaces (« 1 - 3 ») : on les recolle avant de couper.
  const morceaux = texte.replace(/\s*([-–])\s*/g, '$1').split(SEPARATEURS).filter(m => m !== '');
  if (morceaux.length === 0) return { erreur: 'Indiquez au moins une page, par exemple « 1-3, 5 ».' };
  if (total < 1) return { erreur: 'Le document n’a aucune page.' };
  const positions: number[] = [];
  for (const morceau of morceaux) {
    const m = MORCEAU.exec(morceau);
    if (m === null) return { erreur: '« ' + morceau + ' » n’est pas une page ni une plage (écrivez 3, 2-5, 8- ou -4).' };
    const [debut, fin] = m[3] !== undefined ? [Number(m[3]), Number(m[3])] : [m[1] === undefined ? 1 : Number(m[1]), m[2] === undefined ? total : Number(m[2])];
    for (const n of [debut, fin]) {
      if (n < 1 || n > total) return { erreur: 'La page ' + n + ' n’existe pas : le document en a ' + total + '.' };
    }
    const pas = fin >= debut ? 1 : -1;
    for (let n = debut; n !== fin + pas; n += pas) positions.push(n - 1);
  }
  return { positions };
}

/**
 * Des positions (base 0) ecrites en plages (base 1) : `[0, 1, 2, 4]` donne « 1-3, 5 ». Une suite qui monte d'un
 * en un se resserre ; le reste s'ecrit tel quel, dans l'ordre. C'est l'inverse de `lirePlages` sur ce qu'il rend.
 */
export function ecrirePlages(positions: readonly number[]): string {
  const morceaux: string[] = [];
  let i = 0;
  while (i < positions.length) {
    const debut = positions[i] ?? 0;
    let j = i;
    while (j + 1 < positions.length && positions[j + 1] === (positions[j] ?? 0) + 1) j++;
    const fin = positions[j] ?? debut;
    morceaux.push(fin > debut ? debut + 1 + '-' + (fin + 1) : String(debut + 1));
    i = j + 1;
  }
  return morceaux.join(', ');
}

/**
 * Des groupes de plages separes par « / » ou un retour a la ligne : « 1-3 / 4-9 / 10- » donne trois groupes. C'est
 * l'ecriture d'une scission en parties choisies ; chaque groupe se lit comme `lirePlages`, et le premier refus
 * nomme le groupe fautif.
 */
export function lireGroupes(texte: string, total: number): { readonly groupes: readonly (readonly number[])[] } | { readonly erreur: string } {
  const brut = texte.split(/[/\n]+/).map(g => g.trim()).filter(g => g !== '');
  if (brut.length === 0) return { erreur: 'Indiquez au moins une partie, par exemple « 1-3 / 4- ».' };
  const groupes: (readonly number[])[] = [];
  for (const [n, g] of brut.entries()) {
    const lu = lirePlages(g, total);
    if ('erreur' in lu) return { erreur: 'Partie ' + (n + 1) + ' : ' + lu.erreur };
    groupes.push(lu.positions);
  }
  return { groupes };
}
