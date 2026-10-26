// Ce qui survit a la fusion (ADR-0008) : les signets, les liens internes et les champs de formulaire. `copyPages` de
// pdf-lib ne copie que les pages ; sans ce module, un document fusionne perd son sommaire, ses champs ne se remplissent
// plus, et un lien vers une autre page entraine dans le fichier une copie orpheline de la page visee (et tout ce
// qu'elle dessine) au lieu de mener a la page posee.
//
// Deux temps :
// - `preparerStructure`, une fois par source chargee, AVANT toute copie : chaque annotation perd son /P (la page qui
//   la porte, qui se reecrit apres la copie), et chaque lien interne voit sa destination ramenee a l'index de la page
//   visee (un nombre a la place de la reference : la copie ne suit plus rien). Les signets se lisent en arbre pur
//   (engine/signets.ts). On ne modifie que la lecture en memoire : les octets de la source ne changent jamais.
// - `finirStructure`, une fois par document ecrit, APRES avoir pose les pages : les liens retrouvent la page posee
//   (ou disparaissent si elle n'est pas dans ce document), les champs dont un widget est pose forment le formulaire,
//   les signets gardes s'ecrivent, et les objets que plus rien ne reference sont retires.
//
// Tout est determine par les sources et le montage : aucun identifiant tire, aucune date.

import {
  PDFArray, PDFDict, PDFHexString, PDFName, PDFNull, PDFNumber, PDFObjectCopier, PDFRef, PDFStream, PDFString,
  type PDFContext, type PDFDocument, type PDFObject, type PDFPage
} from 'pdf-lib';
import { compteSignet, descendantsVisibles, fusionnerSignets, poserSignets, type Signet, type SignetPose } from '../engine/signets.js';

const N = {
  A: PDFName.of('A'), AcroForm: PDFName.of('AcroForm'), Annots: PDFName.of('Annots'), C: PDFName.of('C'),
  Count: PDFName.of('Count'), D: PDFName.of('D'), DA: PDFName.of('DA'), DR: PDFName.of('DR'), Dest: PDFName.of('Dest'),
  Dests: PDFName.of('Dests'), F: PDFName.of('F'), Fields: PDFName.of('Fields'), First: PDFName.of('First'),
  Font: PDFName.of('Font'), GoTo: PDFName.of('GoTo'), Kids: PDFName.of('Kids'), Last: PDFName.of('Last'),
  Limits: PDFName.of('Limits'), Link: PDFName.of('Link'), Names: PDFName.of('Names'), NeedAppearances: PDFName.of('NeedAppearances'),
  Next: PDFName.of('Next'), Outlines: PDFName.of('Outlines'), P: PDFName.of('P'), PageMode: PDFName.of('PageMode'),
  Parent: PDFName.of('Parent'), Prev: PDFName.of('Prev'), Q: PDFName.of('Q'), S: PDFName.of('S'), Subtype: PDFName.of('Subtype'),
  T: PDFName.of('T'), Title: PDFName.of('Title'), Type: PDFName.of('Type'), UseOutlines: PDFName.of('UseOutlines'),
  Widget: PDFName.of('Widget'), XYZ: PDFName.of('XYZ')
};

/** Ce qu'un signet emporte du fichier source : son titre, sa couleur, son style, et la fin de sa destination. */
export interface DonneesSignet {
  readonly titre: PDFObject;
  readonly couleur: PDFObject | undefined;
  readonly style: PDFObject | undefined;
  /** La destination apres la page (`/XYZ 0 800 null`, `/Fit`…), ou null si le signet n'en a pas de propre. */
  readonly reste: readonly PDFObject[] | null;
}

/** La structure d'une source, lue une fois : ses signets, son formulaire, et si elle s'ouvre sur ses signets. */
export interface StructureSource {
  readonly signets: readonly Signet<DonneesSignet>[];
  readonly formulaire: PDFDict | undefined;
  readonly ouvrirSurSignets: boolean;
}

/** Une page posee dans le document ecrit : d'ou elle vient, et sa copie. */
export interface PagePosee { readonly source: string; readonly index: number; readonly page: PDFPage }

