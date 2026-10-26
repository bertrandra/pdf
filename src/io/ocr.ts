// La reconnaissance de caracteres (ADR-0007) : Tesseract 5 en WebAssembly (tesseract.js, epingle exactement), avec
// les modeles « best » de tessdata_best (LSTM en virgule flottante, les plus justes), francais et anglais. Tout est
// servi a cote de la page, dans `ocr/` (scripts/construire.mjs, scripts/modeles-ocr.mjs) : rien ne part sur le
// reseau, aucun CDN n'est contacte, rien n'est garde dans le navigateur.
//
// Les modeles en virgule flottante demandent le coeur sans SIMD (le coeur SIMD n'a que le produit scalaire entier) :
// on lui donne son fichier exact, pour que tesseract.js ne choisisse pas a notre place. C'est plus lent (deux secondes
// environ par page), mais c'est ce qui se trompe le moins (docs/adr/0007).
//
// Pour aller plus vite sans rien perdre en justesse :
// - plusieurs travailleurs reconnaissent plusieurs pages a la fois (`tailleDuPool` : selon les coeurs et la memoire) ;
// - ils restent prets entre deux conversions, et se ferment apres quelques minutes sans travail ;
// - seules les langues choisies se chargent (l'anglais pese quatre fois le francais) ;
// - une page qui se lit mal est essayee dans les quatre sens, a mi-resolution : un scan de cote ou a l'envers se lit
//   dans le bon sens (`reconnaitreRedresse`, engine/ocr.ts `sensDeLecture`).

import { NOTE_DOUTEUSE, noteOcr, sensDeLecture, type BoiteOcr, type ParagrapheOcr, type QuartOcr } from '../engine/ocr.js';

/** Le dossier de l'OCR, relatif a la page. */
export const DOSSIER_OCR = 'ocr/';
/** Les langues que la page sait reconnaitre, dans l'ordre ou Tesseract les essaie. */
export const LANGUES_OCR = ['fra', 'eng'] as const;
export type LangueOcr = typeof LANGUES_OCR[number];
/** Le nom de chaque langue, pour la boite de conversion. */
export const NOMS_LANGUES: Record<LangueOcr, string> = { fra: 'Français', eng: 'Anglais' };
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
interface TesseractGlobal { createWorker(langues: readonly { code: string; data: unknown }[], oem: number, options: object): Promise<Travailleur> }

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

/**
 * Le manifeste d'un modele (`ocr/langues/<langue>.json`, ecrit par scripts/modeles-ocr.mjs) : ses parties, dans
 * l'ordre, et leur codage. `gzip` : un seul fichier binaire compresse ; `base64-gzip` : le meme, ecrit en base64 et
 * coupe en morceaux de texte, la seule forme qu'un artefact claude.ai serve pour un fichier de cette taille.
 */
interface Manifeste { readonly codage: 'gzip' | 'base64-gzip'; readonly parties: readonly string[] }

