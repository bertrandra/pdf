// La conversion d'un montage en PowerPoint, en Word, en PDF cherchable ou en images (ADR-0005, ADR-0006, ADR-0008) : io
// dessine le fond de chaque page et en pose le texte (pdf.js), ou en lit le texte au fil ; l'ecriture pure
// (export/pptx.ts, export/docx.ts, export/assemblage.ts) en fait le fichier. Les pages se traitent une a une, dans
// l'ordre, et chacune est annoncee : une conversion de deux cents pages prend une minute, il faut voir qu'elle avance,
// et pouvoir l'arreter (`signal`).

import type { PDFFont } from 'pdf-lib';
import { lignesDeCouche, paragraphesOcr } from '../engine/ocr.js';
import { paragraphes } from '../engine/texte.js';
import { assembler, type OctetsDesSources } from '../export/assemblage.js';
import { ecrireDocxFidele, ecrireDocxTexte } from '../export/docx.js';
import type { PageImage } from '../export/ooxml.js';
import { ecrirePptx } from '../export/pptx.js';
import { policeDeSurimpression, poserLignes, type LigneAPoser } from '../export/surimpression.js';
import { ecrireZip } from '../export/zip.js';
import { pageSource, tailleVue, type Montage, type PageMontee } from '../model/montage.js';
import { imageDePage, pageModifiable, pageScannee, texteDePage, toileDePage } from './apercu.js';
import { DPI_OCR, ouvrirReconnaisseur, type Reconnaisseur } from './ocr.js';

export type FormatConversion = 'pptx' | 'docx-fidele' | 'docx-texte' | 'pdf-cherchable' | 'images';

/** La resolution des images de page : de quoi lire et imprimer une page A4 sans peser plus de quelques centaines de Ko. */
export const DPI_CONVERSION = 150;
/** Le plus grand cote d'une image de page, en pixels : une affiche de deux metres ne doit pas faire une image de 12 000. */
const COTE_MAX = 4000;

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Un fichier converti : ses octets, son extension et son type. */
export interface Converti { readonly octets: Uint8Array; readonly extension: string; readonly type: string }

/** La largeur en pixels de l'image d'une page de `largeur` x `hauteur` points vus, a la resolution de conversion. */
export function largeurDImage(largeur: number, hauteur: number): number {
  const k = Math.min(DPI_CONVERSION / 72, COTE_MAX / Math.max(1, largeur, hauteur));
  return Math.max(1, Math.round(largeur * k));
}

function taille(m: Montage, p: PageMontee): { largeur: number; hauteur: number } {
  const source = pageSource(m, p);
  return source ? tailleVue(source, p) : { largeur: 595, hauteur: 842 };
}

/** Le plus grand cote de l'image reconnue : une page A3 a 300 dpi tient (4 961 px), une affiche est ramenee. */
const COTE_MAX_OCR = 7000;

/** La largeur en pixels de l'image reconnue pour une page de `largeur` x `hauteur` points vus. */
export function largeurOcr(largeur: number, hauteur: number): number {
  const k = Math.min(DPI_OCR / 72, COTE_MAX_OCR / Math.max(1, largeur, hauteur));
  return Math.max(1, Math.round(largeur * k));
}

/** Ou en est la conversion : la page traitee, le total, et si c'est la reconnaissance de caracteres qui travaille. */
export type Progression = (fait: number, total: number, ocr: boolean) => void;

/**
 * Convertit les pages du montage. Avec `ocr`, une page scannee (sans texte visible) passe par la reconnaissance de
 * caracteres (ADR-0007) ; sans, elle reste une image. Tesseract ne demarre qu'a la premiere page scannee, et s'arrete
 * a la fin, meme sur une erreur ou un arret. `octets` : les sources, pour le PDF cherchable qui les recopie.
 */