const dict = (o: PDFObject | undefined): PDFDict | undefined => (o instanceof PDFDict ? o : undefined);
const tableau = (o: PDFObject | undefined): PDFArray | undefined => (o instanceof PDFArray ? o : undefined);
const texte = (o: PDFObject | undefined): string | undefined =>
  o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : o instanceof PDFName ? o.decodeText() : undefined;

/** Les destinations nommees d'un document : l'ancien dictionnaire /Dests et l'arbre de noms /Names /Dests. */
function destinationsNommees(doc: PDFDocument): Map<string, PDFObject> {
  const noms = new Map<string, PDFObject>();
  const ctx = doc.context;
  const anciennes = dict(doc.catalog.lookup(N.Dests));
  for (const [cle, valeur] of anciennes?.entries() ?? []) noms.set(cle.decodeText(), valeur);
  const vus = new Set<PDFDict>();
  const parcourir = (noeud: PDFDict | undefined) => {
    if (noeud === undefined || vus.has(noeud)) return;
    vus.add(noeud);
    const paires = tableau(noeud.lookup(N.Names));
    for (let i = 0; paires !== undefined && i + 1 < paires.size(); i += 2) {
      const cle = texte(ctx.lookup(paires.get(i)));
      if (cle !== undefined && !noms.has(cle)) noms.set(cle, paires.get(i + 1));
    }
    for (const enfant of tableau(noeud.lookup(N.Kids))?.asArray() ?? []) parcourir(dict(ctx.lookup(enfant)));
  };
  parcourir(dict(dict(doc.catalog.lookup(N.Names))?.lookup(N.Dests)));
  return noms;
}

/**
 * La destination explicite d'une destination brute (un tableau, un nom, ou un dictionnaire { D: … }), ramenee a
 * l'index de la page visee dans `pages` ; undefined si elle ne vise aucune page du document.
 */
function lireDestination(ctx: PDFContext, brute: PDFObject | undefined, noms: () => Map<string, PDFObject>, pages: ReadonlyMap<PDFRef, number>):
  { index: number; reste: PDFObject[] } | undefined {
  let valeur = brute instanceof PDFRef ? ctx.lookup(brute) : brute;
  const nom = texte(valeur);
  if (nom !== undefined) valeur = ctx.lookup(noms().get(nom));
  const d = dict(valeur);
  if (d !== undefined) valeur = d.lookup(N.D);
  const t = tableau(valeur);
  const premier = t?.get(0);
  if (t === undefined || !(premier instanceof PDFRef)) return undefined;
  const index = pages.get(premier);
  return index === undefined ? undefined : { index, reste: t.asArray().slice(1).map(o => ctx.lookup(o) ?? PDFNull) };
}

/** La destination d'un lien interne : sa /Dest, ou le /D de son action GoTo ; avec ou les reecrire. */
function destinationDeLien(annot: PDFDict): { brute: PDFObject | undefined; poser: (d: PDFArray) => void } | undefined {
  if (annot.get(N.Subtype) !== N.Link) return undefined;
  if (annot.has(N.Dest)) return { brute: annot.get(N.Dest), poser: d => annot.set(N.Dest, d) };
  const action = dict(annot.lookup(N.A));
  if (action === undefined || action.get(N.S) !== N.GoTo) return undefined;
  return { brute: action.get(N.D), poser: d => action.set(N.D, d) };
}

/** Lit l'arbre des signets d'une source, en gardant la trace des noeuds vus (un fichier abime peut boucler). */
function lireSignets(ctx: PDFContext, premier: PDFObject | undefined, destination: (brute: PDFObject | undefined) => { index: number; reste: PDFObject[] } | undefined, vus: Set<PDFDict>): Signet<DonneesSignet>[] {
  const signets: Signet<DonneesSignet>[] = [];
  let courant = dict(ctx.lookup(premier));
  while (courant !== undefined && !vus.has(courant)) {
    vus.add(courant);
    const action = dict(courant.lookup(N.A));
    const cible = destination(courant.has(N.Dest) ? courant.get(N.Dest) : action?.get(N.S) === N.GoTo ? action.get(N.D) : undefined);
    const compte = courant.lookup(N.Count);
    signets.push({
      donnees: {
        titre: courant.lookup(N.Title) ?? PDFHexString.fromText(''),
        couleur: courant.lookup(N.C), style: courant.lookup(N.F), reste: cible?.reste ?? null
      },
      page: cible?.index ?? null,
      ouvert: compte instanceof PDFNumber && compte.asNumber() > 0,
      enfants: lireSignets(ctx, courant.get(N.First), destination, vus)
    });
    courant = dict(ctx.lookup(courant.get(N.Next)));
  }
  return signets;
}

