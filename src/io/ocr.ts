// La reconnaissance de caracteres (ADR-0007) : Tesseract 5 en WebAssembly (tesseract.js, epingle exactement), avec
// les modeles « best » de tessdata_best (LSTM en virgule flottante, les plus justes), francais et anglais. Tout est
// servi a cote de la page, dans `ocr/` (scripts/construire.mjs, scripts/modeles-ocr.mjs) : rien ne part sur le
// reseau, aucun CDN n'est contacte, rien n'est garde dans le navigateur.
//
// Les modeles en virgule flottante demandent le coeur sans SIMD (le coeur SIMD n'a que le produit scalaire entier) :
// on lui donne son fichier exact, pour que tesseract.js ne choisisse pas a notre place. C'est plus lent (deux secondes
// environ par page), mais c'est ce qui se trompe le moins (docs/adr/0007).

import type { BoiteOcr, ParagrapheOcr } from '../engine/ocr.js';

/** Le dossier de l'OCR, relatif a la page. */
export const DOSSIER_OCR = 'ocr/';
/** Les langues reconnues, dans l'ordre ou Tesseract les essaie. */
export const LANGUES_OCR = ['fra', 'eng'] as const;
/** La resolution de l'image reconnue : 300 dpi, celle pour laquelle les modeles sont entraines. */
export const DPI_OCR = 300;

interface BoiteBrute { x0: number; y0: number; x1: number; y1: number }
interface ResultatBrut {
  data: { blocks: { paragraphs: { lines: { words: { text: string; confidence: number; bbox: BoiteBrute }[]; bbox: BoiteBrute; baseline: BoiteBrute; rowAttributes: { rowHeight: number } }[] }[] }[] | null };
}
interface Travailleur {
  recognize(image: HTMLCanvasElement, options: object, sortie: { blocks: boolean; text: boolean }): Promise<ResultatBrut>;
  setParameters(p: Record<string, string>): Promise<unknown>;
  terminate(): Promise<unknown>;
}
interface TesseractGlobal { createWorker(langues: readonly string[], oem: number, options: object): Promise<Travailleur> }

let chargement: Promise<TesseractGlobal> | null = null;

/** Charge tesseract.js une fois, par une balise script : il se declare en global (`Tesseract`). */
function tesseract(base: string): Promise<TesseractGlobal> {
  if (chargement === null) {
    chargement = new Promise<TesseractGlobal>((ok, ko) => {
      const deja = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
      if (deja) { ok(deja); return; }
      const script = document.createElement('script');
      script.src = base + 'tesseract.min.js';
      script.onload = () => {
        const t = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
        if (t) ok(t); else ko(new Error('La reconnaissance de texte n’a pas pu démarrer.'));
      };
      script.onerror = () => ko(new Error('La reconnaissance de texte est absente de cette page (dossier « ocr/ »).'));
      document.head.append(script);
    });
    chargement.catch(() => { chargement = null; });
  }
  return chargement;
}

const boite = (b: BoiteBrute): BoiteOcr => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 });

/** Un reconnaisseur pret : un travailleur Tesseract, a fermer quand la conversion est finie. */
export interface Reconnaisseur {
  reconnaitre(toile: HTMLCanvasElement): Promise<ParagrapheOcr[]>;
  fermer(): Promise<void>;
}

/** Demarre Tesseract (le premier appel charge environ 25 Mo : le coeur et les deux modeles). */
export async function ouvrirReconnaisseur(): Promise<Reconnaisseur> {
  const base = new URL(DOSSIER_OCR, document.baseURI).href;
  const t = await tesseract(base);
  // OEM 1 : le reseau LSTM seul (les modeles « best » n'ont pas l'ancien moteur).
  const travailleur = await t.createWorker([...LANGUES_OCR], 1, {
    workerPath: base + 'worker.min.js',
    corePath: base + 'tesseract-core-lstm.wasm.js',
    langPath: base + 'langues',
    gzip: false,
    cacheMethod: 'none',
    workerBlobURL: false
  });
  // Les espaces entre les mots comptent dans une facture ou un tableau : on les garde tels que la page les montre.
  await travailleur.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: String(DPI_OCR) });
  return {
    async reconnaitre(toile) {
      const { data } = await travailleur.recognize(toile, {}, { blocks: true, text: false });
      return (data.blocks ?? []).flatMap(b => b.paragraphs.map(p => ({
        lignes: p.lines.map(l => ({
          mots: l.words.map(w => ({ texte: w.text, confiance: w.confidence, boite: boite(w.bbox) })),
          boite: boite(l.bbox), ligneDeBase: boite(l.baseline), hauteur: l.rowAttributes.rowHeight
        }))
      })));
    },
    async fermer() { await travailleur.terminate(); }
  };
}
