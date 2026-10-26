// L'ecriture d'un montage en PDF (ADR-0002) : pdf-lib, epingle exactement, copie les pages des sources dans un
// document neuf, dans l'ordre du montage, et pose la rotation de chacune. Pur et reproductible : aucune date,
// aucun producteur, aucun identifiant tire au hasard (`updateMetadata: false`), donc les memes sources et le meme
// montage rendent les memes octets, aujourd'hui comme demain (tests/unit/export/assemblage.test.ts le verifie).
//
// Une source se charge une fois par ecriture, meme si vingt de ses pages sont montees : `copyPages` d'un seul
// appel par source garde aussi les ressources partagees (polices, images) en un seul exemplaire.

import { degrees, PDFDocument, type PDFPage } from 'pdf-lib';
import type { Montage } from '../model/montage.js';
import { au } from '../util/tableaux.js';

/** Les octets de chaque source, par identifiant. Ils vivent dans io ; le montage ne les porte pas. */
export type OctetsDesSources = ReadonlyMap<string, Uint8Array>;

/** Un refus nomme : ce qui manque pour ecrire, dit en francais. */
export class ErreurAssemblage extends Error {
  constructor(message: string) { super(message); this.name = 'ErreurAssemblage'; }
}

/** Les options de chargement d'une source : on lit tel quel, sans rien reecrire de ses metadonnees. */
export const CHARGEMENT = { updateMetadata: false, ignoreEncryption: false } as const;

/** Ecrit le montage en un seul PDF. Refuse un montage vide ou dont une source manque. */
export async function assembler(m: Montage, octets: OctetsDesSources): Promise<Uint8Array> {
  if (m.pages.length === 0) throw new ErreurAssemblage('Le document n’a aucune page : ajoutez un PDF avant d’enregistrer.');
  const sortie = await PDFDocument.create({ updateMetadata: false });
  const chargees = new Map<string, PDFDocument>();
  for (const id of new Set(m.pages.map(p => p.source))) {
    const brut = octets.get(id);
    const nom = m.sources.find(s => s.id === id)?.nom ?? id;
    if (brut === undefined) throw new ErreurAssemblage('Le fichier « ' + nom + ' » n’est plus disponible : rouvrez-le.');
    chargees.set(id, await PDFDocument.load(brut, CHARGEMENT));
  }
  // Une copie par source, de toutes ses pages montees d'un coup, puis on les pose dans l'ordre du montage.
  const copies = new Map<string, Map<number, PDFPage[]>>();
  for (const [id, doc] of chargees) {
    const indices = [...new Set(m.pages.filter(p => p.source === id).map(p => p.index))];
    const pages = await sortie.copyPages(doc, indices);
    copies.set(id, new Map(indices.map((index, k) => [index, [au(pages, k)]])));
  }
  const dejaPosees = new Set<object>();
  for (const page of m.pages) {
    const candidates = copies.get(page.source)?.get(page.index);
    if (candidates === undefined) throw new ErreurAssemblage('La page ' + (page.index + 1) + ' manque dans sa source.');
    // Une page montee deux fois (une page de garde repetee) demande une seconde copie : un objet PDF ne se pose
    // qu'une fois dans l'arbre des pages.
    let copie = candidates.find(c => !dejaPosees.has(c));
    if (copie === undefined) {
      const doc = chargees.get(page.source);
      if (doc === undefined) throw new ErreurAssemblage('Une source manque.');
      copie = au(await sortie.copyPages(doc, [page.index]), 0);
      candidates.push(copie);
    }
    dejaPosees.add(copie);
    copie.setRotation(degrees((copie.getRotation().angle + page.rotation) % 360));
    sortie.addPage(copie);
  }
  return sortie.save({ useObjectStreams: true, updateFieldAppearances: false });
}