/** Le base64 en octets, sans passer par une chaine de plusieurs millions de caracteres par octet decode. */
function depuisBase64(texte: string): Uint8Array {
  const binaire = atob(texte.replace(/\s+/g, ''));
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

/**
 * Les octets du modele d'une langue, compresses (tesseract.js reconnait le gzip et le decompresse). C'est le seul
 * `fetch` de src/ : il ne lit que des fichiers servis avec la page, dans `ocr/langues/`.
 */
async function modele(base: string, langue: string): Promise<Uint8Array> {
  const lire = async (nom: string) => {
    const r = await fetch(base + 'langues/' + nom);
    if (!r.ok) throw new Error('Le modèle de reconnaissance « ' + langue + ' » est absent de cette page (' + r.status + ').');
    return r;
  };
  const manifeste = await (await lire(langue + '.json')).json() as Manifeste;
  if (manifeste.codage === 'gzip') return new Uint8Array(await (await lire(manifeste.parties[0] ?? '')).arrayBuffer());
  const morceaux = await Promise.all(manifeste.parties.map(async p => depuisBase64(await (await lire(p)).text())));
  const total = new Uint8Array(morceaux.reduce((n, m) => n + m.length, 0));
  let pos = 0;
  for (const m of morceaux) { total.set(m, pos); pos += m.length; }
  return total;
}

/** Les octets d'un modele, lus une fois par seance : changer de langues ou rouvrir les travailleurs ne relit rien. */
const modeles = new Map<string, Promise<Uint8Array>>();
function modeleGarde(base: string, langue: LangueOcr): Promise<Uint8Array> {
  let m = modeles.get(langue);
  if (m === undefined) {
    m = modele(base, langue);
    m.catch(() => modeles.delete(langue));
    modeles.set(langue, m);
  }
  return m;
}

/**
 * Combien de travailleurs : un par paire de coeurs, trois au plus (au-dela, la memoire coute plus que le temps gagne :
 * chaque travailleur garde ses modeles, une centaine de megaoctets), un seul sur une machine de 4 Go ou moins.
 */
export function tailleDuPool(coeurs: number | undefined, memoireGo: number | undefined): number {
  if (memoireGo !== undefined && memoireGo <= 4) return 1;
  return Math.max(1, Math.min(3, Math.floor((coeurs ?? 2) / 2)));
}

/** Un reconnaisseur pret : un ou plusieurs travailleurs Tesseract qui se partagent les pages. */
export interface Reconnaisseur {
  /** Combien de pages il reconnait a la fois. */
  readonly taille: number;
  reconnaitre(toile: HTMLCanvasElement): Promise<ParagrapheOcr[]>;
}

const lireResultat = (data: ResultatBrut['data']): ParagrapheOcr[] => (data.blocks ?? []).flatMap(b => b.paragraphs.map(p => ({
  lignes: p.lines.map(l => ({
    mots: l.words.map(w => ({ texte: w.text, confiance: w.confidence, boite: boite(w.bbox) })),
    boite: boite(l.bbox), ligneDeBase: boite(l.baseline), hauteur: l.rowAttributes.rowHeight
  }))
})));

interface Pool { readonly cle: string; readonly r: Reconnaisseur; fermer(): Promise<void> }

/** Ouvre un pool : le premier travailleur tout de suite, les autres seulement quand des pages attendent. */
async function ouvrirPool(langues: readonly LangueOcr[]): Promise<Pool> {
  const base = new URL(DOSSIER_OCR, document.baseURI).href;
  const [t, ...donnees] = await Promise.all([tesseract(base), ...langues.map(l => modeleGarde(base, l))]);
  const navigateur = navigator as Navigator & { deviceMemory?: number };
  const taille = tailleDuPool(navigateur.hardwareConcurrency, navigateur.deviceMemory);
  const creer = async () => {
    // OEM 1 : le reseau LSTM seul (les modeles « best » n'ont pas l'ancien moteur). Les modeles sont donnes en octets,
    // une copie par travailleur : tesseract.js ne va rien chercher lui-meme.
    const w = await t.createWorker(langues.map((code, i) => ({ code, data: donnees[i]?.slice() })), 1, {
      workerPath: base + 'worker.min.js', corePath: base + 'tesseract-core-lstm.wasm.js', cacheMethod: 'none', workerBlobURL: false
    });
    // Les espaces entre les mots comptent dans une facture ou un tableau : on les garde tels que la page les montre.
    await w.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: String(DPI_OCR) });
    return w;
  };
  const premier = creer();
  const tous: Promise<Travailleur>[] = [premier];
  const libres: Travailleur[] = [await premier];
  const attente: ((w: Travailleur) => void)[] = [];
  const prendre = (): Promise<Travailleur> => {
    const w = libres.pop();
    if (w !== undefined) return Promise.resolve(w);
    if (tous.length < taille) {
      const nouveau = creer();
      tous.push(nouveau);
      // Un travailleur qui ne demarre pas n'empeche pas les autres : on attend le prochain libre.
      nouveau.then(rendre).catch(() => undefined);
    }
    return new Promise(ok => attente.push(ok));
  };
  const rendre = (w: Travailleur) => { const suivant = attente.shift(); if (suivant) suivant(w); else libres.push(w); };
  return {
    cle: langues.join('+'),
    r: {
      taille,
      async reconnaitre(toile) {
        const w = await prendre();
        try { return lireResultat((await w.recognize(toile, {}, { blocks: true, text: false })).data); } finally { rendre(w); }
      }
    },
    async fermer() { await Promise.all(tous.map(p => p.then(w => w.terminate()).catch(() => undefined))); }
  };
}

/** Apres ce delai sans travail, les travailleurs se ferment et rendent leur memoire. */
export const REPOS_OCR = 5 * 60_000;

