// Les apercus des pages (ADR-0002) : pdf.js, epingle exactement, charge a la demande depuis `pdfjs/` a cote de la
// page (scripts/construire.mjs l'y copie), jamais empaquete dans le moteur. Il ne sert qu'a voir : rien de ce qu'il
// dessine n'entre dans un fichier ecrit, qui passe par pdf-lib (export/assemblage.ts).
//
// Un dessin se garde par page, rotation et largeur de rendu (engine/zoom.ts, largeurDeRendu : des paliers), pour
// qu'un zoom de la grille ne redessine qu'en franchissant un palier. Au plus deux rendus a la fois : la grille d'un
// gros document en demande cent d'un coup, et le fil de pdf.js les traiterait de toute facon un par un.

import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Fragment } from '../engine/texte.js';
import type { Quart } from '../model/montage.js';

type PdfJs = typeof import('pdfjs-dist');

/** Le dossier de pdf.js, relatif a la page. */
export const DOSSIER_PDFJS = 'pdfjs/';

let module: Promise<PdfJs> | null = null;

/** Charge pdf.js une fois. Un echec se retente au prochain appel (un reseau revenu, un fichier recopie). */
function pdfjs(): Promise<PdfJs> {
  if (module === null) {
    const base = new URL(DOSSIER_PDFJS, document.baseURI).href;
    // Une adresse calculee : esbuild laisse l'import tel quel, et le navigateur le resout a l'execution.
    const chargement = (import(/* @vite-ignore */ base + 'pdf.min.mjs') as Promise<PdfJs>).then(m => {
      m.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
      return m;
    });
    chargement.catch(() => { module = null; });
    module = chargement;
  }
  return module;
}

const documents = new Map<string, Promise<PDFDocumentProxy>>();

/** Fait connaitre a pdf.js les octets d'une source. Une copie part au fil de travail : l'original reste a nous. */
export function declarerSource(id: string, octets: Uint8Array): void {
  if (documents.has(id)) return;
  const ouverture = pdfjs().then(m => m.getDocument({ data: octets.slice(), isEvalSupported: false }).promise);
  ouverture.catch(() => documents.delete(id));
  documents.set(id, ouverture);
}

/** Oublie une source qui n'est plus montee, et ses dessins. */
export function oublierSource(id: string): void {
  const doc = documents.get(id);
  documents.delete(id);
  void doc?.then(d => d.destroy()).catch(() => undefined);
  for (const cle of [...dessins.keys()]) if (cle.startsWith(id + ':')) dessins.delete(cle);
}

/** Les dessins faits, du plus ancien au plus recent ; au-dela de la borne, les plus anciens partent. */
const dessins = new Map<string, Promise<HTMLCanvasElement>>();
const DESSINS_MAX = 400;

let enCours = 0;
const enAttente: (() => void)[] = [];
const PARALLELES = 2;

async function aTonTour<T>(travail: () => Promise<T>): Promise<T> {
  if (enCours >= PARALLELES) await new Promise<void>(r => enAttente.push(r));
  enCours++;
  try { return await travail(); } finally { enCours--; enAttente.shift()?.(); }
}

/** Dessine une page dans une toile neuve, sans rien garder. Le fond est blanc, comme le papier : sans lui, une page
 * transparente deviendrait noire en JPEG. */
async function rendre(id: string, index: number, rotation: Quart, largeur: number): Promise<HTMLCanvasElement> {
  const doc = documents.get(id);
  if (doc === undefined) throw new Error('Source inconnue : ' + id);
  const page = await (await doc).getPage(index + 1);
  const angle = (page.rotate + rotation) % 360;
  const unite = page.getViewport({ scale: 1, rotation: angle });
  const vue = page.getViewport({ scale: largeur / unite.width, rotation: angle });
  const toile = document.createElement('canvas');
  toile.width = Math.max(1, Math.round(vue.width));
  toile.height = Math.max(1, Math.round(vue.height));
  await page.render({ canvas: toile, viewport: vue, background: 'white' }).promise;
  return toile;
}

/**
 * Le dessin de la page `index` (base 0) de la source `id`, tournee de `rotation` en plus de la sienne, large de
 * `largeur` pixels. La promesse est partagee : deux vignettes de la meme page ne la dessinent qu'une fois.
 */
export function dessinerPage(id: string, index: number, rotation: Quart, largeur: number): Promise<HTMLCanvasElement> {
  const cle = id + ':' + index + ':' + rotation + ':' + largeur;
  const deja = dessins.get(cle);
  if (deja !== undefined) {
    dessins.delete(cle);
    dessins.set(cle, deja);
    return deja;
  }
  const dessin = aTonTour(() => rendre(id, index, rotation, largeur));
  dessin.catch(() => dessins.delete(cle));
  dessins.set(cle, dessin);
  if (dessins.size > DESSINS_MAX) {
    const premiere = dessins.keys().next();
    if (premiere.done !== true) dessins.delete(premiere.value);
  }
  return dessin;
}

/**
 * L'image d'une page pour une conversion (io/conversion.ts) : dessinee a la largeur demandee, encodee, puis la toile
 * rendue a la memoire. Rien n'est garde : une conversion de cent pages a 150 dpi ne doit pas remplir le cache des
 * vignettes.
 */
export async function imageDePage(id: string, index: number, rotation: Quart, largeur: number, format: 'jpeg' | 'png'): Promise<Uint8Array> {
  const toile = await aTonTour(() => rendre(id, index, rotation, largeur));
  const blob = await new Promise<Blob | null>(ok => toile.toBlob(ok, 'image/' + format, 0.88));
  toile.width = 0;
  toile.height = 0;
  if (blob === null) throw new Error('Le navigateur n’a pas pu encoder l’image de la page ' + (index + 1) + '.');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Les fragments de texte d'une page, en points dans l'espace de la page (origine en bas a gauche). */
export async function texteDePage(id: string, index: number): Promise<Fragment[]> {
  const doc = documents.get(id);
  if (doc === undefined) throw new Error('Source inconnue : ' + id);
  const page = await (await doc).getPage(index + 1);
  const contenu = await page.getTextContent();
  return contenu.items.flatMap(item => {
    if (!('str' in item)) return [];
    const t = item.transform as number[];
    // La taille vient de la matrice (sa composante verticale), plus sure que `height` qui vaut 0 pour certains fragments.
    const taille = Math.hypot(t[2] ?? 0, t[3] ?? 0) || item.height;
    return [{ texte: item.str, x: t[4] ?? 0, y: t[5] ?? 0, largeur: item.width, taille, fin: item.hasEOL }];
  });
}
