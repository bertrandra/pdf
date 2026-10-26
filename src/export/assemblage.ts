// L'ecriture d'un montage en PDF (ADR-0002) : pdf-lib, epingle exactement, copie les pages des sources dans un
// document neuf, dans l'ordre du montage, et pose la rotation de chacune. Pur et reproductible : aucune date,
// aucun producteur, aucun identifiant tire au hasard (`updateMetadata: false`), donc les memes sources et le meme
// montage rendent les memes octets, aujourd'hui comme demain (tests/unit/export/assemblage.test.ts le verifie).
// Les signets, les liens internes et les formulaires suivent les pages (export/structure.ts, ADR-0008).
//
// Une source se charge une fois par ecriture, meme si vingt de ses pages sont montees : `copyPages` d'un seul
// appel par source garde aussi les ressources partagees (polices, images) en un seul exemplaire. Une scission
// charge ses sources une seule fois pour toutes ses parties (`preparer`, puis `assemblerPrepare` par partie).

import { degrees, PDFDocument, type PDFPage } from 'pdf-lib';
import type { Montage } from '../model/montage.js';
import { au } from '../util/tableaux.js';
import { placeDuNumero, TAILLE_NUMERO, texteDuNumero } from '../engine/numerotation.js';
import { tailleVue } from '../geometry/repere.js';
import { finirStructure, preparerStructure, type PagePosee, type StructureSource } from './structure.js';
import { policeDeSurimpression, poserLignes, repereDe } from './surimpression.js';

/** Les octets de chaque source, par identifiant. Ils vivent dans io ; le montage ne les porte pas. */
export type OctetsDesSources = ReadonlyMap<string, Uint8Array>;

/** Un refus nomme : ce qui manque pour ecrire, dit en francais. */
export class ErreurAssemblage extends Error {
  constructor(message: string) { super(message); this.name = 'ErreurAssemblage'; }
}

/** Les options de chargement d'une source : on lit tel quel, sans rien reecrire de ses metadonnees. */
export const CHARGEMENT = { updateMetadata: false, ignoreEncryption: false } as const;

/** Les sources d'un montage, chargees et preparees une fois, pretes a donner leurs pages a plusieurs documents. */
export interface SourcesPreparees {
  readonly docs: ReadonlyMap<string, PDFDocument>;
  readonly structures: ReadonlyMap<string, StructureSource>;
}

/** Ce qu'on fait d'une page posee, avant l'ecriture : y ajouter un numero, une couche de texte… */
export type Retouche = (page: PDFPage, k: number, sortie: PDFDocument) => void | Promise<void>;

/** Charge et prepare les sources dont le montage a besoin. Refuse une source qui manque, en la nommant. */
export async function preparer(m: Montage, octets: OctetsDesSources): Promise<SourcesPreparees> {
  const docs = new Map<string, PDFDocument>();
  const structures = new Map<string, StructureSource>();
  for (const id of new Set(m.pages.map(p => p.source))) {
    const brut = octets.get(id);
    const nom = m.sources.find(s => s.id === id)?.nom ?? id;
    if (brut === undefined) throw new ErreurAssemblage('Le fichier « ' + nom + ' » n’est plus disponible : rouvrez-le.');
    const doc = await PDFDocument.load(brut, CHARGEMENT);
    docs.set(id, doc);
    structures.set(id, preparerStructure(doc));
  }
  return { docs, structures };
}

/** Ecrit le montage en un seul PDF, a partir de sources deja preparees. Refuse un montage vide. */
export async function assemblerPrepare(m: Montage, sources: SourcesPreparees, retouche?: Retouche): Promise<Uint8Array> {
  if (m.pages.length === 0) throw new ErreurAssemblage('Le document n’a aucune page : ajoutez un PDF avant d’enregistrer.');
  const sortie = await PDFDocument.create({ updateMetadata: false });
  // Une copie par source, de toutes ses pages montees d'un coup, puis on les pose dans l'ordre du montage.
  const copies = new Map<string, Map<number, PDFPage[]>>();
  for (const id of new Set(m.pages.map(p => p.source))) {
    const doc = sources.docs.get(id);
    if (doc === undefined) throw new ErreurAssemblage('Une source manque.');
    const indices = [...new Set(m.pages.filter(p => p.source === id).map(p => p.index))];
    const pages = await sortie.copyPages(doc, indices);
    copies.set(id, new Map(indices.map((index, k) => [index, [au(pages, k)]])));
  }
  const dejaPosees = new Set<object>();
  const posees: PagePosee[] = [];
  for (const page of m.pages) {
    const candidates = copies.get(page.source)?.get(page.index);
    if (candidates === undefined) throw new ErreurAssemblage('La page ' + (page.index + 1) + ' manque dans sa source.');
    // Une page montee deux fois (une page de garde repetee) demande une seconde copie : un objet PDF ne se pose
    // qu'une fois dans l'arbre des pages.
    let copie = candidates.find(c => !dejaPosees.has(c));
    if (copie === undefined) {
      const doc = sources.docs.get(page.source);
      if (doc === undefined) throw new ErreurAssemblage('Une source manque.');
      copie = au(await sortie.copyPages(doc, [page.index]), 0);
      candidates.push(copie);
    }
    dejaPosees.add(copie);
    copie.setRotation(degrees((copie.getRotation().angle + page.rotation) % 360));
    sortie.addPage(copie);
    posees.push({ source: page.source, index: page.index, page: copie });
  }
  finirStructure(sortie, posees, sources.structures, sources.docs);
  if (retouche !== undefined) for (const [k, p] of posees.entries()) await retouche(p.page, k, sortie);
  const numeros = m.numerotation;
  if (numeros !== undefined) {
    const police = await policeDeSurimpression(sortie);
    for (const [k, p] of posees.entries()) {
      const texte = texteDuNumero(numeros, k, posees.length);
      if (texte === null) continue;
      const { boite, rotation } = repereDe(p.page);
      const vue = tailleVue(boite, rotation);
      const { u, v } = placeDuNumero(numeros.position, vue.largeur, vue.hauteur, police.widthOfTextAtSize(texte, TAILLE_NUMERO));
      poserLignes(sortie, p.page, police, [{ texte, u, v, taille: TAILLE_NUMERO, angle: 0, largeur: null }], false);
    }
  }
  return sortie.save({ useObjectStreams: true, updateFieldAppearances: false });
}

/** Ecrit le montage en un seul PDF. Refuse un montage vide ou dont une source manque. */
export async function assembler(m: Montage, octets: OctetsDesSources, retouche?: Retouche): Promise<Uint8Array> {
  if (m.pages.length === 0) throw new ErreurAssemblage('Le document n’a aucune page : ajoutez un PDF avant d’enregistrer.');
  return assemblerPrepare(m, await preparer(m, octets), retouche);
}
