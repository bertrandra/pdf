// Des PDF temoins, fabriques par pdf-lib : chaque page porte son numero et sa taille, pour qu'un test sache
// quelle page il lit apres une fusion ou une scission sans comparer des images.

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNull, PDFNumber, PDFRef, PDFString, StandardFonts, degrees, type PDFObject } from 'pdf-lib';

export interface PageTemoin { largeur: number; hauteur: number; rotation?: number }

/** Un PDF de pages temoins ; `titre` s'ecrit sur chacune, suivi de son numero. Les metadonnees sont fixes. */
export async function pdfTemoin(titre: string, pages: readonly PageTemoin[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const police = await doc.embedFont(StandardFonts.Helvetica);
  pages.forEach((p, i) => {
    const page = doc.addPage([p.largeur, p.hauteur]);
    page.drawText(titre + ' ' + (i + 1), { x: 20, y: p.hauteur / 2, size: 24, font: police });
    if (p.rotation !== undefined) page.setRotation(degrees(p.rotation));
  });
  return doc.save();
}

/** Les tailles (et rotations) des pages d'un PDF, pour comparer un resultat a ce qu'on attend. */
export async function pagesDe(octets: Uint8Array): Promise<{ largeur: number; hauteur: number; rotation: number }[]> {
  const doc = await PDFDocument.load(octets, { updateMetadata: false });
  return doc.getPages().map(p => ({ largeur: p.getWidth(), hauteur: p.getHeight(), rotation: p.getRotation().angle }));
}

/** Des pages A4 portrait, autant qu'il en faut. */
export const a4 = (n: number): PageTemoin[] => Array.from({ length: n }, () => ({ largeur: 595, hauteur: 842 }));

/**
 * Un PDF a structure, de quatre pages temoins : des signets (« Chapitre 1 » vers la page 1, son enfant « Section 1.1 »
 * vers la 2 ; « Chapitre 2 », ferme, vers la 3 par une destination nommee, son enfant « Annexe » vers la 4), deux liens
 * (page 1 vers la 3 par /Dest, page 2 vers la 4 par une action GoTo nommee), un champ « nom » sur la page 1 et un champ
 * « visa » a deux widgets, pages 2 et 4. Tout est ecrit a la main, comme un traitement de texte l'ecrirait.
 */
export async function pdfStructure(titre = 'S'): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await pdfTemoin(titre, a4(4)), { updateMetadata: false });
  const ctx = doc.context;
  const pages = doc.getPages();
  const ref = (i: number) => pages[i]?.ref ?? PDFNull;
  const dest = (i: number) => ctx.obj([ref(i), PDFName.of('XYZ'), 0, 800, PDFNull]);
  // Les destinations nommees : un arbre de noms a une feuille.
  doc.catalog.set(PDFName.of('Names'), ctx.obj({ Dests: ctx.obj({ Names: [PDFString.of('chap2'), dest(2), PDFString.of('annexe'), dest(3)] }) }));
  const [racine, c1, s11, c2, an] = [0, 1, 2, 3, 4].map(() => ctx.nextRef()) as [PDFRef, PDFRef, PDFRef, PDFRef, PDFRef];
  const signet = (titre: string, parent: PDFRef, champs: Record<string, PDFObject>) => {
    const d = ctx.obj({});
    d.set(PDFName.of('Title'), PDFHexString.fromText(titre));
    d.set(PDFName.of('Parent'), parent);
    for (const [k, v] of Object.entries(champs)) d.set(PDFName.of(k), v);
    return d;
  };
  ctx.assign(c1, signet('Chapitre 1', racine, { Dest: dest(0), Next: c2, First: s11, Last: s11, Count: PDFNumber.of(1) }));
  ctx.assign(s11, signet('Section 1.1', c1, { Dest: dest(1) }));
  ctx.assign(c2, signet('Chapitre 2', racine, { Dest: PDFString.of('chap2'), Prev: c1, First: an, Last: an, Count: PDFNumber.of(-1) }));
  ctx.assign(an, signet('Annexe', c2, { A: ctx.obj({ S: 'GoTo', D: PDFString.of('annexe') }) }));
  ctx.assign(racine, ctx.obj({ Type: 'Outlines', First: c1, Last: c2, Count: PDFNumber.of(3) }));
  doc.catalog.set(PDFName.of('Outlines'), racine);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  const lien = (page: number, cible: Record<string, PDFObject>) => {
    const d = ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 100, 40], Border: [0, 0, 0] });
    for (const [k, v] of Object.entries(cible)) d.set(PDFName.of(k), v);
    d.set(PDFName.of('P'), ref(page));
    pages[page]?.node.addAnnot(ctx.register(d));
  };
  lien(0, { Dest: dest(2) });
  lien(1, { A: ctx.obj({ S: 'GoTo', D: PDFString.of('annexe') }) });
  const form = doc.getForm();
  const p0 = pages[0], p1 = pages[1], p3 = pages[3];
  if (p0 && p1 && p3) {
    form.createTextField('nom').addToPage(p0, { x: 50, y: 100, width: 200, height: 20 });
    const visa = form.createTextField('visa');
    visa.addToPage(p1, { x: 50, y: 100, width: 100, height: 20 });
    visa.addToPage(p3, { x: 50, y: 100, width: 100, height: 20 });
  }
  return doc.save({ useObjectStreams: false });
}

