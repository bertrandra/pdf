// Ce qu'on ajoute par-dessus une page posee : des numeros, ou la couche de texte invisible d'un scan reconnu (un PDF
// ou l'on peut chercher et copier). Le texte se place dans le repere vu (geometry/repere.ts) et s'ecrit dans un flux
// a part, apres celui de la page, entoure de q/Q pour qu'un etat graphique laisse ouvert par la page ne le deplace pas.
//
// Reproductible : pdf-lib nomme les polices d'une page avec un suffixe tire au hasard (`uniqueKey`) ; on les nomme
// nous-memes (/PdfF1, /PdfF2…), et la police est l'Helvetica standard, jamais embarquee, toujours la meme.

import {
  beginText, endText, PDFName, popGraphicsState, pushGraphicsState, setCharacterSqueeze, setFillingGrayscaleColor,
  setFontAndSize, setTextMatrix, setTextRenderingMode, showText, StandardFonts, TextRenderingMode,
  type PDFDocument, type PDFFont, type PDFOperator, type PDFPage
} from 'pdf-lib';
import { matriceDeLigne, type BoitePage, type QuartDeTour } from '../geometry/repere.js';

/** Une ligne a poser, dans le repere vu : depart de la ligne de base (u, v), taille, pente, largeur visee ou rien. */
export interface LigneAPoser {
  readonly texte: string;
  readonly u: number;
  readonly v: number;
  readonly taille: number;
  readonly angle: number;
  /** La largeur que doit couvrir la ligne, en points : le texte s'etire ou se resserre pour la couvrir. */
  readonly largeur: number | null;
}

/** La police des surimpressions d'un document : Helvetica, codage WinAnsi. */
export const policeDeSurimpression = (doc: PDFDocument): Promise<PDFFont> => doc.embedFont(StandardFonts.Helvetica);

/** Le texte que la police sait ecrire : un caractere hors de WinAnsi (un ideogramme, un emoji) devient « ? ». */
export function texteEcrivable(police: PDFFont, texte: string): string {
  const jeu = new Set(police.getCharacterSet());
  return [...texte.normalize('NFC')].map(c => (jeu.has(c.codePointAt(0) ?? 0) ? c : '?')).join('');
}

/** La boite de recadrage d'une page posee et sa rotation totale. */
export function repereDe(page: PDFPage): { boite: BoitePage; rotation: QuartDeTour } {
  const { x, y, width, height } = page.getCropBox();
  const r = ((Math.round(page.getRotation().angle / 90) * 90) % 360 + 360) % 360;
  return { boite: { x, y, largeur: width, hauteur: height }, rotation: r as QuartDeTour };
}

/** La cle de la police dans les ressources de la page, posee si elle n'y est pas encore. */
function cleDePolice(page: PDFPage, police: PDFFont): PDFName {
  const { Font } = page.node.normalizedEntries();
  for (let k = 1; ; k++) {
    const cle = PDFName.of('PdfF' + k);
    const deja = Font.get(cle);
    if (deja === police.ref) return cle;
    if (deja === undefined) { Font.set(cle, police.ref); return cle; }
  }
}

/** Les pages deja entourees de q/Q : une seconde surimpression (des numeros sur un scan reconnu) ne les rentoure pas. */
const entourees = new WeakSet<PDFPage>();

/** Pose des lignes sur une page, visibles (noires) ou invisibles (la couche de texte d'un scan). */
export function poserLignes(doc: PDFDocument, page: PDFPage, police: PDFFont, lignes: readonly LigneAPoser[], invisible: boolean): void {
  const ecrites = lignes.map(l => ({ ...l, texte: texteEcrivable(police, l.texte) })).filter(l => l.texte.trim() !== '' && l.taille > 0);
  if (ecrites.length === 0) return;
  const { boite, rotation } = repereDe(page);
  const cle = cleDePolice(page, police);
  const ops: PDFOperator[] = [pushGraphicsState(), beginText(), invisible ? setTextRenderingMode(TextRenderingMode.Invisible) : setFillingGrayscaleColor(0)];
  for (const l of ecrites) {
    const naturelle = police.widthOfTextAtSize(l.texte, l.taille);
    const m = matriceDeLigne(boite, rotation, l.u, l.v, l.angle);
    ops.push(setFontAndSize(cle, l.taille), setTextMatrix(...m.map(arrondi) as [number, number, number, number, number, number]),
      setCharacterSqueeze(l.largeur !== null && naturelle > 0 ? arrondi((100 * l.largeur) / naturelle) : 100), showText(police.encodeText(l.texte)));
  }
  ops.push(endText(), popGraphicsState());
  // La page d'abord entouree de q/Q (une fois), puis notre flux apres elle.
  if (!entourees.has(page)) {
    entourees.add(page);
    const ctx = doc.context;
    const avant = ctx.register(ctx.stream('q')), apres = ctx.register(ctx.stream('Q'));
    page.node.normalize();
    page.node.wrapContentStreams(avant, apres);
  }
  page.pushOperators(...ops);
}

/** Quatre decimales : assez pour un centieme de point, et des octets qui ne dependent pas des derniers bits d'un calcul. */
const arrondi = (x: number): number => Math.round(x * 10_000) / 10_000;
