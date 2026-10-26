// Les apercus des pages (ADR-0002) : pdf.js, epingle exactement, charge a la demande depuis `pdfjs/` a cote de la
// page (scripts/construire.mjs l'y copie), jamais empaquete dans le moteur. Il ne sert qu'a voir : rien de ce qu'il
// dessine n'entre dans un fichier ecrit, qui passe par pdf-lib (export/assemblage.ts).
//
// Un dessin se garde par page, rotation et largeur de rendu (engine/zoom.ts, largeurDeRendu : des paliers), pour
// qu'un zoom de la grille ne redessine qu'en franchissant un palier. Au plus deux rendus a la fois : la grille d'un
// gros document en demande cent d'un coup, et le fil de pdf.js les traiterait de toute facon un par un.

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { couleurDuTexte, lignesPosees, lirePolice, type FragmentVu } from '../engine/miseEnPage.js';
import { boitesOcr, effacerLignes, lignesOcrPosees, type ParagrapheOcr } from '../engine/ocr.js';
import type { Fragment } from '../engine/texte.js';
import type { LigneColoree } from '../export/ooxml.js';
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
    // Des modules ES servis en .js (scripts/construire.mjs) : un navigateur exige un type JavaScript pour un module, et
    // un hebergeur ordinaire n'en donne aucun a .mjs (SiteGround), alors que tous le donnent a .js.
    const chargement = (import(/* @vite-ignore */ base + 'pdf.min.js') as Promise<PdfJs>).then(m => {
      m.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
      return m;
    });
    chargement.catch(() => { module = null; });
    module = chargement;
  }
  return module;
}

const documents = new Map<string, Promise<PDFDocumentProxy>>();
/** Les octets de chaque source declaree : de quoi la rouvrir si la premiere ouverture a echoue (pdf.js pas encore la). */
const octetsDesSources = new Map<string, Uint8Array>();

/** Fait connaitre a pdf.js les octets d'une source. Une copie part au fil de travail : l'original reste a nous. */
export function declarerSource(id: string, octets: Uint8Array): void {
  octetsDesSources.set(id, octets);
  void ouvrir(id).catch(() => undefined);
}

/**
 * Le document pdf.js d'une source, ouvert une fois. Une ouverture qui echoue n'est pas gardee : la suivante la retente,
 * et c'est sa vraie raison (pdf.js absent, fichier refuse) qui remonte, pas « source inconnue ».
 */
function ouvrir(id: string): Promise<PDFDocumentProxy> {
  const deja = documents.get(id);
  if (deja !== undefined) return deja;
  const octets = octetsDesSources.get(id);
  if (octets === undefined) return Promise.reject(new Error('Source inconnue : ' + id));
  const ouverture = pdfjs().then(m => m.getDocument({ data: octets.slice(), isEvalSupported: false }).promise);
  ouverture.catch(() => { if (documents.get(id) === ouverture) documents.delete(id); });
  documents.set(id, ouverture);
  return ouverture;
}

