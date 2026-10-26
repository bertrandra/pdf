// Les operations sur un montage (ADR-0001) : chacune est pure, rend un nouveau montage et ne touche jamais aux
// sources. Fusionner, c'est ajouter une source et ses pages au bout ; decouper, c'est ne garder qu'une selection ;
// scinder, c'est rendre plusieurs montages qui se partagent les memes sources. Une operation qui ne change rien
// rend le montage recu, a l'identique (l'historique n'empile alors rien).

import { au } from '../util/tableaux.js';
import type { Montage, Numerotation, PageMontee, PageSource, Quart, Source } from '../model/montage.js';

/** Ajoute un PDF ouvert et toutes ses pages, a la fin ou avant la position `avant`. C'est la fusion. */
export function ajouterSource(m: Montage, nom: string, pages: readonly PageSource[], avant = m.pages.length, vierge = false): Montage {
  let n = m.suivant;
  const source: Source = vierge ? { id: 's' + n++, nom, pages, vierge } : { id: 's' + n++, nom, pages };
  const nouvelles: PageMontee[] = pages.map((_, index) => ({ id: 'p' + n++, source: source.id, index, rotation: 0 }));
  const position = Math.max(0, Math.min(m.pages.length, avant));
  return {
    ...m,
    sources: [...m.sources, source],
    pages: [...m.pages.slice(0, position), ...nouvelles, ...m.pages.slice(position)],
    suivant: n
  };
}

/** Retire les sources dont plus aucune page n'est montee : leurs octets peuvent partir avec elles. */
function elaguer(m: Montage, pages: readonly PageMontee[]): Montage {
  const utiles = new Set(pages.map(p => p.source));
  return { ...m, sources: m.sources.filter(s => utiles.has(s.id)), pages };
}

/** Retire les pages designees. */
export function retirerPages(m: Montage, ids: ReadonlySet<string>): Montage {
  if (!m.pages.some(p => ids.has(p.id))) return m;
  return elaguer(m, m.pages.filter(p => !ids.has(p.id)));
}

/** Ne garde que les pages designees, dans l'ordre du montage. C'est le decoupage. */
export function garderPages(m: Montage, ids: ReadonlySet<string>): Montage {
  if (m.pages.every(p => ids.has(p.id))) return m;
  return elaguer(m, m.pages.filter(p => ids.has(p.id)));
}

/**
 * Deplace les pages designees, ensemble et dans leur ordre, pour qu'elles se posent devant la page qui etait a
 * la position `avant` (ou au bout si `avant` vaut la longueur). C'est le glisser de la grille et Alt+fleche.
 */
export function deplacerPages(m: Montage, ids: ReadonlySet<string>, avant: number): Montage {
  const bougees = m.pages.filter(p => ids.has(p.id));
  if (bougees.length === 0) return m;
  const position = m.pages.slice(0, Math.max(0, Math.min(m.pages.length, avant))).filter(p => !ids.has(p.id)).length;
  const restes = m.pages.filter(p => !ids.has(p.id));
  const pages = [...restes.slice(0, position), ...bougees, ...restes.slice(position)];
  return pages.every((p, i) => p === m.pages[i]) ? m : { ...m, pages };
}

/** Tourne les pages designees d'un quart de tour : `1` dans le sens des aiguilles d'une montre, `-1` dans l'autre. */
export function pivoterPages(m: Montage, ids: ReadonlySet<string>, sens: 1 | -1): Montage {
  if (!m.pages.some(p => ids.has(p.id))) return m;
  return { ...m, pages: m.pages.map(p => (ids.has(p.id) ? { ...p, rotation: ((p.rotation + 360 + sens * 90) % 360) as Quart } : p)) };
}

/** Inverse l'ordre des pages designees, sur place : la premiere prend la place de la derniere. */
export function inverserPages(m: Montage, ids: ReadonlySet<string>): Montage {
  const places = m.pages.flatMap((p, i) => (ids.has(p.id) ? [i] : []));
  if (places.length < 2) return m;
  const pages = [...m.pages];
  const inverses = places.map(i => au(m.pages, i)).reverse();
  places.forEach((place, k) => { pages[place] = au(inverses, k); });
  return { ...m, pages };
}

