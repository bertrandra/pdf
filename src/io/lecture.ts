// Ouvrir un PDF : lire ce que le montage doit savoir de chaque page (taille, rotation propre), ou refuser en disant
// pourquoi. Rien ne leve : un fichier chiffre, tronque ou qui n'est pas un PDF rend un refus nomme, et la page
// le dit. Les octets ne sont gardes que s'ils se lisent : un montage ne reference jamais un fichier illisible.

import { PDFDocument } from 'pdf-lib';
import { CHARGEMENT } from '../export/assemblage.js';
import type { PageSource, Quart } from '../model/montage.js';

export type PdfLu = { readonly pages: readonly PageSource[] } | { readonly erreur: string };

/** Au-dela, un fichier ne s'ouvre pas : il ne tiendrait pas en memoire avec ses apercus. */
export const TAILLE_MAX = 512 * 1024 * 1024;

/** Vrai si les octets sont ceux d'un PDF (« %PDF- » dans le premier kilo-octet, comme le tolerent les lecteurs). */
export function estPdf(octets: Uint8Array): boolean {
  const debut = octets.subarray(0, 1029);
  for (let i = 0; i + 5 <= debut.length; i++) {
    if (debut[i] === 0x25 && debut[i + 1] === 0x50 && debut[i + 2] === 0x44 && debut[i + 3] === 0x46 && debut[i + 4] === 0x2d) return true;
  }
  return false;
}

/** Vrai si un fichier choisi ou depose se presente comme un PDF (son type, ou son extension faute de type). */
export const fichierPdf = (f: { readonly name: string; readonly type: string }): boolean => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

const quart = (angle: number): Quart => ((((Math.round(angle / 90) * 90) % 360) + 360) % 360) as Quart;

/** Lit les pages d'un PDF. */
export async function lirePdf(octets: Uint8Array): Promise<PdfLu> {
  if (octets.length > TAILLE_MAX) return { erreur: 'Fichier trop gros : plus de 512 Mo.' };
  if (!estPdf(octets)) return { erreur: 'Ce fichier n’est pas un PDF.' };
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(octets, CHARGEMENT);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (/encrypt/i.test(message)) return { erreur: 'Ce PDF est protégé par un mot de passe : retirez la protection, puis rouvrez-le.' };
    return { erreur: 'Ce PDF est illisible (fichier tronqué ou abîmé).' };
  }
  const pages = doc.getPages().map(p => {
    // La taille vue est celle de la boite de recadrage (CropBox), comme dans tout lecteur ; elle retombe sur
    // la MediaBox quand la page n'en a pas.
    const { width, height } = p.getCropBox();
    return { largeur: Math.abs(width), hauteur: Math.abs(height), rotation: quart(p.getRotation().angle) };
  });
  if (pages.length === 0) return { erreur: 'Ce PDF n’a aucune page.' };
  return { pages };
}