/** Oublie une source qui n'est plus montee, et ses dessins. */
export function oublierSource(id: string): void {
  const doc = documents.get(id);
  documents.delete(id);
  octetsDesSources.delete(id);
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
  const page = await (await ouvrir(id)).getPage(index + 1);
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

/** Les fragments de texte d'une page, en points dans l'espace de la page (origine en bas a gauche). */
export async function texteDePage(id: string, index: number): Promise<Fragment[]> {
  const page = await (await ouvrir(id)).getPage(index + 1);
  const contenu = await page.getTextContent();
  return contenu.items.flatMap(item => {
    if (!('str' in item)) return [];
    const t = item.transform as number[];
    // La taille vient de la matrice (sa composante verticale), plus sure que `height` qui vaut 0 pour certains fragments.
    const taille = Math.hypot(t[2] ?? 0, t[3] ?? 0) || item.height;
    return [{ texte: item.str, x: t[4] ?? 0, y: t[5] ?? 0, largeur: item.width, taille, fin: item.hasEOL }];
  });
}

/** Encode une toile en JPEG ou PNG, puis la rend a la memoire. */
async function encoder(toile: HTMLCanvasElement, format: 'jpeg' | 'png'): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>(ok => toile.toBlob(ok, 'image/' + format, 0.88));
  toile.width = 0;
  toile.height = 0;
  if (blob === null) throw new Error('Le navigateur n’a pas pu encoder une image de page.');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Les operations qui dessinent du texte : on les saute pour dessiner le fond d'une page sans son texte. */
const OPERATIONS_DE_TEXTE = (m: PdfJs): ReadonlySet<number> =>
  new Set([m.OPS.showText, m.OPS.showSpacedText, m.OPS.nextLineShowText, m.OPS.nextLineSetSpacingShowText]);

/**
 * Une page prete a convertir en texte modifiable (ADR-0006) : son fond (la page dessinee sans ses operations de
 * texte) et ses lignes posees, chacune avec sa couleur, lue en comparant la page avec et sans texte. Une page sans
 * texte visible est dite scannee : elle rend son image entiere, et l'OCR peut la reprendre (`pageScannee`).
 */
export async function pageModifiable(id: string, index: number, rotation: Quart, largeur: number, format: 'jpeg' | 'png'): Promise<{ image: Uint8Array; lignes: LigneColoree[]; scannee: boolean }> {
  return aTonTour(async () => {
    const m = await pdfjs();
    const page = await (await ouvrir(id)).getPage(index + 1);
    const angle = (page.rotate + rotation) % 360;
    const unite = page.getViewport({ scale: 1, rotation: angle });
    const echelle = largeur / unite.width;
    const vue = page.getViewport({ scale: echelle, rotation: angle });
    // Le meme mode d'annotations pour la liste et les rendus : les indices des operations doivent correspondre.
    const mode = m.AnnotationMode.ENABLE;
    const operations = await page.getOperatorList({ annotationMode: mode });
    const texte = OPERATIONS_DE_TEXTE(m);
    const aSauter = new Set(operations.fnArray.flatMap((fn, i) => (texte.has(fn) ? [i] : [])));
    const dessiner = async (filtre: ((i: number) => boolean) | undefined) => {
      const toile = document.createElement('canvas');
      toile.width = Math.max(1, Math.round(vue.width));
      toile.height = Math.max(1, Math.round(vue.height));
      await page.render({ canvas: toile, viewport: vue, background: 'white', annotationMode: mode, ...(filtre ? { operationsFilter: filtre } : {}) }).promise;
      return toile;
    };
    const fond = await dessiner(aSauter.size > 0 ? i => !aSauter.has(i) : undefined);
    if (aSauter.size === 0) return { image: await encoder(fond, format), lignes: [], scannee: true };

    const contenu = await page.getTextContent();
    const fragments: FragmentVu[] = contenu.items.flatMap(item => {
      if (!('str' in item)) return [];
      // La matrice du fragment dans l'espace de la page vue a l'echelle 1 (origine en haut a gauche, rotation comprise).
      const t = m.Util.transform(unite.transform, item.transform) as number[];
      const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = t;
      const style = contenu.styles[item.fontName];
      let nom = '', gras = false, italique = false;
      if (page.commonObjs.has(item.fontName)) {
        const police = page.commonObjs.get(item.fontName) as { name?: string; bold?: boolean; italic?: boolean } | undefined;
        nom = police?.name ?? ''; gras = police?.bold === true; italique = police?.italic === true;
      }
      const lue = lirePolice(nom, style?.fontFamily ?? '');
      return [{
        texte: item.str, x: e, y: f, largeur: item.width, taille: Math.hypot(c, d) || item.height,
        angle: (Math.atan2(b, a) * 180) / Math.PI, ascendante: style?.ascent ?? 0.8,
        police: lue.police, gras: gras || lue.gras, italique: italique || lue.italique, fin: item.hasEOL
      }];
    });
    const lignes = lignesPosees(fragments);
    const complete = await dessiner(undefined);
    const lire = (toile: HTMLCanvasElement) => {
      const donnees = toile.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, toile.width, toile.height).data ?? new Uint8ClampedArray();
      return { donnees, largeur: toile.width, hauteur: toile.height };
    };
    const avec = lire(complete), sans = lire(fond);
    complete.width = 0;
    const colorees = lignes.map(l => {
      // La boite de la ligne en pixels ; une ligne tournee se lit dans sa boite englobante.
      const rad = (l.angle * Math.PI) / 180, longueur = l.largeur, haut = l.taille * 1.2;
      const xs = [0, Math.cos(rad) * longueur, -Math.sin(rad) * haut, Math.cos(rad) * longueur - Math.sin(rad) * haut].map(v => (l.x + v) * echelle);
      const ys = [0, Math.sin(rad) * longueur, Math.cos(rad) * haut, Math.sin(rad) * longueur + Math.cos(rad) * haut].map(v => (l.haut + v) * echelle);
      const boite = { x: Math.min(...xs), y: Math.min(...ys), largeur: Math.max(...xs) - Math.min(...xs), hauteur: Math.max(...ys) - Math.min(...ys) };
      return { ...l, couleur: couleurDuTexte(avec, sans, boite) };
    });
    // Un texte entierement invisible est la couche OCR d'un scan : la page est une image, a reconnaitre au besoin.
    return { image: await encoder(fond, format), lignes: colorees, scannee: colorees.every(l => l.couleur === null) };
  });
}