/**
 * Prepare une source chargee, avant toute copie de ses pages (voir l'en-tete). A n'appeler qu'une fois par chargement :
 * une destination deja ramenee a un index n'est plus reconnue comme interne.
 */
export function preparerStructure(doc: PDFDocument): StructureSource {
  const ctx = doc.context;
  const refs = doc.getPages().map(p => p.ref);
  const pages = new Map(refs.map((r, i) => [r, i]));
  let noms: Map<string, PDFObject> | undefined;
  const nommees = () => (noms ??= destinationsNommees(doc));
  const destination = (brute: PDFObject | undefined) => lireDestination(ctx, brute, nommees, pages);

  // Les signets d'abord : une action partagee avec un lien serait sinon deja ramenee a un index.
  const racine = dict(doc.catalog.lookup(N.Outlines));
  const signets = racine === undefined ? [] : lireSignets(ctx, racine.get(N.First), destination, new Set());
  for (const page of doc.getPages()) {
    for (const entree of page.node.Annots()?.asArray() ?? []) {
      const annot = dict(ctx.lookup(entree));
      if (annot === undefined) continue;
      annot.delete(N.P);
      const lien = destinationDeLien(annot);
      const cible = lien === undefined ? undefined : destination(lien.brute);
      if (lien !== undefined && cible !== undefined) lien.poser(ctx.obj([PDFNumber.of(cible.index), ...cible.reste]));
    }
  }
  return {
    signets,
    formulaire: dict(doc.catalog.lookup(N.AcroForm)),
    ouvrirSurSignets: doc.catalog.get(N.PageMode) === N.UseOutlines
  };
}

/** Les liens de chaque page posee menent a la page posee qu'ils visaient, ou disparaissent ; chaque annotation retrouve sa page. */
function finirLiens(ctx: PDFContext, posees: readonly PagePosee[], position: (source: string, index: number) => number | undefined): void {
  for (const posee of posees) {
    const annots = posee.page.node.Annots();
    if (annots === undefined) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const annot = dict(ctx.lookup(annots.get(i)));
      if (annot === undefined) continue;
      annot.set(N.P, posee.page.ref);
      const lien = destinationDeLien(annot);
      const dest = lien === undefined ? undefined : tableau(ctx.lookup(lien.brute));
      const marque = dest?.get(0);
      if (lien === undefined || dest === undefined || !(marque instanceof PDFNumber)) continue;
      const cible = position(posee.source, marque.asNumber());
      const page = cible === undefined ? undefined : posees[cible]?.page;
      // Un lien vers une page qui n'est pas dans ce document ne menerait nulle part : il part.
      if (page === undefined) annots.remove(i);
      else lien.poser(ctx.obj([page.ref, ...dest.asArray().slice(1)]));
    }
  }
}

const estWidget = (d: PDFDict): boolean => d.get(N.Subtype) === N.Widget;

/** Ne garde, sous un champ, que les widgets poses et les champs qui en ont encore ; rend vrai si le champ reste. */
function elaguerChamp(ctx: PDFContext, champ: PDFDict, ref: PDFRef | undefined, poses: ReadonlySet<PDFRef>, vus: Set<PDFDict>): boolean {
  if (vus.has(champ)) return false;
  vus.add(champ);
  const enfants = tableau(champ.lookup(N.Kids));
  if (enfants === undefined) return estWidget(champ) && ref !== undefined && poses.has(ref);
  const gardes = enfants.asArray().filter(k => {
    const d = dict(ctx.lookup(k));
    return d !== undefined && elaguerChamp(ctx, d, k instanceof PDFRef ? k : undefined, poses, vus);
  });
  champ.set(N.Kids, ctx.obj(gardes));
  return gardes.length > 0;
}