/** Les ids des pages aux positions donnees (base 0) ; une position hors du montage est ignoree. */
export function idsAuxPositions(m: Montage, positions: readonly number[]): Set<string> {
  return new Set(positions.flatMap(i => { const p = m.pages[i]; return p === undefined ? [] : [p.id]; }));
}

/** Une regle de scission : toutes les `n` pages, avant certaines positions, ou en groupes ecrits a la main. */
export type RegleScission =
  | { readonly type: 'chaque'; readonly n: number }
  | { readonly type: 'avant'; readonly positions: readonly number[] }
  | { readonly type: 'groupes'; readonly groupes: readonly (readonly number[])[] };

/**
 * Les parties d'une scission : des listes de positions (base 0) du montage. `chaque` et `avant` couvrent toutes
 * les pages, sans recouvrement ni partie vide ; `groupes` rend ce qu'on a ecrit, doublons compris.
 */
export function partiesDeScission(total: number, regle: RegleScission): number[][] {
  if (total < 1) return [];
  if (regle.type === 'groupes') return regle.groupes.filter(g => g.length > 0).map(g => [...g]);
  const coupures = regle.type === 'chaque'
    ? Array.from({ length: Math.ceil(total / Math.max(1, Math.floor(regle.n))) }, (_, k) => k * Math.max(1, Math.floor(regle.n)))
    : [0, ...regle.positions];
  const bornes = [...new Set(coupures.filter(c => c >= 0 && c < total))].sort((a, b) => a - b);
  return bornes.map((debut, k) => Array.from({ length: (bornes[k + 1] ?? total) - debut }, (_, i) => debut + i));
}

/** Scinde le montage : un montage par partie, chacun avec ses seules sources. Les ids des pages sont gardes. */
export function scinder(m: Montage, regle: RegleScission): Montage[] {
  return partiesDeScission(m.pages.length, regle).map(positions =>
    elaguer(m, positions.flatMap(i => { const p = m.pages[i]; return p === undefined ? [] : [p]; })));
}

/**
 * Les noms des fichiers d'une scission : « rapport-1.pdf », « rapport-2.pdf »… numerotes sur autant de chiffres
 * qu'il en faut pour que l'ordre alphabetique soit celui des parties (« -01 » a « -12 »).
 */
export function nomsDesParties(nom: string, nombre: number): string[] {
  const racine = nom.replace(/\.pdf$/i, '') || 'document';
  const chiffres = String(nombre).length;
  return Array.from({ length: nombre }, (_, k) => racine + '-' + String(k + 1).padStart(chiffres, '0') + '.pdf');
}

/**
 * Duplique les pages designees : chaque copie se pose juste apres le groupe de pages choisies qui se suivent, dans
 * le meme ordre (choisir 2 et 3 donne 2, 3, 2', 3'). Les copies ont leurs propres identifiants.
 */
export function dupliquerPages(m: Montage, ids: ReadonlySet<string>): Montage {
  if (!m.pages.some(p => ids.has(p.id))) return m;
  let n = m.suivant;
  const pages: PageMontee[] = [];
  let groupe: PageMontee[] = [];
  const vider = () => { pages.push(...groupe.map(p => ({ ...p, id: 'p' + n++ }))); groupe = []; };
  for (const p of m.pages) {
    if (ids.has(p.id)) { pages.push(p); groupe.push(p); }
    else { vider(); pages.push(p); }
  }
  vider();
  return { ...m, pages, suivant: n };
}

/** Pose (ou retire, avec null) la numerotation des pages. */
export function numeroter(m: Montage, numerotation: Numerotation | null): Montage {
  if (numerotation === null) {
    if (m.numerotation === undefined) return m;
    return { sources: m.sources, pages: m.pages, suivant: m.suivant };
  }
  const n = m.numerotation;
  if (n !== undefined && n.position === numerotation.position && n.format === numerotation.format && n.debut === numerotation.debut && n.sauterPremiere === numerotation.sauterPremiere) return m;
  return { ...m, numerotation };
}