export async function convertir(m: Montage, octets: OctetsDesSources, format: FormatConversion, ocr: boolean, progression: Progression, signal?: AbortSignal): Promise<Converti> {
  const total = m.pages.length;
  // Dans un objet : TypeScript ne suit pas une variable affectee dans une fonction jusqu'au `finally`.
  const tesseract: { ouvert: Promise<Reconnaisseur> | null } = { ouvert: null };
  const reconnaitre = (toile: HTMLCanvasElement) => {
    tesseract.ouvert ??= ouvrirReconnaisseur();
    return tesseract.ouvert.then(r => r.reconnaitre(toile));
  };
  const verifier = () => signal?.throwIfAborted();
  try {
    if (format === 'docx-texte') {
      const pages = [];
      for (const [i, p] of m.pages.entries()) {
        verifier();
        const t = taille(m, p);
        // Le texte se lit dans l'espace de la page source, avant toute rotation : l'ordre de lecture ne tourne pas.
        let texte = paragraphes(await texteDePage(p.source, p.index));
        if (texte.length === 0 && ocr) {
          // Un scan se reconnait tel qu'on le voit, rotation comprise : Tesseract lit des lignes droites.
          progression(i + 1, total, true);
          texte = paragraphesOcr(await reconnaitre(await toileDePage(p.source, p.index, p.rotation, largeurOcr(t.largeur, t.hauteur))));
        }
        pages.push({ ...t, paragraphes: texte });
        progression(i + 1, total, false);
      }
      return { octets: ecrireDocxTexte(pages), extension: 'docx', type: MIME_DOCX };
    }
    if (format === 'pdf-cherchable') {
      // Les pages gardent leurs octets (pdf-lib les recopie) ; seule une page sans aucun texte, un scan, recoit une
      // couche de texte invisible a la place de ce que l'OCR y lit. Une page deja cherchable ne change pas.
      const couches = new Map<number, LigneAPoser[]>();
      for (const [i, p] of m.pages.entries()) {
        verifier();
        if (ocr && !(await texteDePage(p.source, p.index)).some(f => f.texte.trim() !== '')) {
          progression(i + 1, total, true);
          const t = taille(m, p);
          const toile = await toileDePage(p.source, p.index, p.rotation, largeurOcr(t.largeur, t.hauteur));
          const echelle = t.largeur / toile.width;
          const lus = await reconnaitre(toile);
          toile.width = 0;
          couches.set(i, lignesDeCouche(lus, echelle));
        }
        progression(i + 1, total, false);
      }
      verifier();
      let police: PDFFont | undefined;
      const ecrit = await assembler(m, octets, async (page, k, sortie) => {
        const lignes = couches.get(k);
        if (lignes === undefined || lignes.length === 0) return;
        police ??= await policeDeSurimpression(sortie);
        poserLignes(sortie, page, police, lignes, true);
      });
      return { octets: ecrit, extension: 'pdf', type: 'application/pdf' };
    }
    if (format === 'images') {
      const images: { nom: string; donnees: Uint8Array }[] = [];
      const chiffres = String(total).length;
      for (const [i, p] of m.pages.entries()) {
        verifier();
        const t = taille(m, p);
        images.push({ nom: 'page-' + String(i + 1).padStart(chiffres, '0') + '.png', donnees: await imageDePage(p.source, p.index, p.rotation, largeurDImage(t.largeur, t.hauteur), 'png') });
        progression(i + 1, total, false);
      }
      const seule = images[0];
      return images.length === 1 && seule !== undefined
        ? { octets: seule.donnees, extension: 'png', type: 'image/png' }
        : { octets: ecrireZip(images), extension: 'zip', type: 'application/zip' };
    }
    const images: PageImage[] = [];
    for (const [i, p] of m.pages.entries()) {
      verifier();
      const t = taille(m, p);
      const largeurFond = largeurDImage(t.largeur, t.hauteur);
      // Le fond sans le texte, et le texte pose dessus en zones modifiables (ADR-0006).
      const page = await pageModifiable(p.source, p.index, p.rotation, largeurFond, 'jpeg');
      if (page.scannee && ocr) {
        progression(i + 1, total, true);
        const reconnue = await pageScannee(p.source, p.index, p.rotation, t.largeur, largeurOcr(t.largeur, t.hauteur), largeurFond, 'jpeg', reconnaitre);
        // Rien de sur dans le scan (une photo, une page blanche) : la page reste telle quelle.
        images.push({ ...t, format: 'jpeg', ...(reconnue.lignes.length > 0 ? reconnue : page) });
      } else {
        images.push({ ...t, format: 'jpeg', ...page });
      }
      progression(i + 1, total, false);
    }
    return format === 'pptx'
      ? { octets: ecrirePptx(images), extension: 'pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }
      : { octets: ecrireDocxFidele(images), extension: 'docx', type: MIME_DOCX };
  } finally {
    await tesseract.ouvert?.then(r => r.fermer()).catch(() => undefined);
  }
}