/** Ce qu'un PDF ecrit garde de sa structure, lu sans pdf-lib haut niveau pour ne rien lui faire deviner. */
export interface StructureLue {
  /** Les signets, en profondeur : titre, page visee (base 0), /Count. */
  readonly signets: { titre: string; page: number; compte: number | null; enfants: StructureLue['signets'] }[];
  /** Par page, les pages visees par ses liens (base 0), -1 pour une page hors du document. */
  readonly liens: number[][];
  /** Les champs du formulaire : nom et pages de leurs widgets. */
  readonly champs: { nom: string; pages: number[] }[];
  /** Le nombre d'objets de type /Page dans le fichier, arbre des pages ou non. */
  readonly objetsPage: number;
}

export async function lireStructure(octets: Uint8Array): Promise<StructureLue> {
  const doc = await PDFDocument.load(octets, { updateMetadata: false });
  const ctx = doc.context;
  const refs = doc.getPages().map(p => p.ref);
  const indexDe = (o: PDFObject | undefined) => { const i = o instanceof PDFRef ? refs.indexOf(o) : -1; return i; };
  const N = (n: string) => PDFName.of(n);
  const dict = (o: PDFObject | undefined) => { const v = o instanceof PDFRef ? ctx.lookup(o) : o; return v instanceof PDFDict ? v : undefined; };
  const premierDe = (o: PDFObject | undefined) => { const v = o instanceof PDFRef ? ctx.lookup(o) : o; return v instanceof PDFArray ? v.get(0) : undefined; };
  const titre = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : '');
  const signets = (premier: PDFObject | undefined): StructureLue['signets'] => {
    const liste: StructureLue['signets'] = [];
    for (let d = dict(premier); d !== undefined; d = dict(d.get(N('Next')))) {
      const compte = d.lookup(N('Count'));
      liste.push({ titre: titre(d.lookup(N('Title'))), page: indexDe(premierDe(d.get(N('Dest')))), compte: compte instanceof PDFNumber ? compte.asNumber() : null, enfants: signets(d.get(N('First'))) });
    }
    return liste;
  };
  const liens = doc.getPages().map(p => (p.node.Annots()?.asArray() ?? []).flatMap(a => {
    const d = dict(a);
    if (d?.get(N('Subtype')) !== N('Link')) return [];
    const action = dict(d.get(N('A')));
    return [indexDe(premierDe(d.has(N('Dest')) ? d.get(N('Dest')) : action?.get(N('D'))))];
  }));
  const champs = (dict(doc.catalog.get(N('AcroForm')))?.lookup(N('Fields')) as PDFArray | undefined)?.asArray().map(f => {
    const d = dict(f);
    const kids = (d?.lookup(N('Kids')) as PDFArray | undefined)?.asArray() ?? (f instanceof PDFRef ? [f] : []);
    const pages = kids.map(k => doc.getPages().findIndex(p => (p.node.Annots()?.asArray() ?? []).includes(k)));
    return { nom: titre(d?.lookup(N('T'))), pages };
  }) ?? [];
  const objetsPage = ctx.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFDict && o.get(N('Type')) === N('Page')).length;
  return { signets: signets(dict(doc.catalog.get(N('Outlines')))?.get(N('First'))), liens, champs, objetsPage };
}