let ouvert: Promise<Pool> | null = null;
let utilisations = 0;
let minuterie: ReturnType<typeof setTimeout> | null = null;

/**
 * Le reconnaisseur des langues demandees : celui deja ouvert s'il les a, un nouveau sinon (l'ancien se ferme).
 * `chargement` est appele quand il faut charger Tesseract ou ses modeles. A rendre par `relacher` apres usage.
 */
export async function reconnaisseur(langues: readonly LangueOcr[], chargement?: () => void): Promise<Reconnaisseur> {
  const voulues = LANGUES_OCR.filter(l => langues.includes(l));
  if (voulues.length === 0) throw new Error('Choisissez au moins une langue à reconnaître.');
  const cle = voulues.join('+');
  if (minuterie !== null) { clearTimeout(minuterie); minuterie = null; }
  utilisations++;
  const courant = ouvert;
  if (courant !== null) {
    const pool = await courant.catch(() => null);
    if (pool !== null && pool.cle === cle) return pool.r;
    if (ouvert === courant) { ouvert = null; void pool?.fermer(); }
  }
  chargement?.();
  const p = ouvrirPool(voulues);
  ouvert = p;
  p.catch(() => { if (ouvert === p) ouvert = null; });
  try {
    return (await p).r;
  } catch (e) {
    utilisations--;
    throw e;
  }
}

/** Rend un reconnaisseur pris par `reconnaisseur` : sans autre usage pendant `REPOS_OCR`, ses travailleurs se ferment. */
export function relacher(): void {
  utilisations = Math.max(0, utilisations - 1);
  if (utilisations > 0) return;
  if (minuterie !== null) clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    minuterie = null;
    const p = ouvert;
    ouvert = null;
    void p?.then(pool => pool.fermer()).catch(() => undefined);
  }, REPOS_OCR);
}

/** Une toile tournee d'un quart de tour `q` (sens des aiguilles d'une montre) et mise a l'echelle `echelle`. */
export function tournerToile(source: HTMLCanvasElement, q: QuartOcr, echelle = 1): HTMLCanvasElement {
  const l = Math.max(1, Math.round(source.width * echelle)), h = Math.max(1, Math.round(source.height * echelle));
  const toile = document.createElement('canvas');
  const couche = q === 90 || q === 270;
  toile.width = couche ? h : l;
  toile.height = couche ? l : h;
  const c = toile.getContext('2d');
  if (c === null) return toile;
  c.imageSmoothingQuality = 'high';
  if (q === 90) { c.translate(toile.width, 0); c.rotate(Math.PI / 2); }
  else if (q === 180) { c.translate(toile.width, toile.height); c.rotate(Math.PI); }
  else if (q === 270) { c.translate(0, toile.height); c.rotate(-Math.PI / 2); }
  c.drawImage(source, 0, 0, l, h);
  return toile;
}

/** Une page reconnue dans son sens de lecture : ses paragraphes, le quart de tour qu'il a fallu, et la toile lue. */
export interface Redressee { readonly paragraphes: ParagrapheOcr[]; readonly quart: QuartOcr; readonly toile: HTMLCanvasElement }

/**
 * Reconnait une page ; si elle se lit mal, essaie les quatre sens a mi-resolution, et la relit en entier dans celui qui
 * gagne (engine/ocr.ts, `sensDeLecture`). Une page qui se lit bien ne coute rien de plus. La toile rendue est celle
 * qui a ete lue : la page de depart, ou une copie tournee (la page de depart est alors videe).
 */
export async function reconnaitreRedresse(r: Reconnaisseur, toile: HTMLCanvasElement): Promise<Redressee> {
  const droite = await r.reconnaitre(toile);
  if (noteOcr(droite) >= NOTE_DOUTEUSE) return { paragraphes: droite, quart: 0, toile };
  const petite = tournerToile(toile, 0, 0.5);
  const essais = await Promise.all(([0, 90, 180, 270] as const).map(async q => {
    const t = q === 0 ? petite : tournerToile(petite, q);
    const note = noteOcr(await r.reconnaitre(t));
    if (q !== 0) t.width = 0;
    return [q, note] as const;
  }));
  petite.width = 0;
  const q = sensDeLecture(new Map(essais));
  if (q === 0) return { paragraphes: droite, quart: 0, toile };
  const tournee = tournerToile(toile, q);
  toile.width = 0;
  return { paragraphes: await r.reconnaitre(tournee), quart: q, toile: tournee };
}