/**
 * Le formulaire du document ecrit : les champs racines des widgets poses, dans l'ordre ou ils apparaissent, elagues
 * des widgets restes dans les pages non posees. Deux champs differents de meme nom (deux sources, ou une page posee
 * deux fois) partageraient leur valeur : le second prend un suffixe. Les reglages (/DA, /Q, /NeedAppearances) viennent
 * de la premiere source qui en a, les polices (/DR /Font) de toutes.
 */
function finirFormulaire(sortie: PDFDocument, posees: readonly PagePosee[], structures: ReadonlyMap<string, StructureSource>, chargees: ReadonlyMap<string, PDFDocument>): void {
  const ctx = sortie.context;
  const poses = new Set<PDFRef>();
  const racines: { ref: PDFRef; champ: PDFDict }[] = [];
  const vues = new Set<PDFRef>();
  for (const posee of posees) {
    const annots = posee.page.node.Annots();
    for (let i = 0; annots !== undefined && i < annots.size(); i++) {
      const brute = annots.get(i);
      const annot = dict(ctx.lookup(brute));
      if (annot === undefined || !estWidget(annot)) continue;
      // Un champ se designe par reference : un widget ecrit en direct dans /Annots en recoit une.
      const entree = brute instanceof PDFRef ? brute : ctx.register(annot);
      if (entree !== brute) annots.set(i, entree);
      poses.add(entree);
      let ref: PDFRef = entree, champ = annot;
      for (let parent = champ.get(N.Parent), garde = 0; parent instanceof PDFRef && garde < 64; parent = champ.get(N.Parent), garde++) {
        const d = dict(ctx.lookup(parent));
        if (d === undefined) break;
        ref = parent; champ = d;
      }
      if (!vues.has(ref)) { vues.add(ref); racines.push({ ref, champ }); }
    }
  }
  const vus = new Set<PDFDict>();
  const gardees = racines.filter(r => elaguerChamp(ctx, r.champ, r.ref, poses, vus));
  if (gardees.length === 0) return;

  const pris = new Map<string, number>();
  for (const { champ } of gardees) {
    const nom = texte(champ.lookup(N.T));
    if (nom === undefined) continue;
    const n = (pris.get(nom) ?? 0) + 1;
    pris.set(nom, n);
    if (n > 1) {
      let nouveau = nom + '_' + n;
      while (pris.has(nouveau)) nouveau += '_';
      pris.set(nouveau, 1);
      champ.set(N.T, PDFHexString.fromText(nouveau));
    }
  }

  const formulaire = ctx.obj({});
  formulaire.set(N.Fields, ctx.obj(gardees.map(r => r.ref)));
  const polices = ctx.obj({});
  const ordre = [...new Set(posees.map(p => p.source))];
  for (const id of ordre) {
    const source = structures.get(id)?.formulaire, doc = chargees.get(id);
    if (source === undefined || doc === undefined) continue;
    const copieur = PDFObjectCopier.for(doc.context, ctx);
    for (const cle of [N.DA, N.Q]) {
      const v = source.get(cle);
      if (v !== undefined && !formulaire.has(cle)) formulaire.set(cle, copieur.copy(v));
    }
    if (source.lookup(N.NeedAppearances) !== undefined && !formulaire.has(N.NeedAppearances)) formulaire.set(N.NeedAppearances, copieur.copy(source.lookup(N.NeedAppearances) as PDFObject));
    const sesPolices = dict(dict(source.lookup(N.DR))?.lookup(N.Font));
    for (const [nom, police] of sesPolices?.entries() ?? []) if (!polices.has(nom)) polices.set(nom, copieur.copy(police));
  }
  if (polices.keys().length > 0) formulaire.set(N.DR, ctx.obj({ Font: polices }));
  sortie.catalog.set(N.AcroForm, ctx.register(formulaire));
}