/** Une page dessinee a la largeur demandee, pour la reconnaissance de caracteres (le texte au fil d'un scan). */
export function toileDePage(id: string, index: number, rotation: Quart, largeur: number): Promise<HTMLCanvasElement> {
  return aTonTour(() => rendre(id, index, rotation, largeur));
}

/**
 * Une page scannee rendue modifiable (ADR-0007) : dessinee a `largeurOcr` pixels (300 dpi), reconnue par `reconnaitre`
 * (io/ocr.ts), ses lignes sures effacees de l'image (couvertes par la couleur du papier, leur encre lue avant), puis
 * l'image ramenee a `largeurFond` pour servir de fond. `largeurPoints` est la largeur vue de la page, en points.
 */
export async function pageScannee(
  id: string, index: number, rotation: Quart, largeurPoints: number, largeurOcr: number, largeurFond: number, format: 'jpeg' | 'png',
  reconnaitre: (toile: HTMLCanvasElement) => Promise<ParagrapheOcr[]>
): Promise<{ image: Uint8Array; lignes: LigneColoree[] }> {
  const toile = await toileDePage(id, index, rotation, largeurOcr);
  const paragraphes = await reconnaitre(toile);
  const lignes = lignesOcrPosees(paragraphes, largeurPoints / toile.width);
  const boites = boitesOcr(paragraphes);
  const contexte = toile.getContext('2d', { willReadFrequently: true });
  let couleurs: (string | null)[] = boites.map(() => null);
  if (contexte !== null && boites.length > 0) {
    const image = contexte.getImageData(0, 0, toile.width, toile.height);
    couleurs = effacerLignes({ donnees: image.data, largeur: toile.width, hauteur: toile.height }, boites);
    contexte.putImageData(image, 0, 0);
  }
  const fond = document.createElement('canvas');
  fond.width = Math.max(1, Math.round(largeurFond));
  fond.height = Math.max(1, Math.round(toile.height * largeurFond / toile.width));
  const c = fond.getContext('2d');
  if (c !== null) { c.imageSmoothingQuality = 'high'; c.drawImage(toile, 0, 0, fond.width, fond.height); }
  toile.width = 0;
  // Une ligne dont l'encre ne se distingue pas du papier reste noire : elle a ete reconnue, elle se lit.
  return { image: await encoder(fond, format), lignes: lignes.map((l, i) => ({ ...l, couleur: couleurs[i] ?? '000000' })) };
}
