// La selection des pages de la grille, en calcul pur : un clic choisit une page, Ctrl (ou Cmd) l'ajoute ou la
// retire, Maj etend de l'ancre a la page, comme dans un gestionnaire de fichiers. Le composant passe l'ordre des
// pages et le geste ; il ne decide de rien.

export interface Selection {
  readonly ids: ReadonlySet<string>;
  /** La page d'ou part une extension par Maj : la derniere touchee sans Maj. */
  readonly ancre: string | null;
}

export const SELECTION_VIDE: Selection = { ids: new Set(), ancre: null };

export interface Modificateurs { readonly etendre: boolean; readonly basculer: boolean }

/** La selection apres un clic (ou Espace) sur `id`, pour des pages rangees dans `ordre`. */
export function toucher(s: Selection, ordre: readonly string[], id: string, { etendre, basculer }: Modificateurs): Selection {
  if (etendre && s.ancre !== null && ordre.includes(s.ancre)) {
    const [a, b] = [ordre.indexOf(s.ancre), ordre.indexOf(id)].sort((x, y) => x - y);
    const plage = ordre.slice(a, (b ?? 0) + 1);
    return { ids: new Set(basculer ? [...s.ids, ...plage] : plage), ancre: s.ancre };
  }
  if (basculer) {
    const ids = new Set(s.ids);
    if (ids.has(id)) ids.delete(id); else ids.add(id);
    return { ids, ancre: id };
  }
  return { ids: new Set([id]), ancre: id };
}

/** Toutes les pages, ou aucune si toutes l'etaient deja (Ctrl+A deux fois). */
export function toutOuRien(s: Selection, ordre: readonly string[]): Selection {
  return ordre.length > 0 && ordre.every(id => s.ids.has(id)) ? SELECTION_VIDE : { ids: new Set(ordre), ancre: ordre[0] ?? null };
}

/** La selection sans les pages qui ne sont plus montees. */
export function restreindre(s: Selection, ordre: readonly string[]): Selection {
  const presentes = new Set(ordre);
  if ([...s.ids].every(id => presentes.has(id)) && (s.ancre === null || presentes.has(s.ancre))) return s;
  return { ids: new Set([...s.ids].filter(id => presentes.has(id))), ancre: s.ancre !== null && presentes.has(s.ancre) ? s.ancre : null };
}

/**
 * La position d'arrivee d'une fleche dans une grille de `colonnes` colonnes : gauche et droite d'une case, haut et
 * bas d'une ligne, Debut et Fin aux bouts. Bornee : la fleche ne sort jamais de la grille.
 */
export function deplacementClavier(position: number, total: number, colonnes: number, touche: string): number | null {
  const c = Math.max(1, colonnes);
  const cible = touche === 'ArrowLeft' ? position - 1 : touche === 'ArrowRight' ? position + 1
    : touche === 'ArrowUp' ? position - c : touche === 'ArrowDown' ? position + c
      : touche === 'Home' ? 0 : touche === 'End' ? total - 1 : null;
  if (cible === null || total < 1) return null;
  return Math.max(0, Math.min(total - 1, cible));
}
