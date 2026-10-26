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
import { policeDeSurimpression, poserLignes } from '../export/surimpression.js';
import { ecrireZip } from '../export/zip.js';
import { pageSource, tailleVue, type Montage, type PageMontee } from '../model/montage.js';
import { imageDePage, pageModifiable, pageScannee, texteDePage, toileDePage } from './apercu.js';
import { enParallele } from '../util/parallele.js';
import { DPI_OCR, reconnaisseur, reconnaitreRedresse, relacher, tailleDuPool, type LangueOcr, type Reconnaisseur } from './ocr.js';

export type FormatConversion = 'pptx' | 'docx-fidele' | 'docx-texte' | 'pdf-cherchable' | 'images';

/** La resolution des images de page : de quoi lire et imprimer une page A4 sans peser plus de quelques centaines de Ko. */
export const DPI_CONVERSION = 150;
/** Le plus grand cote d'une image de page, en pixels : une affiche de deux metres ne doit pas faire une image de 12 000. */
const COTE_MAX = 4000;

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Un fichier converti : ses octets, son extension et son type, et combien de pages scannees ont ete lues dans un autre sens. */
export interface Converti { readonly octets: Uint8Array; readonly extension: string; readonly type: string; readonly redressees: number }

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

/**
 * Ou en est la conversion : `chargement` quand Tesseract et ses modeles se chargent, `ocr` quand la reconnaissance
 * commence sur la page `fait`, `page` quand `fait` pages sur `total` sont finies.
 */
export type Progression = (etape: 'chargement' | 'ocr' | 'page', fait: number, total: number) => void;

/** Combien de pages traiter a la fois : autant que de travailleurs OCR quand on reconnait, une sinon. */
function pagesALaFois(ocr: boolean): number {
  if (!ocr) return 1;
  const n = navigator as Navigator & { deviceMemory?: number };
  return tailleDuPool(n.hardwareConcurrency, n.deviceMemory);
}

/**
 * Convertit les pages du montage. Avec des `langues`, une page scannee (sans texte visible) passe par la reconnaissance
 * de caracteres (ADR-0007), dans son sens de lecture ; sans (null), elle reste une image. Tesseract ne demarre qu'a la
 * premiere page scannee, reconnait plusieurs pages a la fois, et reste pret quelques minutes apres la conversion.
 * `octets` : les sources, pour le PDF cherchable qui les recopie.
 */