/** Ecrit les signets gardes sous la racine /Outlines du document ecrit. */
function finirSignets(sortie: PDFDocument, signets: readonly SignetPose<DonneesSignet>[], posees: readonly PagePosee[]): void {
  if (signets.length === 0) return;
  const ctx = sortie.context;
  const racine = ctx.nextRef();
  const ecrire = (liste: readonly SignetPose<DonneesSignet>[], parent: PDFRef): PDFRef[] => {
    const refs = liste.map(() => ctx.nextRef());
    liste.forEach((s, k) => {
      const page = posees[s.position]?.page.ref ?? PDFNull;
      const d = ctx.obj({});
      d.set(N.Title, s.donnees.titre);
      d.set(N.Parent, parent);
      const prev = refs[k - 1], next = refs[k + 1];
      if (prev !== undefined) d.set(N.Prev, prev);
      if (next !== undefined) d.set(N.Next, next);
      const enfants = ecrire(s.enfants, refs[k] as PDFRef);
      const premier = enfants[0], dernier = enfants[enfants.length - 1];
      if (premier !== undefined && dernier !== undefined) { d.set(N.First, premier); d.set(N.Last, dernier); }
      const compte = compteSignet(s);
      if (compte !== null) d.set(N.Count, PDFNumber.of(compte));
      const reste = s.propre && s.donnees.reste !== null ? s.donnees.reste : [N.XYZ, PDFNull, PDFNull, PDFNull];
      d.set(N.Dest, ctx.obj([page, ...reste]));
      if (s.donnees.couleur instanceof PDFArray) d.set(N.C, s.donnees.couleur.clone(ctx));
      if (s.donnees.style !== undefined) d.set(N.F, s.donnees.style);
      ctx.assign(refs[k] as PDFRef, d);
    });
    return refs;
  };
  const haut = ecrire(signets, racine);
  const d = ctx.obj({});
  d.set(N.Type, N.Outlines);
  d.set(N.First, haut[0] as PDFRef);
  d.set(N.Last, haut[haut.length - 1] as PDFRef);
  d.set(N.Count, PDFNumber.of(descendantsVisibles({ enfants: signets })));
  ctx.assign(racine, d);
  sortie.catalog.set(N.Outlines, racine);
}

/**
 * Retire les objets que plus rien ne reference depuis la racine du document : les widgets restes sous un champ elague,
 * ou tout ce qu'une copie aurait entraine sans qu'une page posee s'en serve.
 */
function retirerOrphelins(ctx: PDFContext): void {
  const atteints = new Set<PDFRef>();
  const pile: PDFObject[] = [ctx.trailerInfo.Root, ctx.trailerInfo.Info].filter((o): o is PDFObject => o !== undefined);
  for (let o = pile.pop(); o !== undefined; o = pile.pop()) {
    if (o instanceof PDFRef) {
      if (atteints.has(o)) continue;
      atteints.add(o);
      const v = ctx.lookup(o);
      if (v !== undefined) pile.push(v);
    } else if (o instanceof PDFDict) pile.push(...o.values());
    else if (o instanceof PDFArray) pile.push(...o.asArray());
    else if (o instanceof PDFStream) pile.push(...o.dict.values());
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!atteints.has(ref)) ctx.delete(ref);
}

/** Acheve le document ecrit, une fois ses pages posees dans l'ordre du montage (voir l'en-tete). */
export function finirStructure(sortie: PDFDocument, posees: readonly PagePosee[], structures: ReadonlyMap<string, StructureSource>, chargees: ReadonlyMap<string, PDFDocument>): void {
  const premieres = new Map<string, number>();
  posees.forEach((p, k) => { const cle = p.source + ':' + p.index; if (!premieres.has(cle)) premieres.set(cle, k); });
  const position = (source: string, index: number) => premieres.get(source + ':' + index);

  finirLiens(sortie.context, posees, position);
  finirFormulaire(sortie, posees, structures, chargees);

  const parSource = [...new Set(posees.map(p => p.source))].map(id => ({
    premiere: posees.findIndex(p => p.source === id),
    signets: poserSignets(structures.get(id)?.signets ?? [], index => position(id, index))
  }));
  finirSignets(sortie, fusionnerSignets(parSource), posees);
  if ([...new Set(posees.map(p => p.source))].some(id => structures.get(id)?.ouvrirSurSignets === true) && sortie.catalog.has(N.Outlines)) {
    sortie.catalog.set(N.PageMode, N.UseOutlines);
  }
  retirerOrphelins(sortie.context);
}
