// Le texte d'une page en paragraphes, pour la conversion en Word modifiable (ADR-0005). pdf.js rend des fragments
// poses a des coordonnees (io/apercu.ts, texteDePage) ; on les recolle ici en lignes, puis en paragraphes, sans
// chercher a refaire la mise en page : colonnes, tableaux et positions sont perdus, et la boite de conversion le dit.
//
// Regles, dans l'ordre du flux de la page (l'ordre de lecture d'un PDF ordinaire) :
// - une ligne finit sur une fin de ligne declaree, ou quand la hauteur change de plus d'une demi-taille ;
// - deux fragments d'une ligne se separent d'une espace si un blanc visible les ecarte ;
// - deux lignes restent dans le meme paragraphe si l'interligne est ordinaire (moins de 1,6 fois la taille) ;
//   une ligne sautee l'agrandit, et c'est elle qui coupe le paragraphe ;
// - un mot coupe en fin de ligne (« trans- » puis « port ») se recolle.

/** Un morceau de texte pose sur la page, en points, origine en bas a gauche (l'espace du PDF). */
export interface Fragment {
  readonly texte: string;
  readonly x: number;
  readonly y: number;
  readonly largeur: number;
  /** La taille du texte : la hauteur de sa ligne de base a la suivante, a peu pres. */
  readonly taille: number;
  /** Vrai si pdf.js a vu une fin de ligne apres ce fragment. */
  readonly fin: boolean;
}

interface Ligne { texte: string; y: number; taille: number }

/** Le caractere d'espacement : les blancs, y compris l'espace insecable et les espaces fines. */
const BLANC = /[\s\u00a0\u2000-\u200b\u202f]/;

function lignes(fragments: readonly Fragment[]): Ligne[] {
  const sortie: Ligne[] = [];
  let courante: (Ligne & { finX: number }) | null = null;
  for (const f of fragments) {
    // pdf.js marque une fin de ligne par un fragment vide : il ferme la ligne en cours, sans en ouvrir une vide.
    if (f.texte === '') {
      if (f.fin && courante !== null) { sortie.push(courante); courante = null; }
      continue;
    }
    const taille = f.taille > 0 ? f.taille : 10;
    if (courante !== null && Math.abs(f.y - courante.y) > taille / 2) {
      sortie.push(courante);
      courante = null;
    }
    if (courante === null) {
      courante = { texte: f.texte, y: f.y, taille, finX: f.x + f.largeur };
    } else {
      const ecart = f.x - courante.finX;
      const colle = courante.texte === '' || BLANC.test(courante.texte.slice(-1)) || BLANC.test(f.texte.slice(0, 1));
      courante.texte += (!colle && ecart > taille * 0.15 ? ' ' : '') + f.texte;
      courante.finX = f.x + f.largeur;
      courante.taille = Math.max(courante.taille, taille);
    }
    if (f.fin) {
      sortie.push(courante);
      courante = null;
    }
  }
  if (courante !== null) sortie.push(courante);
  return sortie.map(l => ({ texte: l.texte.replace(/\s+/g, ' ').trim(), y: l.y, taille: l.taille }));
}

/** Les paragraphes d'une page, dans l'ordre de lecture ; une page sans texte n'en a aucun. */
export function paragraphes(fragments: readonly Fragment[]): string[] {
  const sortie: string[] = [];
  let courant = '';
  let precedente: Ligne | null = null;
  for (const l of lignes(fragments)) {
    if (l.texte === '') continue;
    const interligne = precedente === null ? 0 : precedente.y - l.y;
    const suite = precedente !== null && interligne > 0 && interligne < Math.max(precedente.taille, l.taille) * 1.6;
    if (!suite) {
      if (courant !== '') sortie.push(courant);
      courant = l.texte;
    } else if (/\p{L}-$/u.test(courant) && /^\p{Ll}/u.test(l.texte)) {
      courant = courant.slice(0, -1) + l.texte;
    } else {
      courant += ' ' + l.texte;
    }
    precedente = l;
  }
  if (courant !== '') sortie.push(courant);
  return sortie;
}