export async function convertir(m: Montage, octets: OctetsDesSources, format: FormatConversion, langues: readonly LangueOcr[] | null,
  progression: Progression, signal?: AbortSignal): Promise<Converti> {
  const total = m.pages.length;
  const ocr = langues !== null && langues.length > 0;
  // Dans un objet : TypeScript ne suit pas une variable affectee dans une fonction jusqu'au `finally`.
  const tesseract: { pris: Promise<Reconnaisseur> | null } = { pris: null };
  const ouvrir = () => (tesseract.pris ??= reconnaisseur(langues ?? [], () => progression('chargement', 0, total)));
  // La page s'annonce une fois Tesseract pret : son chargement (la premiere fois) se dit a part.
  const lire = async (toile: HTMLCanvasElement, i: number) => {
    const r = await ouvrir();
    progression('ocr', i + 1, total);
    return reconnaitreRedresse(r, toile);
  };
  const verifier = () => signal?.throwIfAborted();
  let faites = 0, redressees = 0;
  const finie = () => progression('page', ++faites, total);
  const chaquePage = <R>(f: (p: PageMontee, i: number) => Promise<R>) =>
    enParallele(m.pages, pagesALaFois(ocr), async (p, i) => { verifier(); const r = await f(p, i); finie(); return r; });
  try {
    if (format === 'docx-texte') {
      const pages = await chaquePage(async (p, i) => {
        const t = taille(m, p);
        // Le texte se lit dans l'espace de la page source, avant toute rotation : l'ordre de lecture ne tourne pas.
        let texte = paragraphes(await texteDePage(p.source, p.index));
        if (texte.length === 0 && ocr) {
          // Un scan se reconnait tel qu'on le voit, rotation comprise, ou dans son sens de lecture s'il est de cote.
          const lue = await lire(await toileDePage(p.source, p.index, p.rotation, largeurOcr(t.largeur, t.hauteur)), i);
          lue.toile.width = 0;
          if (lue.quart !== 0) redressees++;
          texte = paragraphesOcr(lue.paragraphes);
        }
        return { ...t, paragraphes: texte };
      });
      return { octets: ecrireDocxTexte(pages), extension: 'docx', type: MIME_DOCX, redressees };
    }
    if (format === 'pdf-cherchable') {
      // Les pages gardent leurs octets (pdf-lib les recopie) ; seule une page sans aucun texte, un scan, recoit une
      // couche de texte invisible a la place de ce que l'OCR y lit. Une page deja cherchable ne change pas. Une page
      // lue de cote garde son sens : sa couche suit les lignes, dans le sens ou elles se lisent.
      const couches = await chaquePage(async (p, i) => {
        if (!ocr || (await texteDePage(p.source, p.index)).some(f => f.texte.trim() !== '')) return null;
        const t = taille(m, p);
        const lue = await lire(await toileDePage(p.source, p.index, p.rotation, largeurOcr(t.largeur, t.hauteur)), i);
        const largeurLue = lue.quart === 90 || lue.quart === 270 ? t.hauteur : t.largeur;
        const lignes = lignesDeCouche(lue.paragraphes, largeurLue / lue.toile.width);
        lue.toile.width = 0;
        if (lue.quart !== 0) redressees++;
        return { lignes, quart: lue.quart };
      });
      verifier();
      let police: PDFFont | undefined;
      const ecrit = await assembler(m, octets, async (page, k, sortie) => {
        const couche = couches[k];
        if (couche == null || couche.lignes.length === 0) return;
        police ??= await policeDeSurimpression(sortie);
        poserLignes(sortie, page, police, couche.lignes, true, couche.quart);
      });
      return { octets: ecrit, extension: 'pdf', type: 'application/pdf', redressees };
    }
    if (format === 'images') {
      const chiffres = String(total).length;
      const images = await chaquePage(async (p, i) => {
        const t = taille(m, p);
        return { nom: 'page-' + String(i + 1).padStart(chiffres, '0') + '.png', donnees: await imageDePage(p.source, p.index, p.rotation, largeurDImage(t.largeur, t.hauteur), 'png') };
      });
      const seule = images[0];
      return images.length === 1 && seule !== undefined
        ? { octets: seule.donnees, extension: 'png', type: 'image/png', redressees }
        : { octets: ecrireZip(images), extension: 'zip', type: 'application/zip', redressees };
    }
    const images: PageImage[] = await chaquePage(async (p, i) => {
      const t = taille(m, p);
      const largeurFond = largeurDImage(t.largeur, t.hauteur);
      // Le fond sans le texte, et le texte pose dessus en zones modifiables (ADR-0006).
      const page = await pageModifiable(p.source, p.index, p.rotation, largeurFond, 'jpeg');
      if (!page.scannee || !ocr) return { ...t, format: 'jpeg' as const, ...page };
      const reconnue = await pageScannee(p.source, p.index, p.rotation, t, largeurOcr(t.largeur, t.hauteur), largeurFond, 'jpeg', toile => lire(toile, i));
      // Rien de sur dans le scan (une photo, une page blanche) : la page reste telle quelle.
      if (reconnue.lignes.length === 0) return { ...t, format: 'jpeg' as const, ...page };
      // Une page lue de cote devient une page droite : on la lit, on la modifie, dans son sens.
      if (reconnue.quart !== 0) redressees++;
      const couchee = reconnue.quart === 90 || reconnue.quart === 270;
      return { largeur: couchee ? t.hauteur : t.largeur, hauteur: couchee ? t.largeur : t.hauteur, format: 'jpeg' as const, image: reconnue.image, lignes: reconnue.lignes };
    });
    return format === 'pptx'
      ? { octets: ecrirePptx(images), extension: 'pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', redressees }
      : { octets: ecrireDocxFidele(images), extension: 'docx', type: MIME_DOCX, redressees };
  } finally {
    if (tesseract.pris !== null) await tesseract.pris.then(relacher, () => undefined);
  }
}
